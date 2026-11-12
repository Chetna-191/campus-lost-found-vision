/**
 * Campus Lost & Found — Universal Admin Navigation Enabler
 * Displays the "Admin" navbar link exclusively for verified administrators.
 */

(function () {
  function applyAdminNav() {
    try {
      const token = localStorage.getItem('token');
      const userStr = localStorage.getItem('user');
      if (!token || !userStr) return;

      const user = JSON.parse(userStr);
      if (!user || !user.is_admin) return;

      // Check if Admin link already exists and is visible
      const existing = document.querySelector('.nav-links a[href="/admin.html"]');
      if (existing) {
        existing.style.display = 'inline-block';
        return;
      }

      // Find navbar container
      const nav = document.querySelector('.nav-links') || document.getElementById('navContainer');
      if (!nav) return;

      const adminLink = document.createElement('a');
      adminLink.href = '/admin.html';
      adminLink.textContent = 'Admin';
      adminLink.className = 'admin-link-pill';
      adminLink.style.color = '#9a1a1b';
      adminLink.style.fontWeight = '700';
      adminLink.style.padding = '4px 10px';
      adminLink.style.borderRadius = '12px';
      adminLink.style.background = 'rgba(154, 26, 27, 0.08)';
      adminLink.style.transition = 'all 0.2s';

      if (window.location.pathname.includes('admin.html')) {
        adminLink.style.background = '#9a1a1b';
        adminLink.style.color = '#ffffff';
      }

      const userBadge = nav.querySelector('.user-badge');
      if (userBadge) {
        nav.insertBefore(adminLink, userBadge);
      } else {
        nav.appendChild(adminLink);
      }
    } catch (e) {
      // Quiet fail if json parsing fails
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyAdminNav);
  } else {
    applyAdminNav();
  }

  // Also check after any dynamic fetch finishes
  window.addEventListener('load', applyAdminNav);
})();

