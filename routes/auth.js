const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const supabase = require('../db');
const { validatePasswordSecurity, generateAndSendOtp, verifyOtp } = require('../otpHelper');
const verifyToken = require('../middleware/auth');

const router = express.Router();

const REG_NO_REGEX = /^RA\d{14}$/;
const BCRYPT_ROUNDS = 12;
const JWT_EXPIRY = '1d';

// Rate limiting for auth endpoints
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 mins
    max: 15, // max 15 requests per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts from this network. Please try again later.' }
});

const signupLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // max 10 signups per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many registration attempts. Please try again later.' }
});

const otpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 mins
    max: 15, // max 15 OTP attempts
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many OTP verification requests. Please wait before trying again.' }
});

// ============ SIGNUP (WITH ROSTER WHITELIST + OTP) ============
router.post('/signup', signupLimiter, async (req, res) => {
    try {
        const { first_name, last_name, reg_no, password, department, phone, email } = req.body;

        if (!first_name || !last_name || !reg_no || !password || !email) {
            return res.status(400).json({ error: 'First name, last name, registration number, college email, and password are required.' });
        }

        const trimmedRegNo = reg_no.trim();
        const trimmedEmail = email.trim().toLowerCase();
        const trimmedFirstName = first_name.trim();
        const trimmedLastName = last_name.trim();

        // 1. Validate reg_no format: Must start with "RA" followed by exactly 14 digits
        if (!REG_NO_REGEX.test(trimmedRegNo)) {
            return res.status(400).json({ 
                error: 'Invalid registration number format. Must start with "RA" followed by 14 digits (e.g. RA24110030105720).' 
            });
        }

        // 2. Validate password complexity and reject weak/predictable passwords
        const passValidation = validatePasswordSecurity(password, {
            reg_no: trimmedRegNo,
            first_name: trimmedFirstName,
            last_name: trimmedLastName
        });

        if (!passValidation.valid) {
            return res.status(400).json({ error: passValidation.error });
        }

        // 3. Roster whitelist verification: check if student exists in students table
        const { data: studentRecord, error: rosterErr } = await supabase
            .from('students')
            .select('reg_no, name, college_email')
            .eq('reg_no', trimmedRegNo)
            .maybeSingle();

        if (rosterErr) {
            console.error('Roster lookup error:', rosterErr);
            return res.status(500).json({ error: 'Database error verifying student roster record.' });
        }

        if (!studentRecord) {
            return res.status(400).json({
                error: 'Registration number not found in official campus enrollment roster. Contact campus administration if this is an error.'
            });
        }

        // Verify college email matches roster
        if (studentRecord.college_email.trim().toLowerCase() !== trimmedEmail) {
            return res.status(400).json({
                error: 'Email does not match the official college email assigned to this registration number.'
            });
        }

        // 4. Check if registration number or email is already registered
        const { data: existingUser, error: checkErr } = await supabase
            .from('users')
            .select('user_id, reg_no, email')
            .or(`reg_no.eq.${trimmedRegNo},email.eq.${trimmedEmail}`)
            .maybeSingle();

        if (checkErr && checkErr.code !== 'PGRST116') {
            console.error('User check error:', checkErr);
        }

        if (existingUser) {
            return res.status(400).json({ error: 'A student account is already registered with this registration number or email address.' });
        }

        // 5. Hash password with bcrypt rounds 12
        const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

        // 6. Insert new user with email_verified = false
        const { data: insertedUser, error: insertErr } = await supabase
            .from('users')
            .insert([{
                first_name: trimmedFirstName,
                last_name: trimmedLastName,
                reg_no: trimmedRegNo,
                email: trimmedEmail,
                password: hashedPassword,
                department: department ? department.trim() : null,
                phone: phone ? phone.trim() : null,
                email_verified: false,
                failed_attempts: 0,
                locked_until: null,
                is_admin: false
            }])
            .select('user_id, first_name, last_name, reg_no, email, email_verified')
            .single();

        if (insertErr) {
            console.error('User insert error:', insertErr);
            throw insertErr;
        }

        // 7. Send 6-digit OTP for email verification
        await generateAndSendOtp(trimmedEmail, 'verification');

        res.status(201).json({
            message: 'Account created! A 6-digit verification code has been sent to your college email.',
            email: trimmedEmail,
            requires_verification: true
        });
    } catch (err) {
        console.error('Signup error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============ VERIFY EMAIL (OTP) ============
router.post('/verify-email', otpLimiter, async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ error: 'College email and 6-digit OTP code are required.' });
        }

        const trimmedEmail = email.trim().toLowerCase();

        // Verify OTP
        const otpResult = await verifyOtp(trimmedEmail, otp, 'verification');
        if (!otpResult.success) {
            return res.status(400).json({ error: otpResult.error });
        }

        // Mark user as email_verified
        const { data: user, error: updateErr } = await supabase
            .from('users')
            .update({ email_verified: true, failed_attempts: 0, locked_until: null })
            .eq('email', trimmedEmail)
            .select('user_id, first_name, last_name, reg_no, email, is_admin')
            .single();

        if (updateErr || !user) {
            return res.status(404).json({ error: 'User account not found for this email address.' });
        }

        res.json({
            message: 'Email verified successfully! You may now log in to your account.',
            verified: true
        });
    } catch (err) {
        console.error('Email verification error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============ RESEND OTP ============
router.post('/resend-otp', otpLimiter, async (req, res) => {
    try {
        const { email, purpose } = req.body;
        if (!email) {
            return res.status(400).json({ error: 'Email address is required.' });
        }

        const trimmedEmail = email.trim().toLowerCase();
        const otpPurpose = purpose === 'password_reset' ? 'password_reset' : 'verification';

        // Check user existence
        const { data: user } = await supabase
            .from('users')
            .select('user_id, email, email_verified')
            .eq('email', trimmedEmail)
            .maybeSingle();

        if (user) {
            await generateAndSendOtp(trimmedEmail, otpPurpose);
        }

        res.json({ message: 'A new 6-digit verification code has been dispatched to your email.' });
    } catch (err) {
        console.error('Resend OTP error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============ FORGOT PASSWORD ============
router.post('/forgot-password', otpLimiter, async (req, res) => {
    try {
        const { email, reg_no } = req.body;

        if (!email && !reg_no) {
            return res.status(400).json({ error: 'Please provide your registered college email or registration number.' });
        }

        let userQuery = supabase.from('users').select('user_id, email, reg_no');
        if (email) {
            userQuery = userQuery.eq('email', email.trim().toLowerCase());
        } else {
            userQuery = userQuery.eq('reg_no', reg_no.trim());
        }

        const { data: user } = await userQuery.maybeSingle();

        if (user && user.email) {
            await generateAndSendOtp(user.email, 'password_reset');
        }

        // Generic response to avoid account enumeration
        res.json({
            message: 'If a matching account exists, a 6-digit password reset code has been sent to the college email.',
            email: user ? user.email : (email ? email.trim().toLowerCase() : null)
        });
    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============ RESET PASSWORD ============
router.post('/reset-password', otpLimiter, async (req, res) => {
    try {
        const { email, otp, new_password, confirm_password } = req.body;

        if (!email || !otp || !new_password) {
            return res.status(400).json({ error: 'Email, OTP code, and new password are required.' });
        }

        if (confirm_password && new_password !== confirm_password) {
            return res.status(400).json({ error: 'New password and confirmation password do not match.' });
        }

        const trimmedEmail = email.trim().toLowerCase();

        // Fetch user details for password validation
        const { data: user, error: userErr } = await supabase
            .from('users')
            .select('user_id, reg_no, first_name, last_name, email')
            .eq('email', trimmedEmail)
            .maybeSingle();

        if (userErr || !user) {
            return res.status(400).json({ error: 'Invalid password reset request.' });
        }

        // Validate password security
        const passValidation = validatePasswordSecurity(new_password, {
            reg_no: user.reg_no,
            first_name: user.first_name,
            last_name: user.last_name
        });

        if (!passValidation.valid) {
            return res.status(400).json({ error: passValidation.error });
        }

        // Verify OTP
        const otpResult = await verifyOtp(trimmedEmail, otp, 'password_reset');
        if (!otpResult.success) {
            return res.status(400).json({ error: otpResult.error });
        }

        // Hash new password with bcrypt rounds 12
        const hashedPassword = await bcrypt.hash(new_password, BCRYPT_ROUNDS);

        // Update password and unlock account if previously locked
        const { error: updateErr } = await supabase
            .from('users')
            .update({
                password: hashedPassword,
                failed_attempts: 0,
                locked_until: null,
                email_verified: true
            })
            .eq('user_id', user.user_id);

        if (updateErr) throw updateErr;

        res.json({ message: 'Password has been successfully reset! You can now log in with your new credentials.' });
    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============ LOGIN (WITH RATE LIMIT & 5-ATTEMPT LOCKOUT) ============
router.post('/login', loginLimiter, async (req, res) => {
    try {
        const { reg_no, password } = req.body;

        if (!reg_no || !password) {
            return res.status(400).json({ error: 'Registration number and password are required.' });
        }

        const trimmedRegNo = reg_no.trim();

        // Find user by reg_no
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('reg_no', trimmedRegNo)
            .maybeSingle();

        if (error || !user) {
            return res.status(400).json({ error: 'Invalid registration number or password.' });
        }

        // Check account lockout
        if (user.locked_until && new Date() < new Date(user.locked_until)) {
            const minutesLeft = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
            return res.status(403).json({
                error: `Account is temporarily locked due to multiple failed login attempts. Please try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}.`
            });
        }

        // Check email verification status
        if (!user.email_verified) {
            return res.status(403).json({
                error: 'Your college email is not verified. Please verify your email before logging in.',
                email: user.email,
                requires_verification: true
            });
        }

        // Compare password
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            const nextAttempts = (user.failed_attempts || 0) + 1;
            const updateData = { failed_attempts: nextAttempts };

            if (nextAttempts >= 5) {
                updateData.locked_until = new Date(Date.now() + 15 * 60 * 1000).toISOString();
                updateData.failed_attempts = 0;
            }

            await supabase
                .from('users')
                .update(updateData)
                .eq('user_id', user.user_id);

            if (nextAttempts >= 5) {
                return res.status(403).json({
                    error: 'Account locked for 15 minutes due to 5 consecutive failed login attempts.'
                });
            }

            return res.status(400).json({ error: 'Invalid registration number or password.' });
        }

        // Successful login: reset failed attempts & lockout
        if (user.failed_attempts > 0 || user.locked_until) {
            await supabase
                .from('users')
                .update({ failed_attempts: 0, locked_until: null })
                .eq('user_id', user.user_id);
        }

        // Generate JWT token (1-day expiry)
        const token = jwt.sign(
            { 
                user_id: user.user_id, 
                reg_no: user.reg_no,
                is_admin: !!user.is_admin 
            },
            process.env.JWT_SECRET,
            { expiresIn: JWT_EXPIRY }
        );

        res.json({
            message: 'Login successful',
            token,
            user: {
                user_id: user.user_id,
                first_name: user.first_name,
                last_name: user.last_name,
                reg_no: user.reg_no,
                email: user.email,
                is_admin: !!user.is_admin
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============ DEMO QUICK LOGIN (ENABLED ONLY WHEN DEMO_MODE=true) ============
if (process.env.DEMO_MODE === 'true') {
    router.post('/demo-login', async (req, res) => {
        try {
            const { role } = req.body; // 'rahul', 'priya', or 'admin'
            let reg_no = (role === 'priya') ? 'RA71974882626888' : 'RA57943391863820';
            if (role === 'admin') {
                reg_no = 'RA24110030105722';
            }

            let { data: user } = await supabase
                .from('users')
                .select('*')
                .eq('reg_no', reg_no)
                .maybeSingle();

            if (!user) {
                const dummyHash = await bcrypt.hash('DemoPass123!', BCRYPT_ROUNDS);
                const isPriya = (role === 'priya');
                const isAdmin = (role === 'admin');

                const { data: newUser, error: createErr } = await supabase
                    .from('users')
                    .insert([{
                        first_name: isAdmin ? 'Admin' : (isPriya ? 'Priya' : 'Rahul'),
                        last_name: isAdmin ? 'Officer' : (isPriya ? 'Verma' : 'Sharma'),
                        reg_no: reg_no,
                        email: isAdmin ? 'admin@campus.edu' : (isPriya ? 'priya.demo@campus.edu' : 'rahul.demo@campus.edu'),
                        password: dummyHash,
                        department: isAdmin ? 'Campus Security & Administration' : (isPriya ? 'Information Tech' : 'Computer Science'),
                        phone: isAdmin ? '9000000000' : (isPriya ? '9123456780' : '9876543210'),
                        email_verified: true,
                        failed_attempts: 0,
                        locked_until: null,
                        is_admin: isAdmin
                    }])
                    .select()
                    .single();

                if (createErr) throw createErr;
                user = newUser;
            }

            const token = jwt.sign(
                { 
                    user_id: user.user_id, 
                    reg_no: user.reg_no,
                    is_admin: !!user.is_admin
                },
                process.env.JWT_SECRET,
                { expiresIn: JWT_EXPIRY }
            );

            res.json({
                message: `Demo login successful as ${user.first_name}`,
                token,
                user: {
                    user_id: user.user_id,
                    first_name: user.first_name,
                    last_name: user.last_name,
                    reg_no: user.reg_no,
                    email: user.email,
                    is_admin: !!user.is_admin
                }
            });
        } catch (err) {
            console.error('Demo login error:', err);
            res.status(500).json({ error: err.message });
        }
    });
}

// ============ GET LOGGED-IN USER ============
router.get('/me', verifyToken, async (req, res) => {
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('user_id, first_name, last_name, reg_no, email, department, phone, is_admin, email_verified')
            .eq('user_id', req.user.user_id)
            .single();

        if (error || !user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ UPDATE PROFILE ============
router.patch('/profile', verifyToken, async (req, res) => {
    try {
        const user_id = req.user.user_id;
        const { first_name, last_name, department, phone } = req.body;

        if (first_name !== undefined && !first_name.trim()) {
            return res.status(400).json({ error: 'First name cannot be empty' });
        }
        if (last_name !== undefined && !last_name.trim()) {
            return res.status(400).json({ error: 'Last name cannot be empty' });
        }

        const updateData = {};
        if (first_name !== undefined) updateData.first_name = first_name.trim();
        if (last_name !== undefined) updateData.last_name = last_name.trim();
        if (department !== undefined) updateData.department = department ? department.trim() : null;
        if (phone !== undefined) updateData.phone = phone ? phone.trim() : null;

        const { data, error } = await supabase
            .from('users')
            .update(updateData)
            .eq('user_id', user_id)
            .select('user_id, first_name, last_name, reg_no, email, department, phone, is_admin')
            .single();

        if (error) throw error;

        res.json({
            message: 'Profile updated successfully',
            user: data
        });
    } catch (err) {
        console.error('Error updating profile:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============ CHANGE PASSWORD ============
router.patch('/change-password', verifyToken, async (req, res) => {
    try {
        const user_id = req.user.user_id;
        const { old_password, new_password, confirm_new_password } = req.body;

        if (!old_password || !new_password) {
            return res.status(400).json({ error: 'Current password and new password are required' });
        }

        if (confirm_new_password && new_password !== confirm_new_password) {
            return res.status(400).json({ error: 'New password and confirmation do not match' });
        }

        // Fetch current password hash and student details
        const { data: user, error: fetchErr } = await supabase
            .from('users')
            .select('password, reg_no, first_name, last_name')
            .eq('user_id', user_id)
            .single();

        if (fetchErr || !user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Verify old password
        const isMatch = await bcrypt.compare(old_password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Current password is incorrect' });
        }

        // Validate new password security
        const passValidation = validatePasswordSecurity(new_password, {
            reg_no: user.reg_no,
            first_name: user.first_name,
            last_name: user.last_name
        });

        if (!passValidation.valid) {
            return res.status(400).json({ error: passValidation.error });
        }

        // Hash new password (12 rounds) and update
        const hashedPassword = await bcrypt.hash(new_password, BCRYPT_ROUNDS);
        const { error: updateErr } = await supabase
            .from('users')
            .update({ password: hashedPassword })
            .eq('user_id', user_id);

        if (updateErr) throw updateErr;

        res.json({ message: 'Password updated successfully' });
    } catch (err) {
        console.error('Error changing password:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
