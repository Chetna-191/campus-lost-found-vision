/**
 * Admin Authorization Middleware
 * Verifies that the request has a valid JWT and the authenticated user has is_admin = true.
 */

const jwt = require('jsonwebtoken');
const supabase = require('../db');

async function requireAdmin(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // "Bearer TOKEN"

    if (!token) {
        return res.status(401).json({ error: 'Authentication required. No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;

        // Verify admin status from database
        const { data: user, error } = await supabase
            .from('users')
            .select('user_id, reg_no, first_name, last_name, email, is_admin')
            .eq('user_id', decoded.user_id)
            .maybeSingle();

        if (error || !user || !user.is_admin) {
            return res.status(403).json({ error: 'Access denied. Administrator privileges required.' });
        }

        req.adminUser = user;
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Invalid or expired authentication token.' });
    }
}

module.exports = requireAdmin;

