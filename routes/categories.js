const express = require('express');
const supabase = require('../db');

const router = express.Router();

// GET /api/categories - Returns all categories
router.get('/', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('category')
            .select('*')
            .order('category_id', { ascending: true });

        if (error) throw error;

        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
