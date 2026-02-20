const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');

// GET availability for a match
router.get('/match/:matchId', (req, res) => {
  const db = getDb();
  const availability = db.prepare(`
    SELECT pa.*, p.name, p.cell, p.email
    FROM player_availability pa
    JOIN players p ON p.id = pa.player_id
    WHERE pa.match_id = ?
    ORDER BY p.name
  `).all(req.params.matchId);
  res.json(availability);
});

// GET availability page data via token (public, no auth)
router.get('/respond/:token', (req, res) => {
  const db = getDb();
  const tokenRow = db.prepare(`
    SELECT at.*, p.name as player_name, p.cell, p.email
    FROM availability_tokens at
    JOIN players p ON p.id = at.player_id
    WHERE at.token = ?
  `).get(req.params.token);

  if (!tokenRow) return res.status(404).json({ error: 'Invalid or expired link' });

  const match = db.prepare(`
    SELECT m.*, o.name as opponent_name, s.name as season_name
    FROM matches m
    LEFT JOIN opponents o ON o.id = m.opponent_id
    LEFT JOIN seasons s ON s.id = m.season_id
    WHERE m.id = ?
  `).get(tokenRow.match_id);

  if (!match) return res.status(404).json({ error: 'Match not found' });

  const lines = db.prepare('SELECT * FROM match_lines WHERE match_id = ? ORDER BY line_number').all(match.id);

  const currentAvailability = db.prepare(`
    SELECT * FROM player_availability WHERE player_id = ? AND match_id = ?
  `).all(tokenRow.player_id, tokenRow.match_id);

  res.json({
    player: { id: tokenRow.player_id, name: tokenRow.player_name },
    match,
    lines: match.use_custom_dates ? lines : null,
    currentAvailability,
    token: req.params.token
  });
});

// POST respond to availability (public)
router.post('/respond/:token', (req, res) => {
  const { responses } = req.body;
  // responses: [{ match_line_id (or null), available: true/false }]
  const db = getDb();

  const tokenRow = db.prepare('SELECT * FROM availability_tokens WHERE token = ?').get(req.params.token);
  if (!tokenRow) return res.status(404).json({ error: 'Invalid link' });

  const upsert = db.prepare(`
    INSERT INTO player_availability (player_id, match_id, match_line_id, available, response_date)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(player_id, match_id, match_line_id) DO UPDATE SET
      available=excluded.available, response_date=CURRENT_TIMESTAMP
  `);

  const saveAll = db.transaction(() => {
    if (!Array.isArray(responses)) return;
    for (const r of responses) {
      upsert.run(tokenRow.player_id, tokenRow.match_id, r.match_line_id || null, r.available ? 1 : 0);
    }
  });
  saveAll();

  res.json({ success: true, message: 'Availability saved!' });
});

// POST generate tokens and get SMS links for a match
router.post('/notify/:matchId', (req, res) => {
  const db = getDb();
  const match = db.prepare(`
    SELECT m.*, o.name as opponent_name
    FROM matches m LEFT JOIN opponents o ON o.id = m.opponent_id
    WHERE m.id = ?
  `).get(req.params.matchId);
  if (!match) return res.status(404).json({ error: 'Match not found' });

  const players = db.prepare('SELECT * FROM players WHERE active = 1').all();
  const baseUrl = req.body.base_url || process.env.BASE_URL || 'http://localhost:5173';

  const links = [];
  const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  for (const player of players) {
    // Check if token already exists
    let tokenRow = db.prepare('SELECT * FROM availability_tokens WHERE player_id = ? AND match_id = ?').get(player.id, req.params.matchId);
    if (!tokenRow) {
      const token = uuidv4();
      db.prepare('INSERT INTO availability_tokens (player_id, match_id, token, expires_at) VALUES (?, ?, ?, ?)').run(player.id, req.params.matchId, token, expiry);
      tokenRow = db.prepare('SELECT * FROM availability_tokens WHERE token = ?').get(token);
    }

    const link = `${baseUrl}/availability/${tokenRow.token}`;
    const dateStr = match.match_date;
    const opponent = match.opponent_name || 'TBD';
    const message = `Hi ${player.name}! Tennis match vs ${opponent} on ${dateStr}. Please indicate your availability: ${link}`;

    links.push({ player, link, message, token: tokenRow.token });
  }

  res.json({ links });
});

// POST send SMS via Twilio
router.post('/send-sms', async (req, res) => {
  const { messages } = req.body; // [{ to, body }]

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    return res.status(400).json({ error: 'Twilio not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER in .env' });
  }

  try {
    const twilio = require('twilio')(accountSid, authToken);
    const results = [];
    for (const msg of messages) {
      if (!msg.to) continue;
      try {
        const result = await twilio.messages.create({ body: msg.body, from: fromNumber, to: msg.to });
        results.push({ to: msg.to, sid: result.sid, status: 'sent' });
      } catch (err) {
        results.push({ to: msg.to, error: err.message, status: 'failed' });
      }
    }
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST send line assignment SMS
router.post('/notify-assignment/:matchId', async (req, res) => {
  const db = getDb();
  const match = db.prepare(`
    SELECT m.*, o.name as opponent_name
    FROM matches m LEFT JOIN opponents o ON o.id = m.opponent_id
    WHERE m.id = ?
  `).get(req.params.matchId);
  if (!match) return res.status(404).json({ error: 'Match not found' });

  const lines = db.prepare('SELECT * FROM match_lines WHERE match_id = ? ORDER BY line_number').all(match.id);
  const messages = [];

  for (const line of lines) {
    const players = db.prepare(`
      SELECT mlp.*, p.name, p.cell
      FROM match_line_players mlp
      JOIN players p ON p.id = mlp.player_id
      WHERE mlp.match_line_id = ?
      ORDER BY mlp.position
    `).all(line.id);

    if (players.length === 0) continue;

    const lineLabel = `${line.line_type === 'doubles' ? 'Doubles' : 'Singles'} Line ${line.line_number}`;
    const opponent = match.opponent_name || 'TBD';
    const dateStr = line.custom_date || match.match_date;
    const timeStr = line.custom_time || match.match_time || '';
    const location = match.is_home ? 'Home' : `Away at ${match.away_address || 'TBD'}`;
    const partnerNames = players.filter((_, i) => i > 0).map(p => p.name).join(', ');

    for (const player of players) {
      if (!player.cell) continue;
      const partner = partnerNames && player.name !== partnerNames ? ` Partner: ${players.filter(p => p.id !== player.player_id).map(p => p.name).join(', ')}.` : '';
      const body = `Hi ${player.name}! You're playing ${lineLabel} vs ${opponent} on ${dateStr}${timeStr ? ' at ' + timeStr : ''} (${location}).${partner} Good luck!`;
      messages.push({ player, body });
    }
  }

  res.json({ messages });
});

module.exports = router;
