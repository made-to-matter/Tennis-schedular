const express = require('express');
const router = express.Router();
const { query, getClient } = require('../database');

// Helper: upsert availability row (delete + insert handles NULL match_line_id correctly)
async function upsertAvailability(client, player_id, match_id, match_line_id, available) {
  const lineId = match_line_id || null;
  await client.query(
    `DELETE FROM player_availability
     WHERE player_id = $1 AND match_id = $2
       AND (match_line_id = $3 OR (match_line_id IS NULL AND $3 IS NULL))`,
    [player_id, match_id, lineId]
  );
  await client.query(
    `INSERT INTO player_availability (player_id, match_id, match_line_id, available, response_date)
     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
    [player_id, match_id, lineId, available ? 1 : 0]
  );
}

// GET team availability page data (no auth — single shared link)
router.get('/match/:matchId/team', async (req, res) => {
  try {
    const match = (await query(`
      SELECT m.*, o.name as opponent_name, s.name as season_name, t.name as team_name
      FROM matches m
      LEFT JOIN opponents o ON o.id = m.opponent_id
      LEFT JOIN seasons s ON s.id = m.season_id
      LEFT JOIN teams t ON t.id = m.team_id
      WHERE m.id = $1
    `, [req.params.matchId])).rows[0];
    if (!match) return res.status(404).json({ error: 'Match not found' });

    let players;
    if (match.team_id) {
      players = (await query(`
        SELECT p.id, p.name FROM players p
        JOIN team_players tp ON tp.player_id = p.id
        WHERE tp.team_id = $1 AND p.active = 1
        ORDER BY p.name
      `, [match.team_id])).rows;
    } else {
      players = (await query('SELECT id, name FROM players WHERE active = 1 ORDER BY name')).rows;
    }

    const lines = (await query(
      'SELECT * FROM match_lines WHERE match_id = $1 ORDER BY line_number',
      [match.id]
    )).rows;

    res.json({ match, players, lines: match.use_custom_dates ? lines : null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET a player's current availability for a match
router.get('/match/:matchId/player/:playerId', async (req, res) => {
  try {
    const availability = (await query(
      'SELECT * FROM player_availability WHERE match_id = $1 AND player_id = $2',
      [req.params.matchId, req.params.playerId]
    )).rows;
    res.json({ availability });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST respond to availability (no token — player identified by player_id)
router.post('/match/:matchId/respond', async (req, res) => {
  const { player_id, responses } = req.body;
  const client = await getClient();
  try {
    const player = (await client.query(
      'SELECT * FROM players WHERE id = $1 AND active = 1',
      [player_id]
    )).rows[0];
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const match = (await client.query(
      'SELECT * FROM matches WHERE id = $1',
      [req.params.matchId]
    )).rows[0];
    if (!match) return res.status(404).json({ error: 'Match not found' });

    await client.query('BEGIN');
    if (Array.isArray(responses)) {
      for (const r of responses) {
        await upsertAvailability(client, player_id, req.params.matchId, r.match_line_id, r.available);
      }
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// GET availability for a match
router.get('/match/:matchId', async (req, res) => {
  try {
    const availability = (await query(`
      SELECT pa.*, p.name, p.cell, p.email
      FROM player_availability pa
      JOIN players p ON p.id = pa.player_id
      WHERE pa.match_id = $1
      ORDER BY p.name
    `, [req.params.matchId])).rows;
    res.json(availability);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET availability page data via token (public, no auth)
router.get('/respond/:token', async (req, res) => {
  try {
    const tokenRow = (await query(`
      SELECT at.*, p.name as player_name, p.cell, p.email
      FROM availability_tokens at
      JOIN players p ON p.id = at.player_id
      WHERE at.token = $1
    `, [req.params.token])).rows[0];

    if (!tokenRow) return res.status(404).json({ error: 'Invalid or expired link' });

    const match = (await query(`
      SELECT m.*, o.name as opponent_name, s.name as season_name
      FROM matches m
      LEFT JOIN opponents o ON o.id = m.opponent_id
      LEFT JOIN seasons s ON s.id = m.season_id
      WHERE m.id = $1
    `, [tokenRow.match_id])).rows[0];

    if (!match) return res.status(404).json({ error: 'Match not found' });

    const lines = (await query(
      'SELECT * FROM match_lines WHERE match_id = $1 ORDER BY line_number',
      [match.id]
    )).rows;

    const currentAvailability = (await query(
      'SELECT * FROM player_availability WHERE player_id = $1 AND match_id = $2',
      [tokenRow.player_id, tokenRow.match_id]
    )).rows;

    res.json({
      player: { id: tokenRow.player_id, name: tokenRow.player_name },
      match,
      lines: match.use_custom_dates ? lines : null,
      currentAvailability,
      token: req.params.token
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST respond to availability (public, via token)
router.post('/respond/:token', async (req, res) => {
  const { responses } = req.body;
  const client = await getClient();
  try {
    const tokenRow = (await client.query(
      'SELECT * FROM availability_tokens WHERE token = $1',
      [req.params.token]
    )).rows[0];
    if (!tokenRow) return res.status(404).json({ error: 'Invalid link' });

    await client.query('BEGIN');
    if (Array.isArray(responses)) {
      for (const r of responses) {
        await upsertAvailability(client, tokenRow.player_id, tokenRow.match_id, r.match_line_id, r.available);
      }
    }
    await client.query('COMMIT');
    res.json({ success: true, message: 'Availability saved!' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// POST generate team availability link + per-player SMS messages for a match
router.post('/notify/:matchId', async (req, res) => {
  try {
    const match = (await query(`
      SELECT m.*, o.name as opponent_name, t.name as team_name
      FROM matches m
      LEFT JOIN opponents o ON o.id = m.opponent_id
      LEFT JOIN teams t ON t.id = m.team_id
      WHERE m.id = $1
    `, [req.params.matchId])).rows[0];
    if (!match) return res.status(404).json({ error: 'Match not found' });

    let players;
    if (match.team_id) {
      players = (await query(`
        SELECT p.* FROM players p
        JOIN team_players tp ON tp.player_id = p.id
        WHERE tp.team_id = $1 AND p.active = 1
      `, [match.team_id])).rows;
    } else {
      players = (await query('SELECT * FROM players WHERE active = 1')).rows;
    }

    const baseUrl = req.body.base_url || process.env.BASE_URL || 'http://localhost:5173';
    const link = `${baseUrl}/availability/match/${req.params.matchId}`;
    const opponent = match.opponent_name || 'TBD';
    const dateStr = match.match_date;
    const teamPrefix = match.team_name ? `🎾 ${match.team_name}\n\n` : '';

    const messages = players.map(player => ({
      player,
      message: `${teamPrefix}Hi ${player.name}! Tennis match vs ${opponent} on ${dateStr}. Mark your availability: ${link}`,
    }));

    res.json({ link, messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST send SMS via Twilio
router.post('/send-sms', async (req, res) => {
  const { messages } = req.body;

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
  try {
    const match = (await query(`
      SELECT m.*, o.name as opponent_name, t.name as team_name
      FROM matches m
      LEFT JOIN opponents o ON o.id = m.opponent_id
      LEFT JOIN teams t ON t.id = m.team_id
      WHERE m.id = $1
    `, [req.params.matchId])).rows[0];
    if (!match) return res.status(404).json({ error: 'Match not found' });

    const lines = (await query(
      'SELECT * FROM match_lines WHERE match_id = $1 ORDER BY line_number',
      [match.id]
    )).rows;
    const messages = [];
    const teamPrefix = match.team_name ? `🎾 ${match.team_name}\n\n` : '';

    for (const line of lines) {
      const players = (await query(`
        SELECT mlp.*, p.name, p.cell
        FROM match_line_players mlp
        JOIN players p ON p.id = mlp.player_id
        WHERE mlp.match_line_id = $1
        ORDER BY mlp.position
      `, [line.id])).rows;

      if (players.length === 0) continue;

      const lineLabel = `${line.line_type === 'doubles' ? 'Doubles' : 'Singles'} Line ${line.line_number}`;
      const opponent = match.opponent_name || 'TBD';
      const dateStr = line.custom_date || match.match_date;
      const timeStr = line.custom_time || match.match_time || '';
      const location = match.is_home ? 'Home' : `Away at ${match.away_address || 'TBD'}`;

      for (const player of players) {
        if (!player.cell) continue;
        const partners = players.filter(p => p.id !== player.id).map(p => p.name).join(', ');
        const partnerStr = partners ? ` Partner: ${partners}.` : '';
        const body = `${teamPrefix}Hi ${player.name}! You're playing ${lineLabel} vs ${opponent} on ${dateStr}${timeStr ? ' at ' + timeStr : ''} (${location}).${partnerStr} Good luck!`;
        messages.push({ player, body });
      }
    }

    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
