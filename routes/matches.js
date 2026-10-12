const express = require('express');
const supabase = require('../db');
const verifyToken = require('../middleware/auth');

const router = express.Router();

// ============ GET MATCH DETAILS ============
// GET /api/matches/:id - Protected, returns item_match row joined with lost_item and found_item details
router.get('/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('item_match')
            .select(`
                *,
                lost_item (
                    *,
                    category (category_name),
                    location (location_name),
                    users (user_id, first_name, last_name, reg_no, phone, email, department)
                ),
                found_item (
                    *,
                    category (category_name),
                    location (location_name),
                    users (user_id, first_name, last_name, reg_no, phone, email, department)
                )
            `)
            .eq('match_id', id)
            .single();

        if (error || !data) {
            return res.status(404).json({ error: 'Match record not found' });
        }

        res.json(data);
    } catch (err) {
        console.error('Error fetching match:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============ UPDATE MATCH STATUS (CONFIRM / REJECT) ============
// PATCH /api/matches/:id - Protected, updates match_status to 'Confirmed', 'Rejected', or 'Pending'
router.patch('/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!status) {
            return res.status(400).json({ error: 'Status is required (Confirmed, Rejected, or Pending)' });
        }

        // Standardize status capitalization
        const cleanStatus = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
        if (!['Confirmed', 'Rejected', 'Pending'].includes(cleanStatus)) {
            return res.status(400).json({ error: 'Status must be Confirmed, Rejected, or Pending' });
        }

        // Fetch existing match to verify permissions
        const { data: existing, error: fetchErr } = await supabase
            .from('item_match')
            .select('*, lost_item(user_id, description), found_item(user_id, description)')
            .eq('match_id', id)
            .single();

        if (fetchErr || !existing) {
            return res.status(404).json({ error: 'Match record not found' });
        }

        const currentUserId = req.user.user_id;
        const lostOwnerId = existing.lost_item ? existing.lost_item.user_id : null;
        const foundReporterId = existing.found_item ? existing.found_item.user_id : null;

        // Ensure user is either the lost item owner or found item reporter
        if (currentUserId !== lostOwnerId && currentUserId !== foundReporterId) {
            return res.status(403).json({ error: 'You are not authorized to update this match' });
        }

        // Update match status
        const { data: updated, error: updateErr } = await supabase
            .from('item_match')
            .update({ match_status: cleanStatus })
            .eq('match_id', id)
            .select()
            .single();

        if (updateErr) throw updateErr;

        // If status changed to Confirmed or Rejected, notify the counterparty
        const recipientUserId = (currentUserId === lostOwnerId) ? foundReporterId : lostOwnerId;
        if (recipientUserId && recipientUserId !== currentUserId) {
            const statusVerb = cleanStatus === 'Confirmed' ? 'confirmed' : 'rejected';
            await supabase
                .from('notification')
                .insert([{
                    user_id: recipientUserId,
                    message: `Match #${id} was marked as ${cleanStatus} by the other student.`,
                    is_read: false
                }]);
        }

        res.json({
            success: true,
            match: updated,
            message: `Match successfully updated to ${cleanStatus}`
        });
    } catch (err) {
        console.error('Error updating match status:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
