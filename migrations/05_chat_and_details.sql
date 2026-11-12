-- ==============================================================================
-- MIGRATION 05: Chat & Detailed Lost Item Fields
-- Architecture: Node.js Express Backend with Custom JWT & Supabase Client
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ADD DETAILED DESCRIPTIVE COLUMNS TO LOST_ITEM
-- Supports verification through specific attributes and text-to-image matching
-- ------------------------------------------------------------------------------
ALTER TABLE lost_item ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE lost_item ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE lost_item ADD COLUMN IF NOT EXISTS distinguishing_marks TEXT;
ALTER TABLE lost_item ADD COLUMN IF NOT EXISTS contents_details TEXT;


-- ------------------------------------------------------------------------------
-- 2. CREATE MESSAGES TABLE FOR IN-APP CHAT PER MATCH
-- Enables private, safe coordination between lost item owner & found reporter
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
    id BIGSERIAL PRIMARY KEY,
    match_id BIGINT NOT NULL REFERENCES item_match(match_id) ON DELETE CASCADE,
    sender_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    body VARCHAR(500) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance indices for fast polling and lookup
CREATE INDEX IF NOT EXISTS idx_messages_match_id ON messages(match_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);


-- ------------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY (RLS) FOR MESSAGES TABLE
-- Rule: Backend-governed operations via Express JWT middleware (style of 02_enable_rls_policies.sql)
-- ------------------------------------------------------------------------------
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow backend API operations on messages" ON messages;
CREATE POLICY "Allow backend API operations on messages"
ON messages
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

