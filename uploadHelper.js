const path = require('path');
const supabase = require('./db');

/**
 * Uploads a file buffer to Supabase Storage bucket 'item-photos' under folderName
 * @param {Object} file - Multer file object (buffer, originalname, mimetype)
 * @param {string} folderName - Subfolder name in bucket ('lost' or 'found')
 * @returns {Promise<string|null>} - Returns the public URL of the uploaded file
 */
async function uploadImage(file, folderName) {
    if (!file) return null;

    const fileExt = path.extname(file.originalname);
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}${fileExt}`;
    const cleanFolder = folderName.replace(/\/$/, '');
    const filePath = `${cleanFolder}/${fileName}`;

    const { data, error } = await supabase.storage
        .from('item-photos')
        .upload(filePath, file.buffer, {
            contentType: file.mimetype,
            upsert: false
        });

    if (error) {
        throw error;
    }

    const { data: publicUrlData } = supabase.storage
        .from('item-photos')
        .getPublicUrl(filePath);

    return publicUrlData ? publicUrlData.publicUrl : null;
}

module.exports = uploadImage;
