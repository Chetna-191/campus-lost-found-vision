const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://127.0.0.1:5050';

async function testE2E() {
    console.log('--- Starting E2E Match Flow Test ---');

    // Step 1: Register Account 1 (Lost Reporter)
    const randSuffix1 = Math.floor(10000000000000 + Math.random() * 90000000000000);
    const user1Reg = `RA${randSuffix1}`;
    const user1Email = `lost_student_${Date.now()}@campus.edu`;
    const user1Pass = 'Password123!';
    console.log(`1. Registering User 1: ${user1Reg}`);
    const reg1Res = await fetch(`${BASE_URL}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            first_name: 'Rahul',
            last_name: 'Sharma',
            email: user1Email,
            password: user1Pass,
            reg_no: user1Reg,
            department: 'Computer Science',
            phone: '9876543210'
        })
    });
    const reg1Data = await reg1Res.json();
    console.log('User 1 Registered:', reg1Data.message || reg1Data);

    const login1Res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reg_no: user1Reg, password: user1Pass })
    });
    const login1Data = await login1Res.json();
    const token1 = login1Data.token;
    const user1Id = login1Data.user?.user_id;

    // Step 2: Register Account 2 (Found Reporter)
    const randSuffix2 = Math.floor(10000000000000 + Math.random() * 90000000000000);
    const user2Reg = `RA${randSuffix2}`;
    const user2Email = `found_student_${Date.now()}@campus.edu`;
    const user2Pass = 'Password123!';
    console.log(`2. Registering User 2: ${user2Reg}`);
    const reg2Res = await fetch(`${BASE_URL}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            first_name: 'Priya',
            last_name: 'Verma',
            email: user2Email,
            password: user2Pass,
            reg_no: user2Reg,
            department: 'Information Tech',
            phone: '9123456780'
        })
    });
    const reg2Data = await reg2Res.json();
    console.log('User 2 Registered:', reg2Data.message || reg2Data);

    const login2Res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reg_no: user2Reg, password: user2Pass })
    });
    const login2Data = await login2Res.json();
    const token2 = login2Data.token;
    const user2Id = login2Data.user?.user_id;

    // Image for matching test
    const imagePath = path.join(__dirname, 'ai-service', 'test_sample.jpg');
    const imageBuffer = fs.readFileSync(imagePath);

    // Step 3: Account 1 reports a Lost Item
    console.log('3. User 1 reporting Lost Item...');
    const form1 = new FormData();
    form1.append('category_id', '2'); // Bag
    form1.append('location_id', '1'); // Library or Campus
    form1.append('description', 'Navy blue Wildcraft backpack with laptop compartment');
    form1.append('date_lost', new Date().toISOString().split('T')[0]);
    form1.append('photo', new Blob([imageBuffer], { type: 'image/jpeg' }), 'backpack_lost.jpg');

    const lostRes = await fetch(`${BASE_URL}/api/lost-items`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token1}` },
        body: form1
    });
    const lostItem = await lostRes.json();
    console.log('Lost item created:', lostItem.lost_item_id, lostItem.description);

    // Step 4: Account 2 reports a matching Found Item
    console.log('4. User 2 reporting matching Found Item...');
    const form2 = new FormData();
    form2.append('category_id', '2'); // Bag
    form2.append('location_id', '1');
    form2.append('description', 'Found blue backpack left on 2nd floor library desk');
    form2.append('date_found', new Date().toISOString().split('T')[0]);
    form2.append('photo', new Blob([imageBuffer], { type: 'image/jpeg' }), 'backpack_found.jpg');

    const foundRes = await fetch(`${BASE_URL}/api/found-items`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token2}` },
        body: form2
    });
    const foundItem = await foundRes.json();
    console.log('Found item created:', foundItem.found_item_id, foundItem.description);
    console.log('AI Saved Matches:', foundItem.ai ? foundItem.ai.saved_matches : 'None');

    // Step 5: Check Notifications for User 1
    console.log('5. Fetching notifications for User 1 (Lost Owner)...');
    const notif1Res = await fetch(`${BASE_URL}/api/notifications`, {
        headers: { 'Authorization': `Bearer ${token1}` }
    });
    const notifs1 = await notif1Res.json();
    console.log('User 1 Notifications:', JSON.stringify(notifs1, null, 2));

    // Step 6: Check Notifications for User 2
    console.log('6. Fetching notifications for User 2 (Found Reporter)...');
    const notif2Res = await fetch(`${BASE_URL}/api/notifications`, {
        headers: { 'Authorization': `Bearer ${token2}` }
    });
    const notifs2 = await notif2Res.json();
    console.log('User 2 Notifications:', JSON.stringify(notifs2, null, 2));

    const matchId = notifs1[0]?.match_id || notifs2[0]?.match_id || (foundItem.ai?.saved_matches?.[0]?.match_id);
    console.log('Identified Match ID:', matchId);

    if (matchId) {
        // Step 7: Get Match Details
        console.log(`7. Fetching match details for match #${matchId}...`);
        const matchRes = await fetch(`${BASE_URL}/api/matches/${matchId}`, {
            headers: { 'Authorization': `Bearer ${token1}` }
        });
        const matchData = await matchRes.json();
        console.log('Match details:', {
            match_id: matchData.match_id,
            status: matchData.match_status,
            similarity: matchData.similarity_score,
            lost_user: matchData.lost_item?.users?.first_name,
            found_user: matchData.found_item?.users?.first_name
        });

        // Step 8: Test Confirm status update
        console.log(`8. User 1 confirming match #${matchId}...`);
        const patchRes = await fetch(`${BASE_URL}/api/matches/${matchId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token1}`
            },
            body: JSON.stringify({ status: 'Confirmed' })
        });
        const patchData = await patchRes.json();
        console.log('Update result:', patchData);
    }

    console.log('--- Test Completed Successfully! ---');
    console.log(`Test account 1: email=${user1Email} pass=${user1Pass}`);
    console.log(`Test account 2: email=${user2Email} pass=${user2Pass}`);
}

testE2E().catch(console.error);
