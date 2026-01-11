const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static Files (Admin Panel ke liye)
app.use(express.static(path.join(__dirname, '../public')));

// Basic Root Route
app.get('/', (req, res) => {
    res.send('Stream Weaver Backend is Running...');
});

// Models Import (Zaroori hai taaki routes mein error na aaye)
require('./models/Series');
require('./models/Episode');

// Routes Connection
// Dhyan de: Ye line tere admin panel ko backend se jodti hai
const adminRoutes = require('./routes/admin.routes');
app.use('/api/admin', adminRoutes);

// Error Handling Middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

module.exports = app;
