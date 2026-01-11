const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Models ensure karein
require('./models/Series');
require('./models/Episode');

app.use(express.static(path.join(__dirname, '../public')));

// Routes
const adminRoutes = require('./routes/admin.routes');
app.use('/api/admin', adminRoutes);

app.get('/', (req, res) => {
    res.send('Stream Weaver Backend Running');
});

module.exports = app;
