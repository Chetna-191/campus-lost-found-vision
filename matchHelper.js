const supabase = require('./db');

const MATCH_THRESHOLD = 80; // 80% similarity threshold

/**
 * Evaluates matches for a reported item and creates item_match and notification records
 * @param {Object} params
 * @param {number} params.lostItemId
 * @param {number} params.foundItemId
 * @param {number} params.lostUserId
 * @param {number} params.foundUserId
 * @param {number} params.similarity
 * @param {string} [params.lostDesc]
 * @param {string} [params.foundDesc]
 * @returns {Promise<Object|null>}
 */
async function recordMatchAndNotify({
    lostItemId,
    foundItemId,
    lostUserId,
    foundUserId,
    similarity,
    lostDesc = '',
    foundDesc = ''
}) {
    if (similarity < MATCH_THRESHOLD) {
        return null;
    }

    try {
        // 1. Check if a match row already exists for this pair
        const { data: existingMatch } = await supabase
            .from('item_match')
            .select('*')
            .eq('lost_item_id', lostItemId)
            .eq('found_item_id', foundItemId)
            .maybeSingle();

        let matchId;
        let createdMatch;

        if (existingMatch) {
            matchId = existingMatch.match_id;
            createdMatch = existingMatch;
        } else {
            // 2. Insert into item_match
            const { data: newMatchData, error: matchErr } = await supabase
                .from('item_match')
                .insert([{
                    lost_item_id: lostItemId,
                    found_item_id: foundItemId,
                    similarity_score: similarity,
                    match_status: 'Pending'
                }])
                .select()
                .single();

            if (matchErr) {
                console.error('[MatchHelper] Error creating item_match:', matchErr.message);
                return null;
            }

            createdMatch = newMatchData;
            matchId = newMatchData.match_id;
        }

        // 3. Create notifications for both users if not already notified
        const notifications = [];
        const shortLost = (lostDesc || 'item').replace(/\s+/g, ' ').trim().slice(0, 35);
        const shortFound = (foundDesc || 'item').replace(/\s+/g, ' ').trim().slice(0, 35);

        if (lostUserId) {
            notifications.push({
                user_id: lostUserId,
                message: `Possible match found (${similarity}% similarity) for your lost "${shortLost}"! Match #${matchId}`,
                is_read: false
            });
        }

        if (foundUserId && foundUserId !== lostUserId) {
            notifications.push({
                user_id: foundUserId,
                message: `Your found "${shortFound}" matched a reported lost item (${similarity}% similarity)! Match #${matchId}`,
                is_read: false
            });
        }

        if (notifications.length > 0 && !existingMatch) {
            const { error: notifErr } = await supabase
                .from('notification')
                .insert(notifications);

            if (notifErr) {
                console.error('[MatchHelper] Error creating notifications:', notifErr.message);
            }
        }

        return createdMatch;
    } catch (err) {
        console.error('[MatchHelper] Error processing match and notify:', err.message);
        return null;
    }
}

module.exports = {
    MATCH_THRESHOLD,
    recordMatchAndNotify,
};
