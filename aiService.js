const supabase = require('./db');

const AI_SERVICE_URL = (process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');

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
 * Compares an item text description with an image buffer using FastAPI /compare-text endpoint
 * @param {string} text
 * @param {Buffer} imageBuffer
 * @returns {Promise<{similarity: number, raw_cosine_similarity: number}|null>}
 */
async function compareTextAndImage(text, imageBuffer) {
    if (!text || !text.trim() || !imageBuffer) return null;

    try {
        const formData = new FormData();
        formData.append('text', text.trim());
        formData.append('file', new Blob([imageBuffer], { type: 'image/jpeg' }), 'item.jpg');

        const response = await fetch(`${AI_SERVICE_URL}/compare-text`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            console.warn(`[AI Service] /compare-text returned status ${response.status}`);
            return null;
        }

        return await response.json();
    } catch (err) {
        console.error('[AI Service] Failed to call /compare-text:', err.message);
        return null;
    }
}

/**
 * Builds a natural language search text from an item's structured details
 * @param {Object} item
 * @returns {string}
 */
function buildItemTextDescription(item) {
    if (!item) return '';
    const parts = [];

    const categoryName = item.category?.category_name || item.category_name;
    if (categoryName) parts.push(categoryName);
    if (item.color) parts.push(item.color);
    if (item.brand) parts.push(item.brand);
    if (item.description) parts.push(item.description);

    if (item.distinguishing_marks && item.distinguishing_marks.trim().toLowerCase() !== 'none') {
        parts.push(`with ${item.distinguishing_marks.trim()}`);
    }
    if (item.contents_details && item.contents_details.trim().toLowerCase() !== 'none') {
        parts.push(`containing ${item.contents_details.trim()}`);
    }

    return parts.join(' ').replace(/\s+/g, ' ').trim() || (item.description || 'Lost campus item');
}

/**
 * Finds matching candidates in targetTable ('found_item' or 'lost_item') for a text description
 * Keeps up to the top 3 candidates per item as per requirement
 * @param {string} textDescription
 * @param {'found_item'|'lost_item'} targetTable
 * @param {Object} options - { minSimilarity: 22, limit: 3, categoryId: null }
 * @returns {Promise<Array<{item: Object, similarity: number, raw_cosine_similarity: number, matchType: string}>>}
 */
async function findMatchesText(textDescription, targetTable = 'found_item', options = {}) {
    if (!textDescription || !textDescription.trim()) return [];

    const envThreshold = process.env.TEXT_IMAGE_MATCH_THRESHOLD
        ? (parseFloat(process.env.TEXT_IMAGE_MATCH_THRESHOLD) <= 1
            ? parseFloat(process.env.TEXT_IMAGE_MATCH_THRESHOLD) * 100
            : parseFloat(process.env.TEXT_IMAGE_MATCH_THRESHOLD))
        : 22;

    const minSimilarity = options.minSimilarity ?? envThreshold;
    const limit = options.limit ?? 3; // Keep top 3 candidates per requirement

    try {
        let query = supabase
            .from(targetTable)
            .select('*, category(category_name), location(location_name)')
            .not('image_url', 'is', null)
            .order('created_at', { ascending: false })
            .limit(30);

        if (options.categoryId) {
            query = query.eq('category_id', options.categoryId);
        }

        const { data: candidates, error } = await query;
        if (error || !candidates || candidates.length === 0) {
            return [];
        }

        const matches = [];

        for (const candidate of candidates) {
            if (!candidate.image_url) continue;

            const candidateBuffer = await fetchImageBuffer(candidate.image_url);
            if (!candidateBuffer) continue;

            const compResult = await compareTextAndImage(textDescription, candidateBuffer);
            if (compResult && compResult.similarity >= minSimilarity) {
                matches.push({
                    item: candidate,
                    similarity: compResult.similarity,
                    raw_cosine_similarity: compResult.raw_cosine_similarity,
                    matchType: 'text-image'
                });
            }
        }

        // Sort descending by similarity score
        matches.sort((a, b) => b.similarity - a.similarity);

        return matches.slice(0, limit);
    } catch (err) {
        console.error(`[AI Service] Error matching text against ${targetTable}:`, err.message);
        return [];
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
        if (error) {
            console.error(`[AI Service] Error querying ${targetTable} candidates:`, error.message);
        }

        const matches = [];

        // Compare source image against each candidate image (image-to-image)
        if (candidates && candidates.length > 0) {
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
                        matchType: 'image-image'
                    });
                }
            }
        }

        // Sort image matches descending by similarity and keep top `limit`
        matches.sort((a, b) => b.similarity - a.similarity);
        const results = matches.slice(0, limit);

        // If targetTable is lost_item, also check text-only lost items (without photo)
        if (targetTable === 'lost_item') {
            let textQuery = supabase
                .from('lost_item')
                .select('*, category(category_name), location(location_name)')
                .is('image_url', null)
                .order('created_at', { ascending: false })
                .limit(30);

            if (options.categoryId) {
                textQuery = textQuery.eq('category_id', options.categoryId);
            }

            const { data: textCandidates, error: textErr } = await textQuery;
            if (textErr) {
                console.error(`[AI Service] Error querying text candidates from lost_item:`, textErr.message);
            } else if (textCandidates && textCandidates.length > 0) {
                const envThreshold = process.env.TEXT_IMAGE_MATCH_THRESHOLD
                    ? (parseFloat(process.env.TEXT_IMAGE_MATCH_THRESHOLD) <= 1
                        ? parseFloat(process.env.TEXT_IMAGE_MATCH_THRESHOLD) * 100
                        : parseFloat(process.env.TEXT_IMAGE_MATCH_THRESHOLD))
                    : 22;

                const textMatches = [];
                for (const textCand of textCandidates) {
                    const descText = buildItemTextDescription(textCand);
                    const compResult = await compareTextAndImage(descText, sourceImageBuffer);
                    if (compResult && compResult.similarity >= envThreshold) {
                        textMatches.push({
                            item: textCand,
                            similarity: compResult.similarity,
                            raw_cosine_similarity: compResult.raw_cosine_similarity,
                            matchType: 'text-image'
                        });
                    }
                }

                // Keep only top 3 text-image candidates
                textMatches.sort((a, b) => b.similarity - a.similarity);
                results.push(...textMatches.slice(0, 3));
            }
        }

        return results;
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

    const lowerClass = detectedClass.toLowerCase().trim();

    // Mapping dictionary from custom fine-tuned campus classes & standard COCO classes to platform categories
    const classMapping = {
        // --- 7 Active Custom Campus Classes (Trained from Roboflow Datasets) ---
        'id card': ['id card', 'id', 'cards', 'card', 'documents', 'identity', 'personal'],
        'student-card': ['id card', 'id', 'cards', 'card', 'documents', 'identity', 'personal'],
        'keys': ['key', 'keys', 'keychain', 'accessories', 'daily use'],
        'keys-f8z5': ['key', 'keys', 'keychain', 'accessories', 'daily use'],
        'wallet': ['wallet', 'purse', 'accessories', 'personal belongings', 'money', 'others'],
        'bottle': ['bottle', 'water bottle', 'flask', 'accessories', 'daily use'],
        'backpack': ['bag', 'backpack', 'bags', 'luggage', 'school bag'],
        'phone': ['electronics', 'phone', 'mobile', 'cell phone', 'gadgets', 'smartphone'],
        'laptop': ['electronics', 'laptop', 'tech', 'gadgets', 'computer', 'notebook'],

        // --- Additional Campus Classes (Reserved for Future Data Ingestion) ---
        'book': ['books', 'book', 'stationery', 'study material', 'notebook'],
        'umbrella': ['umbrella', 'accessories', 'daily use', 'others'],
        'earphones': ['electronics', 'earphones', 'headphones', 'audio', 'accessories', 'gadgets', 'airpods'],

        // --- Standard Pretrained YOLOv8 / COCO Aliases & Fallbacks ---
        'cell phone': ['electronics', 'phone', 'mobile', 'gadgets'],
        'handbag': ['bag', 'handbag', 'bags'],
        'suitcase': ['bag', 'luggage', 'bags'],
        'mouse': ['electronics', 'accessories', 'gadgets'],
        'keyboard': ['electronics', 'gadgets'],
        'cup': ['bottle', 'accessories', 'daily use'],
        'clock': ['electronics', 'watch', 'accessories'],
        'sports ball': ['sports', 'accessories'],
        'scissors': ['stationery', 'accessories']
    };

    const targetKeywords = classMapping[lowerClass] || [lowerClass];

    for (const kw of targetKeywords) {
        for (const cat of categories) {
            const catNameLower = cat.category_name.toLowerCase();
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
    compareTextAndImage,
    buildItemTextDescription,
    fetchImageBuffer,
    findMatches,
    findMatchesText,
    mapClassToCategoryId,
};
