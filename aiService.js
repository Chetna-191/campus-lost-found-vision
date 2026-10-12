const supabase = require('./db');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';

/**
 * Sends an image buffer to FastAPI /detect endpoint
 * @param {Buffer} fileBuffer
 * @param {string} originalname
 * @param {string} mimetype
 * @returns {Promise<{detected: boolean, top_class: string|null, confidence: number, detections: Array}|null>}
 */
async function detectImage(fileBuffer, originalname = 'image.jpg', mimetype = 'image/jpeg') {
    try {
        const formData = new FormData();
        const blob = new Blob([fileBuffer], { type: mimetype });
        formData.append('file', blob, originalname);

        const response = await fetch(`${AI_SERVICE_URL}/detect`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            console.warn(`[AI Service] /detect returned status ${response.status}`);
            return null;
        }

        return await response.json();
    } catch (err) {
        console.error('[AI Service] Failed to call /detect:', err.message);
        return null;
    }
}

/**
 * Compares two image buffers using FastAPI /compare endpoint
 * @param {Buffer} buffer1
 * @param {Buffer} buffer2
 * @returns {Promise<{similarity: number, raw_cosine_similarity: number}|null>}
 */
async function compareImages(buffer1, buffer2) {
    try {
        const formData = new FormData();
        formData.append('file1', new Blob([buffer1], { type: 'image/jpeg' }), 'file1.jpg');
        formData.append('file2', new Blob([buffer2], { type: 'image/jpeg' }), 'file2.jpg');

        const response = await fetch(`${AI_SERVICE_URL}/compare`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            console.warn(`[AI Service] /compare returned status ${response.status}`);
            return null;
        }

        return await response.json();
    } catch (err) {
        console.error('[AI Service] Failed to call /compare:', err.message);
        return null;
    }
}

/**
 * Downloads an image from a public URL and returns a Buffer
 * @param {string} url
 * @returns {Promise<Buffer|null>}
 */
async function fetchImageBuffer(url) {
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const arrayBuffer = await res.arrayBuffer();
        return Buffer.from(arrayBuffer);
    } catch (err) {
        console.error(`[AI Service] Failed to download image from ${url}:`, err.message);
        return null;
    }
}

/**
 * Finds matching candidates in targetTable ('lost_item' or 'found_item') for an uploaded image
 * @param {Buffer} sourceImageBuffer
 * @param {'lost_item'|'found_item'} targetTable
 * @param {Object} options - { minSimilarity: 50, limit: 5, categoryId: null }
 * @returns {Promise<Array<{item: Object, similarity: number}>>}
 */
async function findMatches(sourceImageBuffer, targetTable, options = {}) {
    if (!sourceImageBuffer) return [];

    const minSimilarity = options.minSimilarity ?? 50; // percentage 0 - 100
    const limit = options.limit ?? 5;

    try {
        let query = supabase
            .from(targetTable)
            .select('*, category(category_name), location(location_name)')
            .not('image_url', 'is', null)
            .order('created_at', { ascending: false })
            .limit(20);

        if (options.categoryId) {
            query = query.eq('category_id', options.categoryId);
        }

        const { data: candidates, error } = await query;
        if (error || !candidates || candidates.length === 0) {
            return [];
        }

        const matches = [];

        // Compare source image against each candidate image
        for (const candidate of candidates) {
            if (!candidate.image_url) continue;

            const candidateBuffer = await fetchImageBuffer(candidate.image_url);
            if (!candidateBuffer) continue;

            const compResult = await compareImages(sourceImageBuffer, candidateBuffer);
            if (compResult && compResult.similarity >= minSimilarity) {
                matches.push({
                    item: candidate,
                    similarity: compResult.similarity,
                    raw_cosine_similarity: compResult.raw_cosine_similarity,
                });
            }
        }

        // Sort descending by similarity
        matches.sort((a, b) => b.similarity - a.similarity);

        return matches.slice(0, limit);
    } catch (err) {
        console.error(`[AI Service] Error matching against ${targetTable}:`, err.message);
        return [];
    }
}

/**
 * Attempts to match a YOLO detected class name with an existing Category ID
 * @param {string} detectedClass
 * @param {Array<{category_id: number, category_name: string}>} categories
 * @returns {number|null} category_id
 */
function mapClassToCategoryId(detectedClass, categories) {
    if (!detectedClass || !categories || !categories.length) return null;

    const lowerClass = detectedClass.toLowerCase();

    // Mapping dictionary from common YOLO classes to campus categories
    const classMapping = {
        'backpack': ['bag', 'backpack', 'bags'],
        'handbag': ['bag', 'handbag', 'bags'],
        'suitcase': ['bag', 'luggage', 'bags'],
        'laptop': ['electronics', 'laptop', 'tech', 'gadgets'],
        'cell phone': ['electronics', 'phone', 'mobile', 'gadgets'],
        'mouse': ['electronics', 'accessories', 'gadgets'],
        'keyboard': ['electronics', 'gadgets'],
        'bottle': ['bottle', 'water bottle', 'accessories', 'daily use'],
        'cup': ['bottle', 'accessories', 'daily use'],
        'book': ['books', 'stationery', 'study material'],
        'umbrella': ['accessories', 'daily use', 'umbrella'],
        'clock': ['electronics', 'watch', 'accessories'],
        'sports ball': ['sports', 'accessories'],
        'scissors': ['stationery', 'accessories']
    };

    const targetKeywords = classMapping[lowerClass] || [lowerClass];

    for (const cat of categories) {
        const catNameLower = cat.category_name.toLowerCase();
        for (const kw of targetKeywords) {
            if (catNameLower.includes(kw) || kw.includes(catNameLower)) {
                return cat.category_id;
            }
        }
    }

    return null;
}

module.exports = {
    detectImage,
    compareImages,
    findMatches,
    mapClassToCategoryId,
};
