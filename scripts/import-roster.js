/**
 * Roster Whitelist Import Script
 * Reads roster.csv (reg_no, name, college_email) and upserts records into Supabase 'students' table.
 * Usage: node scripts/import-roster.js [path/to/roster.csv]
 */

const fs = require('fs');
const path = require('path');
const supabase = require('../db');

async function importRoster() {
    try {
        const filePath = process.argv[2] 
            ? path.resolve(process.argv[2]) 
            : path.join(__dirname, '..', 'roster.csv');

        console.log(`[Roster Import] Reading CSV from: ${filePath}`);

        if (!fs.existsSync(filePath)) {
            console.error(`[Roster Import] Error: File not found at ${filePath}`);
            process.exit(1);
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

        if (lines.length <= 1) {
            console.warn('[Roster Import] CSV is empty or only contains headers.');
            return;
        }

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const regIdx = headers.indexOf('reg_no');
        const nameIdx = headers.indexOf('name');
        const emailIdx = headers.indexOf('college_email');

        if (regIdx === -1 || nameIdx === -1 || emailIdx === -1) {
            throw new Error(`CSV must have headers: reg_no, name, college_email. Found: ${lines[0]}`);
        }

        const students = [];
        for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(',').map(p => p.trim());
            if (parts.length >= 3) {
                const reg_no = parts[regIdx];
                const name = parts[nameIdx];
                const college_email = parts[emailIdx].toLowerCase();

                if (reg_no && name && college_email) {
                    students.push({
                        reg_no,
                        name,
                        college_email
                    });
                }
            }
        }

        console.log(`[Roster Import] Parsed ${students.length} student records. Upserting into database...`);

        const { data, error } = await supabase
            .from('students')
            .upsert(students, { onConflict: 'reg_no' })
            .select();

        if (error) {
            throw error;
        }

        console.log(`[Roster Import] Successfully upserted ${students.length} students into the whitelist!`);
        students.forEach(s => {
            console.log(` - ${s.reg_no}: ${s.name} <${s.college_email}>`);
        });

    } catch (err) {
        console.error('[Roster Import] Failed to import roster:', err.message);
        process.exit(1);
    }
}

importRoster();

