/**
 * Admin API Routes
 * Restricted to administrators with is_admin = true.
 */

const express = require('express');
const supabase = require('../db');
const requireAdmin = require('../middleware/admin');

const router = express.Router();

// Apply requireAdmin middleware to all routes in this router
router.use(requireAdmin);

// ============ GET STATS ============
router.get('/stats', async (req, res) => {
    try {
        const [
            { count: usersCount, error: uErr },
            { count: lostCount, error: lErr },
            { count: foundCount, error: fErr },
            { count: matchesCount, error: mErr },
            { count: returnedCount, error: rErr }
        ] = await Promise.all([
            supabase.from('users').select('*', { count: 'exact', head: true }),
            supabase.from('lost_item').select('*', { count: 'exact', head: true }),
            supabase.from('found_item').select('*', { count: 'exact', head: true }),
            supabase.from('item_match').select('*', { count: 'exact', head: true }),
            supabase.from('item_match').select('*', { count: 'exact', head: true }).eq('match_status', 'Returned')
        ]);

        if (uErr || lErr || fErr || mErr || rErr) {
            console.error('Error fetching admin stats:', uErr || lErr || fErr || mErr || rErr);
            return res.status(500).json({ error: 'Failed to retrieve platform statistics' });
        }

        res.json({
            users: usersCount || 0,
            lost_items: lostCount || 0,
            found_items: foundCount || 0,
            matches: matchesCount || 0,
            returned_items: returnedCount || 0
        });
    } catch (err) {
        console.error('Admin stats error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============ LIST USERS ============
router.get('/users', async (req, res) => {
    try {
        const { q } = req.query;
        let query = supabase
            .from('users')
            .select('user_id, first_name, last_name, reg_no, email, department, phone, is_admin, email_verified, created_at')
            .order('created_at', { ascending: false });

        if (q && q.trim()) {
            const searchTerm = q.trim();
            query = query.or(`first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%,reg_no.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`);
        }

        const { data, error } = await query;
        if (error) throw error;

        res.json(data || []);
    } catch (err) {
        console.error('Admin list users error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============ LIST LOST ITEMS ============
router.get('/lost-items', async (req, res) => {
    try {
        const { q } = req.query;
        let query = supabase
            .from('lost_item')
            .select(`
                lost_item_id,
                description,
                color,
                brand,
                distinguishing_marks,
                contents_details,
                status,
                image_url,
                created_at,
                category:category_id (category_name),
                location:location_id (location_name),
                user:user_id (user_id, first_name, last_name, reg_no, email)
            `)
            .order('created_at', { ascending: false });

        if (q && q.trim()) {
            const searchTerm = q.trim();
            query = query.or(`description.ilike.%${searchTerm}%,brand.ilike.%${searchTerm}%,color.ilike.%${searchTerm}%`);
        }

        const { data, error } = await query;
        if (error) throw error;

        // Provide real schema columns and backward-compatible UI aliases (lost_id, title, photo_url)
        const formatted = (data || []).map(item => ({
            ...item,
            lost_id: item.lost_item_id,
            title: item.brand ? `${item.brand} (${item.category?.category_name || 'Item'})` : (item.description || 'Lost Item'),
            photo_url: item.image_url
        }));

        res.json(formatted);
    } catch (err) {
        console.error('Admin list lost items error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============ LIST FOUND ITEMS ============
router.get('/found-items', async (req, res) => {
    try {
        const { q } = req.query;
        let query = supabase
            .from('found_item')
            .select(`
                found_item_id,
                description,
                status,
                image_url,
                created_at,
                category:category_id (category_name),
                location:location_id (location_name),
                user:user_id (user_id, first_name, last_name, reg_no, email)
            `)
            .order('created_at', { ascending: false });

        if (q && q.trim()) {
            const searchTerm = q.trim();
            query = query.or(`description.ilike.%${searchTerm}%`);
        }

        const { data, error } = await query;
        if (error) throw error;

        // Provide real schema columns and backward-compatible UI aliases (found_id, title, photo_url)
        const formatted = (data || []).map(item => ({
            ...item,
            found_id: item.found_item_id,
            title: item.category?.category_name || 'Found Item',
            photo_url: item.image_url
        }));

        res.json(formatted);
    } catch (err) {
        console.error('Admin list found items error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============ DELETE ITEM ============
router.delete('/items/:type/:id', async (req, res) => {
    try {
        const { type, id } = req.params;
        const itemId = parseInt(id, 10);

        if (isNaN(itemId)) {
            return res.status(400).json({ error: 'Invalid item ID' });
        }

        if (type === 'lost') {
            // Delete associated matches first using real foreign key lost_item_id
            await supabase.from('item_match').delete().eq('lost_item_id', itemId);
            const { error } = await supabase.from('lost_item').delete().eq('lost_item_id', itemId);
            if (error) throw error;
            return res.json({ message: `Lost item #${itemId} deleted successfully.` });
        } else if (type === 'found') {
            // Delete associated matches first using real foreign key found_item_id
            await supabase.from('item_match').delete().eq('found_item_id', itemId);
            const { error } = await supabase.from('found_item').delete().eq('found_item_id', itemId);
            if (error) throw error;
            return res.json({ message: `Found item #${itemId} deleted successfully.` });
        } else {
            return res.status(400).json({ error: 'Item type must be either "lost" or "found"' });
        }
    } catch (err) {
        console.error('Admin delete item error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============ LIST MATCHES ============
router.get('/matches', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('item_match')
            .select(`
                match_id,
                similarity_score,
                match_status,
                created_at,
                lost_item:lost_item_id (
                    lost_item_id, description, image_url, status,
                    category:category_id (category_name),
                    user:user_id (first_name, last_name, reg_no, email)
                ),
                found_item:found_item_id (
                    found_item_id, description, image_url, status,
                    category:category_id (category_name),
                    user:user_id (first_name, last_name, reg_no, email)
                )
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Provide real schema columns and backward-compatible UI aliases
        const formatted = (data || []).map(m => ({
            ...m,
            lost_item: m.lost_item ? {
                ...m.lost_item,
                lost_id: m.lost_item.lost_item_id,
                title: m.lost_item.description || (m.lost_item.category?.category_name || 'Lost Item'),
                photo_url: m.lost_item.image_url
            } : null,
            found_item: m.found_item ? {
                ...m.found_item,
                found_id: m.found_item.found_item_id,
                title: m.found_item.description || (m.found_item.category?.category_name || 'Found Item'),
                photo_url: m.found_item.image_url
            } : null
        }));

        res.json(formatted);
    } catch (err) {
        console.error('Admin list matches error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============ UPDATE MATCH STATUS (CLOSE / REJECT / RETURN) ============
router.patch('/matches/:id/status', async (req, res) => {
    try {
        const matchId = parseInt(req.params.id, 10);
        const { status } = req.body;

        if (isNaN(matchId)) {
            return res.status(400).json({ error: 'Invalid match ID' });
        }

        const validStatuses = ['Pending', 'Confirmed', 'Rejected', 'Returned', 'Closed'];
        const cleanStatus = status ? status.charAt(0).toUpperCase() + status.slice(1).toLowerCase() : '';
        if (!validStatuses.includes(cleanStatus)) {
            return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
        }

        // Fetch match details using real foreign keys lost_item_id and found_item_id
        const { data: match, error: fetchErr } = await supabase
            .from('item_match')
            .select('match_id, lost_item_id, found_item_id, match_status')
            .eq('match_id', matchId)
            .single();

        if (fetchErr || !match) {
            return res.status(404).json({ error: 'Match record not found' });
        }

        // Update match status
        const { data: updatedMatch, error: updateErr } = await supabase
            .from('item_match')
            .update({ match_status: cleanStatus })
            .eq('match_id', matchId)
            .select()
            .single();

        if (updateErr) throw updateErr;

        // If returned, update both lost and found item statuses using real primary keys
        if (cleanStatus === 'Returned') {
            await Promise.all([
                match.lost_item_id ? supabase.from('lost_item').update({ status: 'Returned' }).eq('lost_item_id', match.lost_item_id) : Promise.resolve(),
                match.found_item_id ? supabase.from('found_item').update({ status: 'Returned' }).eq('found_item_id', match.found_item_id) : Promise.resolve()
            ]);
        }

        res.json({
            message: `Match #${matchId} status updated to '${cleanStatus}'.`,
            match: updatedMatch
        });
    } catch (err) {
        console.error('Admin update match status error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

