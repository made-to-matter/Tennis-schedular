const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

// Public routes (no auth — player-facing availability links)
app.use('/api/availability', require('./routes/availability'));

// Protected routes (require captain auth)
const auth = require('./middleware/auth');
app.use('/api/teams', auth, require('./routes/teams'));
app.use('/api/players', auth, require('./routes/players'));
app.use('/api/opponents', auth, require('./routes/opponents'));
app.use('/api/seasons', auth, require('./routes/seasons'));
app.use('/api/matches', auth, require('./routes/matches'));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

module.exports = app;
