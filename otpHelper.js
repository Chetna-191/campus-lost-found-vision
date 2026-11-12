/**
 * Email OTP & Notification Delivery Helper
 * Handles generation, secure hashing, email sending via Nodemailer, and verification of OTPs.
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const supabase = require('./db');

/**
 * Common weak password blacklist
 */
const COMMON_PASSWORDS = new Set([
    'password',
    'password123',
    'password123!',
    'admin123',
    'admin123!',
    '12345678',
    '123456789',
    'qwerty123',
    'qwerty123!',
    'campus123',
    'campus123!',
    'welcome123',
    'welcome123!',
    'pass@123',
    'password@1',
    'srmist123',
    'student123'
]);

/**
 * Validates password against complexity, common dictionary, and user attributes
 */
function validatePasswordSecurity(password, userDetails = {}) {
    if (!password || typeof password !== 'string') {
        return { valid: false, error: 'Password is required' };
    }

    if (password.length < 8) {
        return { valid: false, error: 'Password must be at least 8 characters long' };
    }

    // Must have uppercase, lowercase, digit, special character
    const complexityRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{8,}$/;
    if (!complexityRegex.test(password)) {
        return {
            valid: false,
            error: 'Password must contain at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character (!@#$%^&*).'
        };
    }

    const lowerPassword = password.toLowerCase();

    // Check common password blacklist
    if (COMMON_PASSWORDS.has(lowerPassword)) {
        return { valid: false, error: 'Password is too common or easily guessed. Please choose a stronger password.' };
    }

    // Reject password if it contains the student registration number
    if (userDetails.reg_no && userDetails.reg_no.length >= 4) {
        const lowerReg = userDetails.reg_no.toLowerCase();
        if (lowerPassword.includes(lowerReg)) {
            return { valid: false, error: 'Password must not contain your registration number.' };
        }
    }

    // Reject password if it contains student's first or last name
    if (userDetails.first_name && userDetails.first_name.trim().length >= 3) {
        const lowerFirst = userDetails.first_name.trim().toLowerCase();
        if (lowerPassword.includes(lowerFirst)) {
            return { valid: false, error: 'Password must not contain your first name.' };
        }
    }

    if (userDetails.last_name && userDetails.last_name.trim().length >= 3) {
        const lowerLast = userDetails.last_name.trim().toLowerCase();
        if (lowerPassword.includes(lowerLast)) {
            return { valid: false, error: 'Password must not contain your last name.' };
        }
    }

    return { valid: true };
}

/**
 * Creates and sends a 6-digit OTP for a given email and purpose
 */
