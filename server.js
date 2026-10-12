const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const lostItemsRoutes = require('./routes/lostItems');
const foundItemsRoutes = require('./routes/foundItems');
const categoriesRoutes = require('./routes/categories');
const locationsRoutes = require('./routes/locations');
const notificationsRoutes = require('./routes/notifications');
const matchesRoutes = require('./routes/matches');

const app = express();
app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static('public'));

// Test API route
app.get('/api/health', (req, res) => {
    res.send('Campus Lost & Found API is running!');
});

// Auth routes
app.use('/api/auth', authRoutes);

// Lost & Found Item routes
app.use('/api/lost-items', lostItemsRoutes);
app.use('/api/found-items', foundItemsRoutes);

// AI Matches & Notifications routes
app.use('/api/notifications', notificationsRoutes);
app.use('/api/matches', matchesRoutes);

// Metadata routes
app.use('/api/categories', categoriesRoutes);
app.use('/api/locations', locationsRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});