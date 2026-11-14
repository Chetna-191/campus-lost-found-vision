const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const authRoutes = require('./routes/auth');
const lostItemsRoutes = require('./routes/lostItems');
const foundItemsRoutes = require('./routes/foundItems');
const categoriesRoutes = require('./routes/categories');
const locationsRoutes = require('./routes/locations');
const notificationsRoutes = require('./routes/notifications');
const matchesRoutes = require('./routes/matches');
const adminRoutes = require('./routes/admin');

const app = express();

// Trust reverse proxy (e.g. Render, Heroku, Nginx) so express-rate-limit detects client IP
app.set('trust proxy', 1);

// Security Headers (CSP set to false to accommodate vanilla inline scripts)
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

// CORS Configuration
const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use(cors({
    origin: corsOrigin === '*' ? '*' : corsOrigin.split(',').map(s => s.trim()),
    credentials: true
}));

app.use(express.json());

// Gate demo-bar.js: only served when DEMO_MODE is true
app.get('/demo-bar.js', (req, res, next) => {
    if (process.env.DEMO_MODE !== 'true') {
        return res.type('application/javascript').send('/* Demo mode disabled */');
    }
    next();
});

// Serve static frontend files
app.use(express.static('public'));

// Public configuration route (e.g., checks if demo mode is enabled)
app.get('/api/config', (req, res) => {
    res.json({
        demo_mode: process.env.DEMO_MODE === 'true'
    });
});

// Test API & Health routes (Render / Load balancer health check)
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', service: 'Campus Lost & Found API' });
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'healthy', service: 'Campus Lost & Found API' });
});

// Auth routes
app.use('/api/auth', authRoutes);

// Admin routes (Protected by requireAdmin middleware)
app.use('/api/admin', adminRoutes);

// Lost & Found Item routes
app.use('/api/lost-items', lostItemsRoutes);
app.use('/api/found-items', foundItemsRoutes);

// AI Matches & Notifications routes
app.use('/api/notifications', notificationsRoutes);
app.use('/api/matches', matchesRoutes);

// Metadata routes
app.use('/api/categories', categoriesRoutes);
app.use('/api/locations', locationsRoutes);

const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
    console.log(`Campus Lost & Found server listening on port ${PORT}`);
    if (process.env.DEMO_MODE === 'true') {
        console.log(`[DEMO MODE ACTIVE] Quick demo login and floating demo toolbar enabled.`);
    }
});
