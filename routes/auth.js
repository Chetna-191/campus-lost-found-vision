const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../db');

const router = express.Router();

const REG_NO_REGEX = /^RA\d{14}$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{8,}$/;

// ============ SIGNUP ============
router.post('/signup', async (req, res) => {
    try {
        const { first_name, last_name, reg_no, password, department, phone, email } = req.body;

        if (!first_name || !last_name || !reg_no || !password) {
            return res.status(400).json({ error: 'First name, last name, registration number, and password are required' });
        }

        // Validate reg_no format: Must start with "RA" followed by exactly 14 digits (total 16 chars)
        if (!REG_NO_REGEX.test(reg_no)) {
            return res.status(400).json({ 
                error: 'Invalid registration number format. Must start with "RA" followed by 14 digits (e.g. RA24110030105720).' 
            });
        }

        // Validate password format: Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char
        if (!PASSWORD_REGEX.test(password)) {
            return res.status(400).json({ 
                error: 'Password must be at least 8 characters long, contain at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character (!@#$%^&*).' 
            });
        }

        // Check if reg_no already exists
        const { data: existingUser } = await supabase
            .from('users')
            .select('reg_no')
            .eq('reg_no', reg_no)
            .single();

        if (existingUser) {
            return res.status(400).json({ error: 'Registration number already registered' });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert new user
        const { data, error } = await supabase
            .from('users')
            .insert([{
                first_name,
                last_name,
                reg_no,
                email: email || null,
                password: hashedPassword,
                department: department || null,
                phone: phone || null
            }])
            .select();

        if (error) throw error;

        res.status(201).json({ message: 'Signup successful', user: data[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ LOGIN ============
router.post('/login', async (req, res) => {
    try {
        const { reg_no, password } = req.body;

        if (!reg_no || !password) {
            return res.status(400).json({ error: 'Registration number and password are required' });
        }

        // Find user by reg_no
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('reg_no', reg_no)
            .single();

        if (error || !user) {
            return res.status(400).json({ error: 'Invalid registration number or password' });
        }

        // Compare password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid registration number or password' });
        }

        // Generate JWT token
        const token = jwt.sign(
            { user_id: user.user_id, reg_no: user.reg_no },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            message: 'Login successful',
            token,
            user: {
                user_id: user.user_id,
                first_name: user.first_name,
                reg_no: user.reg_no
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ DEMO QUICK LOGIN (FOR PRESENTATION) ============
router.post('/demo-login', async (req, res) => {
    try {
        const { role } = req.body; // 'rahul' or 'priya'
        const reg_no = (role === 'priya') ? 'RA71974882626888' : 'RA57943391863820';

        let { data: user } = await supabase
            .from('users')
            .select('*')
            .eq('reg_no', reg_no)
            .maybeSingle();

        if (!user) {
            const dummyHash = await bcrypt.hash('DemoPass123!', 10);
            const isPriya = (role === 'priya');
            const { data: newUser, error: createErr } = await supabase
                .from('users')
                .insert([{
                    first_name: isPriya ? 'Priya' : 'Rahul',
                    last_name: isPriya ? 'Verma' : 'Sharma',
                    reg_no: reg_no,
                    email: isPriya ? 'priya.demo@campus.edu' : 'rahul.demo@campus.edu',
                    password: dummyHash,
                    department: isPriya ? 'Information Tech' : 'Computer Science',
                    phone: isPriya ? '9123456780' : '9876543210'
                }])
                .select()
                .single();
            if (createErr) throw createErr;
            user = newUser;
        }

        const token = jwt.sign(
            { user_id: user.user_id, reg_no: user.reg_no },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            message: `Demo login successful as ${user.first_name}`,
            token,
            user: {
                user_id: user.user_id,
                first_name: user.first_name,
                reg_no: user.reg_no
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ GET LOGGED-IN USER ============
const verifyToken = require('../middleware/auth');
router.get('/me', verifyToken, async (req, res) => {
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('user_id, first_name, last_name, reg_no, email, department, phone')
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
        const { first_name, last_name, email, department, phone } = req.body;

        if (first_name !== undefined && !first_name.trim()) {
            return res.status(400).json({ error: 'First name cannot be empty' });
        }
        if (last_name !== undefined && !last_name.trim()) {
            return res.status(400).json({ error: 'Last name cannot be empty' });
        }

        const updateData = {};
        if (first_name !== undefined) updateData.first_name = first_name.trim();
        if (last_name !== undefined) updateData.last_name = last_name.trim();
        if (email !== undefined) updateData.email = email ? email.trim() : null;
        if (department !== undefined) updateData.department = department ? department.trim() : null;
        if (phone !== undefined) updateData.phone = phone ? phone.trim() : null;

        const { data, error } = await supabase
            .from('users')
            .update(updateData)
            .eq('user_id', user_id)
            .select('user_id, first_name, last_name, reg_no, email, department, phone')
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
            return res.status(400).json({ error: 'Old password and new password are required' });
        }

        if (confirm_new_password && new_password !== confirm_new_password) {
            return res.status(400).json({ error: 'New password and confirmation do not match' });
        }

        // Validate new password rules
        if (!PASSWORD_REGEX.test(new_password)) {
            return res.status(400).json({
                error: 'New password must be at least 8 characters long, contain at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character (!@#$%^&*).'
            });
        }

        // Fetch current password hash
        const { data: user, error: fetchErr } = await supabase
            .from('users')
            .select('password')
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

        // Hash new password and update
        const hashedPassword = await bcrypt.hash(new_password, 10);
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