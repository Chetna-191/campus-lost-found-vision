/**
 * Campus Lost & Found — Interactive Demo Presentation Floating Toolbar
 * Built for smooth faculty / mentor presentation with 1-click actions and mobile responsiveness.
 */

(function () {
  // Ensure favicon is present across all pages
  if (!document.querySelector('link[rel*="icon"]')) {
    const favLink = document.createElement('link');
    favLink.rel = 'icon';
    favLink.type = 'image/svg+xml';
    favLink.href = '/favicon.svg';
    document.head.appendChild(favLink);
  }

  // Prevent duplicate injection
  if (document.getElementById('demo-presentation-root')) return;

  // Insert styles
  const style = document.createElement('style');
  style.id = 'demo-presentation-style';
  style.textContent = `
    .demo-fab {
      position: fixed;
      bottom: 22px;
      right: 22px;
      z-index: 99999;
      background: linear-gradient(135deg, #9A1A1B 0%, #E06C6B 100%);
      color: #ffffff;
      padding: 11px 18px;
      border-radius: 999px;
      box-shadow: 0 8px 24px rgba(154, 26, 27, 0.38), 0 2px 8px rgba(0,0,0,0.12);
      font-family: 'Poppins', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 13px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 9px;
      cursor: pointer;
      border: 1.5px solid rgba(255,255,255,0.3);
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      user-select: none;
    }
    .demo-fab:hover {
      transform: translateY(-2px) scale(1.03);
      box-shadow: 0 12px 28px rgba(154, 26, 27, 0.48);
    }
    .demo-pulse-dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #4ade80;
      box-shadow: 0 0 0 rgba(74, 222, 128, 0.7);
      animation: demoPulse 1.8s infinite;
    }
    @keyframes demoPulse {
      0% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.7); }
      70% { box-shadow: 0 0 0 8px rgba(74, 222, 128, 0); }
      100% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0); }
    }

    .demo-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(43, 43, 38, 0.55);
      backdrop-filter: blur(4px);
      z-index: 100000;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .demo-modal-overlay.active {
      display: flex;
    }

    .demo-modal {
      background: #FBF8F2;
      border-radius: 20px;
      max-width: 520px;
      width: 100%;
      max-height: 88vh;
      overflow-y: auto;
      box-shadow: 0 20px 48px rgba(0,0,0,0.22);
      border: 1px solid rgba(209, 205, 178, 0.8);
      font-family: 'Poppins', sans-serif;
      color: #2b2b26;
      display: flex;
      flex-direction: column;
      animation: demoModalIn 0.25s ease-out;
    }
    @keyframes demoModalIn {
      from { opacity: 0; transform: scale(0.95) translateY(10px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }

    .demo-header {
      padding: 18px 22px;
      background: #ffffff;
      border-bottom: 1px solid #e8e4d8;
      border-radius: 20px 20px 0 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .demo-title-group h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 700;
      color: #9A1A1B;
      display: flex;
      align-items: center;
      gap: 7px;
    }
    .demo-title-group p {
      margin: 3px 0 0 0;
      font-size: 11.5px;
      color: #677661;
      font-weight: 500;
    }
    .demo-close-btn {
      background: none;
      border: none;
      font-size: 22px;
      line-height: 1;
      cursor: pointer;
      color: #677661;
      padding: 4px 8px;
      border-radius: 8px;
    }
    .demo-close-btn:hover {
      background: #e8e4d8;
      color: #2b2b26;
    }

    .demo-body {
      padding: 20px 22px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .demo-status-pill {
      background: #ffffff;
      border: 1px dashed #d1cdb2;
      border-radius: 12px;
      padding: 10px 14px;
      font-size: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .demo-section-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.7px;
      font-weight: 700;
      color: #677661;
      margin-bottom: 8px;
    }

    .demo-btn-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    .demo-btn {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      padding: 11px 13px;
      border-radius: 12px;
      border: 1px solid #d1cdb2;
      background: #ffffff;
      cursor: pointer;
      text-align: left;
      transition: all 0.18s ease;
      font-family: inherit;
    }
    .demo-btn:hover {
      border-color: #9A1A1B;
      background: #fff8f8;
      transform: translateY(-1.5px);
    }
    .demo-btn .btn-head {
      font-weight: 600;
      font-size: 12.5px;
      color: #2b2b26;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .demo-btn .btn-sub {
      font-size: 11px;
      color: #677661;
      margin-top: 3px;
    }
    .demo-btn.highlight {
      background: linear-gradient(135deg, rgba(154, 26, 27, 0.08) 0%, rgba(224, 108, 107, 0.12) 100%);
      border-color: #E06C6B;
    }

    .demo-guide-card {
      background: #ffffff;
      border-radius: 12px;
      padding: 12px 14px;
      border: 1px solid #e2dfd5;
      font-size: 12px;
      line-height: 1.5;
    }
    .demo-guide-card summary {
      cursor: pointer;
      font-weight: 600;
      color: #9A1A1B;
      user-select: none;
    }
    .demo-guide-list {
      margin: 10px 0 0 0;
      padding-left: 18px;
      color: #4a4a40;
    }
    .demo-guide-list li {
      margin-bottom: 6px;
    }

    /* Mobile adjustments */
    @media (max-width: 600px) {
      .demo-fab {
        bottom: 14px;
        right: 14px;
        padding: 9px 14px;
        font-size: 12px;
      }
      .demo-btn-grid {
        grid-template-columns: 1fr;
      }
      .demo-modal {
        max-height: 92vh;
        border-radius: 16px;
      }
    }
  `;
  document.head.appendChild(style);

  // Create UI Root
  const root = document.createElement('div');
  root.id = 'demo-presentation-root';

  root.innerHTML = `
    <!-- Floating Action Button -->
    <div class="demo-fab" id="demoFabBtn" title="Open Presentation Helper">
      <span class="demo-pulse-dot"></span>
      <span>🎭 Presentation Demo</span>
    </div>

    <!-- Modal Overlay -->
    <div class="demo-modal-overlay" id="demoModalOverlay">
      <div class="demo-modal">
        <div class="demo-header">
          <div class="demo-title-group">
            <h3>🎭 Faculty Demo Mode</h3>
            <p>One-click flows for live project showcase</p>
          </div>
          <button class="demo-close-btn" id="demoCloseBtn">&times;</button>
        </div>

        <div class="demo-body">
          <!-- Current Session Status -->
          <div class="demo-status-pill">
            <div>
              <span style="color:#677661;">Current User:</span>
              <strong id="demoCurrentUserName" style="color:#9A1A1B; margin-left:5px;">Checking...</strong>
            </div>
            <button id="demoLogoutBtn" style="background:none; border:1px solid #9A1A1B; color:#9A1A1B; border-radius:14px; padding:3px 9px; font-size:11px; cursor:pointer;">Logout</button>
          </div>

          <!-- Section 1: One-Click Logins -->
          <div>
            <div class="demo-section-label">1. Quick 1-Click Login (No typing needed)</div>
            <div class="demo-btn-grid">
              <button class="demo-btn highlight" id="demoLoginRahul">
                <span class="btn-head">👤 Login: Rahul Sharma</span>
                <span class="btn-sub">Lost Bag Reporter (CS Dept)</span>
              </button>
              <button class="demo-btn highlight" id="demoLoginPriya">
                <span class="btn-head">👤 Login: Priya Verma</span>
                <span class="btn-sub">Found Bag Finder (IT Dept)</span>
              </button>
            </div>
          </div>

          <!-- Section 2: Core Live Showcase Shortcuts -->
          <div>
            <div class="demo-section-label">2. Presentation Live Demos</div>
            <div class="demo-btn-grid">
              <button class="demo-btn" id="demoShowMatch">
                <span class="btn-head">🎯 Live AI Match #2</span>
                <span class="btn-sub">100% CLIP Match + Photos</span>
              </button>
              <button class="demo-btn" id="demoOpenBrowse">
                <span class="btn-head">🔍 Browse & Filters</span>
                <span class="btn-sub">Category & Campus locations</span>
              </button>
              <button class="demo-btn" id="demoAutoFillLost">
                <span class="btn-head">📝 Auto-Fill Report Lost</span>
                <span class="btn-sub">Pre-fills Lost Backpack form</span>
              </button>
              <button class="demo-btn" id="demoAutoFillFound">
                <span class="btn-head">🎒 Auto-Fill Report Found</span>
                <span class="btn-sub">Pre-fills Found Backpack form</span>
              </button>
              <button class="demo-btn" id="demoShowNotifs">
                <span class="btn-head">🔔 View Notifications</span>
                <span class="btn-sub">Match alerts sent to students</span>
              </button>
            </div>
          </div>

          <!-- Section 3: Step-by-Step Cheatsheet for Mam -->
          <details class="demo-guide-card">
            <summary>📋 Presentation Flow Guide (What to speak & click)</summary>
            <ol class="demo-guide-list">
              <li><strong>Introduction:</strong> Show the Home page banner explaining the problem of lost student belongings.</li>
              <li><strong>Instant Login:</strong> Click <em>"Login: Rahul Sharma"</em> to show instant JWT authentication without manual typing.</li>
              <li><strong>Report Workflow:</strong> Click <em>"Auto-Fill Report Lost"</em> to show category selection, location tagging, and image upload.</li>
              <li><strong>AI Engine Highlight:</strong> Click <em>"Live AI Match #2"</em> to show mam the side-by-side comparison screen with the <strong>CLIP Visual Similarity score (100%)</strong> and confirm/reject action!</li>
              <li><strong>Notification & Security:</strong> Show the notification bell and explain student privacy and RLS policies.</li>
            </ol>
          </details>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(root);

  // References
  const fab = document.getElementById('demoFabBtn');
  const overlay = document.getElementById('demoModalOverlay');
  const closeBtn = document.getElementById('demoCloseBtn');
  const currentUserName = document.getElementById('demoCurrentUserName');
  const logoutBtn = document.getElementById('demoLogoutBtn');

  // Toggle Modal
  fab.addEventListener('click', () => {
    updateUserDisplay();
    overlay.classList.add('active');
  });

  closeBtn.addEventListener('click', () => {
    overlay.classList.remove('active');
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.classList.remove('active');
    }
  });

  function updateUserDisplay() {
    const userJson = localStorage.getItem('user');
    if (userJson) {
      try {
        const u = JSON.parse(userJson);
        currentUserName.textContent = `${u.first_name || 'Student'} (${u.reg_no || ''})`;
      } catch (e) {
        currentUserName.textContent = 'Active Session';
      }
    } else {
      currentUserName.textContent = 'Not Logged In';
    }
  }

  // 1-Click Login Handler
  async function performDemoLogin(role) {
    const originalText = currentUserName.textContent;
    currentUserName.textContent = 'Logging in...';

    try {
      const res = await fetch('/api/auth/demo-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Demo login failed');

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      updateUserDisplay();
      overlay.classList.remove('active');

      // If on auth.html or index.html, navigate to dashboard
      const currentPath = window.location.pathname;
      if (currentPath.includes('auth.html') || currentPath === '/' || currentPath.endsWith('index.html')) {
        window.location.href = '/dashboard.html';
      } else {
        window.location.reload();
      }
    } catch (err) {
      alert('Error during demo login: ' + err.message);
      currentUserName.textContent = originalText;
    }
  }

  // Bind Buttons
  document.getElementById('demoLoginRahul').addEventListener('click', () => performDemoLogin('rahul'));
  document.getElementById('demoLoginPriya').addEventListener('click', () => performDemoLogin('priya'));

  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    updateUserDisplay();
    window.location.href = '/auth.html?mode=login';
  });

  document.getElementById('demoShowMatch').addEventListener('click', () => {
    overlay.classList.remove('active');
    if (!localStorage.getItem('token')) {
      performDemoLogin('rahul').then(() => {
        window.location.href = '/match.html?id=2';
      });
    } else {
      window.location.href = '/match.html?id=2';
    }
  });

  document.getElementById('demoOpenBrowse').addEventListener('click', () => {
    overlay.classList.remove('active');
    window.location.href = '/browse.html';
  });

  document.getElementById('demoShowNotifs').addEventListener('click', () => {
    overlay.classList.remove('active');
    window.location.href = '/notifications.html';
  });

  document.getElementById('demoAutoFillLost').addEventListener('click', () => {
    overlay.classList.remove('active');
    if (!localStorage.getItem('token')) {
      performDemoLogin('rahul').then(() => {
        window.location.href = '/report-lost.html?demo=1';
      });
    } else {
      window.location.href = '/report-lost.html?demo=1';
    }
  });

  document.getElementById('demoAutoFillFound').addEventListener('click', () => {
    overlay.classList.remove('active');
    if (!localStorage.getItem('token')) {
      performDemoLogin('priya').then(() => {
        window.location.href = '/report-found.html?demo=1';
      });
    } else {
      window.location.href = '/report-found.html?demo=1';
    }
  });

  // Handle ?demo=1 autofill on report-lost.html & report-found.html
  function checkAndAutoFill() {
    updateUserDisplay();
    const params = new URLSearchParams(window.location.search);
    if (params.get('demo') === '1') {
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        const categorySelect = document.getElementById('categoryId') || document.getElementById('category');
        const locationSelect = document.getElementById('locationId') || document.getElementById('location');
        const descInput = document.getElementById('description') || document.querySelector('textarea[name="description"]');
        const dateInput = document.getElementById('dateLost') || document.getElementById('dateFound') || document.querySelector('input[type="date"]');

        const hasOptions = categorySelect && categorySelect.options.length > 1;

        if (hasOptions || attempts > 15) {
          clearInterval(interval);
          if (categorySelect && categorySelect.options.length > 1) {
            categorySelect.selectedIndex = 1; // Bag
          }
          if (locationSelect && locationSelect.options.length > 1) {
            locationSelect.selectedIndex = 1; // Campus Location
          }
          if (descInput) {
            const isFoundPage = window.location.pathname.includes('found');
            descInput.value = isFoundPage
              ? 'Found blue Wildcraft backpack left on the 2nd floor library study desk near window.'
              : 'Navy blue Wildcraft backpack with padded laptop compartment, forgotten in 2nd floor central library.';
          }
          if (dateInput) {
            dateInput.value = new Date().toISOString().split('T')[0];
          }
        }
      }, 200);
    }
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', checkAndAutoFill);
  } else {
    checkAndAutoFill();
  }
})();