async function generateAndSendOtp(email, purpose = 'verification') {
    const cleanEmail = email.trim().toLowerCase();
    
    // Generate secure 6-digit random code
    const otp = crypto.randomInt(100000, 999999).toString();

    // Hash the OTP before database insertion
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Invalidate / remove previous pending OTPs for this email and purpose
    await supabase
        .from('email_otp')
        .delete()
        .eq('email', cleanEmail)
        .eq('purpose', purpose);

    // Insert new OTP record
    const { error: insertErr } = await supabase
        .from('email_otp')
        .insert([{
            email: cleanEmail,
            otp_hash: otpHash,
            purpose,
            expires_at: expiresAt.toISOString(),
            attempts: 0
        }]);

    if (insertErr) {
        console.error('[OTP] Failed to persist OTP:', insertErr.message);
        throw new Error('Could not generate verification code. Please try again.');
    }

    // Check SMTP configuration
    const isSmtpConfigured = !!(process.env.SMTP_HOST && process.env.SMTP_USER);

    if (isSmtpConfigured) {
        try {
            const transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT || '587', 10),
                secure: process.env.SMTP_SECURE === 'true',
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                }
            });

            const subject = purpose === 'password_reset'
                ? 'Campus Lost & Found - Password Reset Code'
                : 'Campus Lost & Found - Email Verification Code';

            const purposeLabel = purpose === 'password_reset' ? 'Password Reset' : 'Email Verification';

            const htmlContent = `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e0dfd5; border-radius: 12px; background-color: #fbf8f2;">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <h2 style="color: #9a1a1b; margin: 0; font-size: 24px;">Campus Lost &amp; Found</h2>
                        <p style="color: #636154; margin: 4px 0 0; font-size: 14px;">${purposeLabel}</p>
                    </div>
                    <div style="background-color: #ffffff; padding: 20px; border-radius: 8px; text-align: center; border: 1px solid #e0dfd5;">
                        <p style="margin: 0 0 12px; color: #2b2b26; font-size: 15px;">Use the 6-digit code below to complete your request:</p>
                        <div style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #9a1a1b; padding: 12px 0;">
                            ${otp}
                        </div>
                        <p style="margin: 12px 0 0; color: #767569; font-size: 13px;">This code is valid for <strong>10 minutes</strong>. Do not share it with anyone.</p>
                    </div>
                    <p style="text-align: center; margin-top: 18px; color: #a19f91; font-size: 12px;">If you did not request this email, please ignore it.</p>
                </div>
            `;

            await transporter.sendMail({
                from: process.env.SMTP_FROM || `"Campus Lost & Found" <${process.env.SMTP_USER}>`,
                to: cleanEmail,
                subject,
                text: `Your Campus Lost & Found ${purposeLabel} code is: ${otp} (valid for 10 minutes).`,
                html: htmlContent
            });

            console.log(`[OTP] Email sent to ${cleanEmail} for ${purpose}`);
        } catch (emailErr) {
            console.error('[OTP] SMTP send failed:', emailErr.message);
            // If development fallback allowed
            if (process.env.NODE_ENV !== 'production') {
                console.log(`\n==================================================`);
                console.log(`[DEV OTP FALLBACK] Recipient: ${cleanEmail} | Purpose: ${purpose}`);
                console.log(`[DEV OTP FALLBACK] 6-Digit Code: >>> ${otp} <<<`);
                console.log(`==================================================\n`);
            } else {
                throw new Error('Failed to send verification email. Please contact support.');
            }
        }
    } else {
        // SMTP not configured: print in console if non-production
        if (process.env.NODE_ENV !== 'production') {
            console.log(`\n==================================================`);
            console.log(`[DEV OTP] Recipient: ${cleanEmail} | Purpose: ${purpose}`);
            console.log(`[DEV OTP] 6-Digit Code: >>> ${otp} <<< (Expires in 10 mins)`);
            console.log(`==================================================\n`);
        } else {
            console.warn('[OTP] Warning: SMTP is not configured in production environment.');
        }
    }

    return true;
}

/**
 * Verifies an OTP code for a given email and purpose
 */
async function verifyOtp(email, otp, purpose = 'verification') {
    const cleanEmail = email.trim().toLowerCase();

    // Query newest OTP for this email & purpose
    const { data: record, error } = await supabase
        .from('email_otp')
        .select('*')
        .eq('email', cleanEmail)
        .eq('purpose', purpose)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error || !record) {
        return { success: false, error: 'Invalid or expired verification code. Please request a new one.' };
    }

    // Check expiry
    if (new Date() > new Date(record.expires_at)) {
        await supabase.from('email_otp').delete().eq('id', record.id);
        return { success: false, error: 'Verification code has expired. Please request a new one.' };
    }

    // Check attempts limit (max 5)
    if (record.attempts >= 5) {
        await supabase.from('email_otp').delete().eq('id', record.id);
        return { success: false, error: 'Maximum attempts exceeded. Please request a new verification code.' };
    }

    // Verify hash
    const isMatch = await bcrypt.compare(otp.trim(), record.otp_hash);

    if (!isMatch) {
        const nextAttempts = (record.attempts || 0) + 1;
        await supabase
            .from('email_otp')
            .update({ attempts: nextAttempts })
            .eq('id', record.id);

        const remaining = 5 - nextAttempts;
        return { 
            success: false, 
            error: remaining > 0 
                ? `Invalid verification code. (${remaining} attempt${remaining === 1 ? '' : 's'} remaining)`
                : 'Invalid verification code. Maximum attempts exceeded.'
        };
    }

    // Successfully verified: remove the OTP so it cannot be reused
    await supabase.from('email_otp').delete().eq('id', record.id);

    return { success: true };
}

module.exports = {
    validatePasswordSecurity,
    generateAndSendOtp,
    verifyOtp
};

