-- ==============================================================================
-- MIGRATION 06: Security Hardening, Roster Whitelist, Email OTP & Admin Panel
-- Architecture: Node.js Express Backend with Custom JWT & Supabase Client
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ROSTER WHITELIST TABLE (STUDENTS)
-- Ensures only valid enrolled students can register on the platform.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS students (
    reg_no VARCHAR(30) PRIMARY KEY,
    name TEXT NOT NULL,
    college_email TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_students_college_email ON students(college_email);

-- ------------------------------------------------------------------------------
-- 2. EMAIL OTP TABLE
-- Stores hashed one-time passwords for email verification and password reset.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_otp (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    otp_hash TEXT NOT NULL,
    purpose VARCHAR(50) NOT NULL, -- 'verification' or 'password_reset'
    expires_at TIMESTAMPTZ NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_otp_lookup ON email_otp(email, purpose);

-- ------------------------------------------------------------------------------
-- 3. USERS TABLE SECURITY HARDENING COLUMNS
-- Supports email verification status, account lockout protection & admin access.
-- ------------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- ------------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- Rule: Backend-governed operations via Express JWT middleware (style of 02_enable_rls_policies.sql)
-- ------------------------------------------------------------------------------
ALTER TABLE students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow backend API operations on students" ON students;
CREATE POLICY "Allow backend API operations on students"
ON students
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

ALTER TABLE email_otp ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow backend API operations on email_otp" ON email_otp;
CREATE POLICY "Allow backend API operations on email_otp"
ON email_otp
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

