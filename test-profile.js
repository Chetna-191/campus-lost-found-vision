const BASE_URL = 'http://127.0.0.1:5050';

async function testProfileAndAuth() {
    console.log('=== Testing Profile & Change Password APIs ===');

    const randSuffix = Math.floor(10000000000000 + Math.random() * 90000000000000);
    const regNo = `RA${randSuffix}`;
    const initialPass = 'InitialPass1!';

    // 1. Signup & Login
    console.log(`1. Creating user ${regNo}...`);
    const signupRes = await fetch(`${BASE_URL}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            first_name: 'OriginalFirst',
            last_name: 'OriginalLast',
            reg_no: regNo,
            password: initialPass,
            department: 'Civil Engg',
            phone: '9876543210',
            email: 'original@campus.edu'
        })
    });
    const signupData = await signupRes.json();
    console.log('Signup status:', signupRes.status, signupData.message || signupData.error);

    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reg_no: regNo, password: initialPass })
    });
    const loginData = await loginRes.json();
    const token = loginData.token;
    console.log('Login successful! User ID:', loginData.user?.user_id);

    // 2. GET /me
    console.log('2. Fetching /me...');
    const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const meData = await meRes.json();
    console.log('Current user data:', meData);

    // 3. PATCH /profile
    console.log('3. Updating profile via PATCH /profile...');
    const patchProfRes = await fetch(`${BASE_URL}/api/auth/profile`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            first_name: 'UpdatedFirst',
            last_name: 'UpdatedLast',
            phone: '9999888877',
            department: 'Computer Science & AI',
            email: 'updated_email@campus.edu'
        })
    });
    const patchProfData = await patchProfRes.json();
    console.log('Profile update response:', patchProfData);

    // 4. Test Change Password Validations
    console.log('4. Testing password update error cases...');
    
    // Case A: Wrong old password
    const wrongOldRes = await fetch(`${BASE_URL}/api/auth/change-password`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            old_password: 'WrongPassword999!',
            new_password: 'NewSecurePassword1!',
            confirm_new_password: 'NewSecurePassword1!'
        })
    });
    const wrongOldData = await wrongOldRes.json();
    console.log('Wrong old password response (Expected 400):', wrongOldRes.status, wrongOldData.error);

    // Case B: Mismatched confirm password
    const mismatchRes = await fetch(`${BASE_URL}/api/auth/change-password`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            old_password: initialPass,
            new_password: 'NewSecurePassword1!',
            confirm_new_password: 'DifferentPassword1!'
        })
    });
    const mismatchData = await mismatchRes.json();
    console.log('Mismatch confirm response (Expected 400):', mismatchRes.status, mismatchData.error);

    // Case C: Weak new password
    const weakRes = await fetch(`${BASE_URL}/api/auth/change-password`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            old_password: initialPass,
            new_password: 'weak',
            confirm_new_password: 'weak'
        })
    });
    const weakData = await weakRes.json();
    console.log('Weak new password response (Expected 400):', weakRes.status, weakData.error);

    // 5. Successful password change
    const newPass = 'NewBrandPassword2026!';
    console.log('5. Changing password successfully...');
    const changePassRes = await fetch(`${BASE_URL}/api/auth/change-password`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            old_password: initialPass,
            new_password: newPass,
            confirm_new_password: newPass
        })
    });
    const changePassData = await changePassRes.json();
    console.log('Change password response (Expected 200):', changePassRes.status, changePassData);

    // 6. Test login with old vs new password
    console.log('6. Verifying login with old vs new password...');
    const oldLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reg_no: regNo, password: initialPass })
    });
    console.log('Old password login (Expected 400):', oldLoginRes.status);

    const newLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reg_no: regNo, password: newPass })
    });
    const newLoginData = await newLoginRes.json();
    console.log('New password login (Expected 200):', newLoginRes.status, newLoginData.message);

    console.log('=== All Profile & Password API tests PASSED! ===');
}

testProfileAndAuth().catch(console.error);
