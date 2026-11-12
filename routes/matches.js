const express = require('express');
const supabase = require('../db');
const verifyToken = require('../middleware/auth');

const router = express.Router();

// In-memory sliding-window rate limiter for in-app chat: 20 messages per minute per user
const messageRateLimits = new Map();

function isMessageRateLimited(userId) {
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute
    const userTimestamps = messageRateLimits.get(userId) || [];
    const recent = userTimestamps.filter(ts => now - ts < windowMs);

    if (recent.length >= 20) {
        return true;
    }

    recent.push(now);
    messageRateLimits.set(userId, recent);
    return false;
}

// Clean up stale rate-limit keys every 10 minutes
setInterval(() => {
    const now = Date.now();
    for (const [userId, timestamps] of messageRateLimits.entries()) {
        const active = timestamps.filter(ts => now - ts < 60000);
        if (active.length === 0) {
            messageRateLimits.delete(userId);
        } else {
            messageRateLimits.set(userId, active);
        }
    }
}, 10 * 60 * 1000).unref();

// ============ GET MATCH DETAILS ============
// GET /api/matches/:id - Protected, returns item_match row joined with lost_item and found_item details
// NOTE: To protect student privacy, phone and email are strictly omitted.
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
                    users (user_id, first_name, last_name, reg_no, department)
                ),
                found_item (
                    *,
                    category (category_name),
                    location (location_name),
                    users (user_id, first_name, last_name, reg_no, department)
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

// ============ UPDATE MATCH STATUS (RETURNED / REJECTED / CONFIRMED) ============
// PATCH /api/matches/:id - Protected
router.patch('/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!status) {
            return res.status(400).json({ error: 'Status is required (Returned, Rejected, Confirmed, or Pending)' });
        }

        // Standardize status capitalization
        const cleanStatus = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
        const allowedStatuses = ['Returned', 'Rejected', 'Confirmed', 'Pending'];
        if (!allowedStatuses.includes(cleanStatus)) {
            return res.status(400).json({ error: 'Status must be Returned, Rejected, Confirmed, or Pending' });
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

        // If status changed to Returned, close both items
        if (cleanStatus === 'Returned') {
            if (existing.lost_item_id) {
                await supabase
                    .from('lost_item')
                    .update({ status: 'Returned' })
                    .eq('lost_item_id', existing.lost_item_id);
            }
            if (existing.found_item_id) {
                await supabase
                    .from('found_item')
                    .update({ status: 'Returned' })
                    .eq('found_item_id', existing.found_item_id);
            }
        }

        // Notify the counterparty about the status update
        const recipientUserId = (currentUserId === lostOwnerId) ? foundReporterId : lostOwnerId;
        if (recipientUserId && recipientUserId !== currentUserId) {
            let statusMessage = `Match #${id} was updated to ${cleanStatus} by the other student.`;
            if (cleanStatus === 'Returned') {
                statusMessage = `Match #${id} was marked as Returned! Thank you for recovering this campus item.`;
            } else if (cleanStatus === 'Rejected') {
                statusMessage = `Match #${id} was closed as "Not a Match".`;
            }

            await supabase
                .from('notification')
                .insert([{
                    user_id: recipientUserId,
                    message: statusMessage,
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

// ============ IN-APP CHAT: GET MESSAGES ============
// GET /api/matches/:id/messages - Protected, allowed ONLY for lost owner or found reporter
router.get('/:id/messages', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const currentUserId = req.user.user_id;

        // 1. Verify match ownership
        const { data: match, error: matchErr } = await supabase
            .from('item_match')
            .select('match_id, lost_item(user_id), found_item(user_id)')
            .eq('match_id', id)
            .single();

        if (matchErr || !match) {
            return res.status(404).json({ error: 'Match record not found' });
        }

        const lostOwnerId = match.lost_item ? match.lost_item.user_id : null;
        const foundReporterId = match.found_item ? match.found_item.user_id : null;

        if (currentUserId !== lostOwnerId && currentUserId !== foundReporterId) {
            return res.status(403).json({ error: 'You are not authorized to view messages for this match' });
        }

        // 2. Fetch messages (Strict privacy: never return phone or email)
        const { data: messages, error: msgErr } = await supabase
            .from('messages')
            .select(`
                id,
                match_id,
                sender_id,
                body,
                created_at,
                users:sender_id (user_id, first_name, last_name, reg_no)
            `)
            .eq('match_id', id)
            .order('created_at', { ascending: true });

        if (msgErr) throw msgErr;

        res.json({
            match_id: parseInt(id, 10),
            messages: messages || []
        });
    } catch (err) {
        console.error('Error fetching messages:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============ IN-APP CHAT: SEND MESSAGE ============
// POST /api/matches/:id/messages - Protected, max 500 chars, rate limit 20 msgs/min
router.post('/:id/messages', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const currentUserId = req.user.user_id;
        const { body } = req.body;

        // 1. Message content validation
        if (!body || typeof body !== 'string' || !body.trim()) {
            return res.status(400).json({ error: 'Message body cannot be empty.' });
        }

        const cleanBody = body.trim();
        if (cleanBody.length > 500) {
            return res.status(400).json({ error: 'Message exceeds maximum length of 500 characters.' });
        }

        // 2. Rate limit check: 20 messages per minute
        if (isMessageRateLimited(currentUserId)) {
            return res.status(429).json({ error: 'Rate limit exceeded. You can send at most 20 messages per minute.' });
        }

        // 3. Verify match exists and user belongs to match
        const { data: match, error: matchErr } = await supabase
            .from('item_match')
            .select('match_id, lost_item(user_id), found_item(user_id)')
            .eq('match_id', id)
            .single();

        if (matchErr || !match) {
            return res.status(404).json({ error: 'Match record not found' });
        }

        const lostOwnerId = match.lost_item ? match.lost_item.user_id : null;
        const foundReporterId = match.found_item ? match.found_item.user_id : null;

        if (currentUserId !== lostOwnerId && currentUserId !== foundReporterId) {
            return res.status(403).json({ error: 'You are not authorized to send messages for this match' });
        }

        // 4. Insert message
        const { data: newMessage, error: insertErr } = await supabase
            .from('messages')
            .insert([{
                match_id: id,
                sender_id: currentUserId,
                body: cleanBody
            }])
            .select(`
                id,
                match_id,
                sender_id,
                body,
                created_at,
                users:sender_id (user_id, first_name, last_name, reg_no)
            `)
            .single();

        if (insertErr) throw insertErr;

        // 5. Notify the other party on new message
        const recipientUserId = (currentUserId === lostOwnerId) ? foundReporterId : lostOwnerId;
        if (recipientUserId && recipientUserId !== currentUserId) {
            const preview = cleanBody.length > 40 ? cleanBody.slice(0, 40) + '...' : cleanBody;
            await supabase
                .from('notification')
                .insert([{
                    user_id: recipientUserId,
                    match_id: id,
                    message: `New message on Match #${id}: "${preview}"`,
                    is_read: false
                }]);
        }

        res.status(201).json(newMessage);
    } catch (err) {
        console.error('Error sending message:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
