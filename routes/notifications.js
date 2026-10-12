const express = require('express');
const supabase = require('../db');
const verifyToken = require('../middleware/auth');

const router = express.Router();

// ============ GET USER NOTIFICATIONS ============
// GET /api/notifications - Protected, returns notifications for logged-in user, newest first
router.get('/', verifyToken, async (req, res) => {
    try {
        const user_id = req.user.user_id;

        const { data, error } = await supabase
            .from('notification')
            .select('*')
            .eq('user_id', user_id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Enhance with extracted match_id if message contains 'Match #<id>'
        const enhanced = (data || []).map(notif => {
            const match = notif.message ? notif.message.match(/Match #(\d+)/) : null;
            return {
                ...notif,
                match_id: match ? parseInt(match[1], 10) : null,
            };
        });

        res.json(enhanced);
    } catch (err) {
        console.error('Error fetching notifications:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============ GET UNREAD NOTIFICATIONS COUNT ============
// GET /api/notifications/unread-count - Protected
router.get('/unread-count', verifyToken, async (req, res) => {
    try {
        const user_id = req.user.user_id;

        const { count, error } = await supabase
            .from('notification')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user_id)
            .eq('is_read', false);

        if (error) throw error;

        res.json({ unread_count: count || 0 });
    } catch (err) {
        console.error('Error fetching unread count:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============ MARK ALL NOTIFICATIONS AS READ ============
// PATCH /api/notifications/read-all - Protected
router.patch('/read-all', verifyToken, async (req, res) => {
    try {
        const user_id = req.user.user_id;

        const { data, error } = await supabase
            .from('notification')
            .update({ is_read: true })
            .eq('user_id', user_id)
            .select();

        if (error) throw error;

        res.json({ success: true, updated: data ? data.length : 0 });
    } catch (err) {
        console.error('Error marking all notifications read:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============ MARK SINGLE NOTIFICATION AS READ ============
// PATCH /api/notifications/:id/read - Protected
router.patch('/:id/read', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const user_id = req.user.user_id;

        const { data, error } = await supabase
            .from('notification')
            .update({ is_read: true })
            .eq('notification_id', id)
            .eq('user_id', user_id)
            .select();

        if (error) throw error;

        if (!data || data.length === 0) {
            return res.status(404).json({ error: 'Notification not found' });
        }

        res.json(data[0]);
    } catch (err) {
        console.error('Error marking notification read:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
