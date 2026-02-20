require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/players', require('./routes/players'));
app.use('/api/opponents', require('./routes/opponents'));
app.use('/api/seasons', require('./routes/seasons'));
app.use('/api/matches', require('./routes/matches'));
app.use('/api/availability', require('./routes/availability'));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`Tennis Scheduler API running on port ${PORT}`);
});

module.exports = app;
