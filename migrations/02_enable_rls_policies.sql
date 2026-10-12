-- ==============================================================================
-- SUPABASE ROW LEVEL SECURITY (RLS) POLICIES
-- Architecture: Node.js Express Backend with Custom JWT & Supabase Client
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. CATEGORY TABLE
-- Rule: Public read-only for anon & authenticated; mutations restricted to service_role/admin.
-- ------------------------------------------------------------------------------
ALTER TABLE category ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access on category" ON category;
CREATE POLICY "Allow public read access on category"
ON category
FOR SELECT
TO anon, authenticated
USING (true);


-- ------------------------------------------------------------------------------
-- 2. LOCATION TABLE
-- Rule: Public read-only for anon & authenticated; mutations restricted to service_role/admin.
-- ------------------------------------------------------------------------------
ALTER TABLE location ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access on location" ON location;
CREATE POLICY "Allow public read access on location"
ON location
FOR SELECT
TO anon, authenticated
USING (true);


-- ------------------------------------------------------------------------------
-- 3. USERS TABLE
-- Rule: Backend-governed operations via Express JWT middleware.
-- ------------------------------------------------------------------------------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow backend API operations on users" ON users;
CREATE POLICY "Allow backend API operations on users"
ON users
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);


-- ------------------------------------------------------------------------------
-- 4. LOST_ITEM TABLE
-- Rule: Backend-governed operations via Express JWT middleware.
-- ------------------------------------------------------------------------------
ALTER TABLE lost_item ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow backend API operations on lost_item" ON lost_item;
CREATE POLICY "Allow backend API operations on lost_item"
ON lost_item
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);


-- ------------------------------------------------------------------------------
-- 5. FOUND_ITEM TABLE
-- Rule: Backend-governed operations via Express JWT middleware.
-- ------------------------------------------------------------------------------
ALTER TABLE found_item ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow backend API operations on found_item" ON found_item;
CREATE POLICY "Allow backend API operations on found_item"
ON found_item
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);


-- ------------------------------------------------------------------------------
-- 6. ITEM_MATCH TABLE
-- Rule: Backend-governed operations via Express JWT middleware.
-- ------------------------------------------------------------------------------
ALTER TABLE item_match ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow backend API operations on item_match" ON item_match;
CREATE POLICY "Allow backend API operations on item_match"
ON item_match
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);


-- ------------------------------------------------------------------------------
-- 7. NOTIFICATION TABLE
-- Rule: Backend-governed operations via Express JWT middleware.
-- ------------------------------------------------------------------------------
ALTER TABLE notification ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow backend API operations on notification" ON notification;
CREATE POLICY "Allow backend API operations on notification"
ON notification
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);
