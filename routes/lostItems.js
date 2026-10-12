const express = require('express');
const multer = require('multer');
const supabase = require('../db');
const verifyToken = require('../middleware/auth');
const uploadImage = require('../uploadHelper');
const { detectImage, findMatches, mapClassToCategoryId } = require('../aiService');
const { recordMatchAndNotify } = require('../matchHelper');

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// ============ AUTO-DETECT FROM IMAGE (PREVIEW / AUTO-FILL) ============
// POST /detect - Accepts image and returns detected labels + suggested category
router.post('/detect', upload.single('photo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image file uploaded for detection' });
        }

        const detection = await detectImage(req.file.buffer, req.file.originalname, req.file.mimetype);

        const { data: categories } = await supabase.from('category').select('*');
        const suggestedCategoryId = detection && detection.top_class
            ? mapClassToCategoryId(detection.top_class, categories || [])
            : null;

        const suggestedCategory = categories && suggestedCategoryId
            ? categories.find(c => c.category_id === suggestedCategoryId)
            : null;

        res.json({
            detection,
            suggested_category_id: suggestedCategoryId,
            suggested_category_name: suggestedCategory ? suggestedCategory.category_name : null,
        });
    } catch (err) {
        console.error('Error in lost item detect endpoint:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============ CREATE LOST ITEM ============
// POST / - Protected by JWT middleware, accepts single file field 'photo'
router.post('/', verifyToken, upload.single('photo'), async (req, res) => {
    try {
        let { category_id, location_id, description, date_lost } = req.body;
        const user_id = req.user.user_id;

        let image_url = null;
        let aiDetection = null;
        let potentialMatches = [];

        if (req.file) {
            // 1. Run YOLO object detection
            aiDetection = await detectImage(req.file.buffer, req.file.originalname, req.file.mimetype);

            // Auto-tag category if not provided
            if (!category_id && aiDetection && aiDetection.top_class) {
                const { data: categories } = await supabase.from('category').select('*');
                category_id = mapClassToCategoryId(aiDetection.top_class, categories || []);
            }

            // 2. Upload photo to Supabase Storage
            image_url = await uploadImage(req.file, 'lost');

            // 3. Search for potential matches against reported found items
            potentialMatches = await findMatches(req.file.buffer, 'found_item', {
                minSimilarity: 50,
                limit: 5,
                categoryId: category_id || null,
            });
        }

        const { data, error } = await supabase
            .from('lost_item')
            .insert([{
                category_id: category_id || null,
                location_id,
                description,
                date_lost,
                user_id,
                image_url
            }])
            .select('*, category(category_name), location(location_name)');

        if (error) throw error;

        const createdItem = data[0];

        // 4. Save matches >= 80% to item_match & notify both users
        const savedMatches = [];
        if (potentialMatches && potentialMatches.length > 0) {
            for (const match of potentialMatches) {
                if (match.similarity >= 80 && match.item) {
                    const matchRecord = await recordMatchAndNotify({
                        lostItemId: createdItem.lost_item_id,
                        foundItemId: match.item.found_item_id,
                        lostUserId: user_id,
                        foundUserId: match.item.user_id,
                        similarity: match.similarity,
                        lostDesc: createdItem.description,
                        foundDesc: match.item.description
                    });
                    if (matchRecord) {
                        savedMatches.push(matchRecord);
                    }
                }
            }
        }

        res.status(201).json({
            ...createdItem,
            ai: {
                detected: aiDetection ? aiDetection.detected : false,
                top_class: aiDetection ? aiDetection.top_class : null,
                confidence: aiDetection ? aiDetection.confidence : 0,
                detections: aiDetection ? aiDetection.detections : [],
                matches: potentialMatches,
                saved_matches: savedMatches,
            }
        });
    } catch (err) {
        console.error('Error creating lost item:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============ GET AI MATCHES FOR A SPECIFIC LOST ITEM ============
// GET /:id/matches - Compares item's image with reported found items
router.get('/:id/matches', async (req, res) => {
    try {
        const { id } = req.params;

        const { data: lostItem, error } = await supabase
            .from('lost_item')
            .select('*')
            .eq('lost_id', id)
            .single();

        if (error || !lostItem) {
            return res.status(404).json({ error: 'Lost item not found' });
        }

        if (!lostItem.image_url) {
            return res.json({ matches: [], message: 'Item does not have an image to compare' });
        }

        const { fetchImageBuffer } = require('../aiService');
        const buffer = await fetchImageBuffer(lostItem.image_url);
        if (!buffer) {
            return res.status(500).json({ error: 'Could not fetch image for comparison' });
        }

        const matches = await findMatches(buffer, 'found_item', {
            minSimilarity: 50,
            limit: 10,
            categoryId: lostItem.category_id,
        });

        res.json({ lost_item: lostItem, matches });
    } catch (err) {
        console.error('Error fetching lost item matches:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============ GET USER'S LOST ITEMS ============
// GET /my - Protected, returns lost_item rows for logged-in user
router.get('/my', verifyToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('lost_item')
            .select('*, category(category_name), location(location_name)')
            .eq('user_id', req.user.user_id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ GET ALL LOST ITEMS ============
// GET / - Public, returns all lost_item rows joined with category & location names
router.get('/', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('lost_item')
            .select('*, category(category_name), location(location_name)')
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
