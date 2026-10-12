-- Add reg_no column to users table and make email optional
ALTER TABLE users ADD COLUMN IF NOT EXISTS reg_no TEXT UNIQUE;
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
