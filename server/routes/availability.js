const express = require('express');
const router = express.Router();
const { query, getClient } = require('../database');

async function loadDateOptionsForMatch(matchId) {
  return (await query(
    'SELECT * FROM match_date_options WHERE match_id = $1 ORDER BY sort_order, id',
    [matchId]
  )).rows;
}

/** null = primary slot; integer = extra option id; false = client sent a non-null but unparsable id */
function coerceMatchDateOptionId(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : false;
}

/** 0 = no, 1 = yes, 2 = maybe */
function normalizeAvailabilityInput(raw) {
  if (raw === 2 || raw === '2') return 2;
  if (raw === 1 || raw === '1') return 1;
  if (raw === 0 || raw === '0') return 0;
  if (typeof raw === 'string' && raw.toLowerCase() === 'maybe') return 2;
  if (raw === true || raw === 'true') return 1;
  if (raw === false || raw === 'false') return 0;
  return null;
}

/** Slot = primary (null option id) or extra option row; `code` is 0 | 1 | 2 */
async function upsertAvailabilitySlot(client, player_id, match_id, match_date_option_id, code) {
  const optId = match_date_option_id === undefined ? null : match_date_option_id;
  await client.query(
    `DELETE FROM player_availability
     WHERE player_id = $1 AND match_id = $2
       AND (match_date_option_id IS NOT DISTINCT FROM $3)`,
    [player_id, match_id, optId]
  );
  await client.query(
    `INSERT INTO player_availability (player_id, match_id, match_line_id, match_date_option_id, available, response_date)
     VALUES ($1, $2, NULL, $3, $4, CURRENT_TIMESTAMP)`,
    [player_id, match_id, optId, code]
  );
}

async function assertOptionBelongsToMatch(client, matchId, optionId) {
  if (optionId == null) return true;
  const r = (await client.query(
    'SELECT 1 FROM match_date_options WHERE id = $1 AND match_id = $2',
    [optionId, matchId]
  )).rows[0];
  return !!r;
}

/**
 * Validate every slot before writing any row so one bad/stale option id does not ROLLBACK
 * the whole batch (previously primary + extras were lost together).
 */
async function validateAndNormalizeResponses(client, matchId, responses) {
  if (!Array.isArray(responses)) return { ok: true, items: [] };
  const items = [];
  for (const r of responses) {
    const coerced = coerceMatchDateOptionId(r.match_date_option_id);
    if (coerced === false) {
      return { ok: false, error: 'Invalid match_date_option_id' };
    }
    if (!(await assertOptionBelongsToMatch(client, matchId, coerced))) {
      return { ok: false, error: 'Invalid date option for this match' };
    }
    const code = normalizeAvailabilityInput(r.available);
    if (code === null) {
      return { ok: false, error: 'Invalid availability value (use true/false or 0/1/2)' };
    }
    items.push({ optId: coerced, code });
  }
  return { ok: true, items };
}

async function writeAvailabilityItems(client, playerId, matchId, items) {
  for (const { optId, code } of items) {
    await upsertAvailabilitySlot(client, playerId, matchId, optId, code);
  }
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
    if (match.season_id) {
      players = (await query(`
        SELECT p.id, p.name FROM players p
        JOIN season_players sp ON sp.player_id = p.id
        WHERE sp.season_id = $1 AND p.active = 1
        ORDER BY p.name
      `, [match.season_id])).rows;
    } else if (match.team_id) {
      players = (await query(`
        SELECT p.id, p.name FROM players p
        JOIN team_players tp ON tp.player_id = p.id
        WHERE tp.team_id = $1 AND p.active = 1
        ORDER BY p.name
      `, [match.team_id])).rows;
    } else {
      players = (await query('SELECT id, name FROM players WHERE active = 1 ORDER BY name')).rows;
    }

    const date_options = await loadDateOptionsForMatch(match.id);

    res.json({ match, players, date_options });
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

    const check = await validateAndNormalizeResponses(client, match.id, responses);
    if (!check.ok) {
      return res.status(400).json({ error: check.error });
    }

    await client.query('BEGIN');
    await writeAvailabilityItems(client, player_id, req.params.matchId, check.items);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* noop */ }
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

    const date_options = await loadDateOptionsForMatch(match.id);

    const currentAvailability = (await query(
      'SELECT * FROM player_availability WHERE player_id = $1 AND match_id = $2',
      [tokenRow.player_id, tokenRow.match_id]
    )).rows;

    res.json({
      player: { id: tokenRow.player_id, name: tokenRow.player_name },
      match,
      date_options,
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

    const check = await validateAndNormalizeResponses(client, tokenRow.match_id, responses);
    if (!check.ok) {
      return res.status(400).json({ error: check.error });
    }

    await client.query('BEGIN');
    await writeAvailabilityItems(client, tokenRow.player_id, tokenRow.match_id, check.items);
    await client.query('COMMIT');
    res.json({ success: true, message: 'Availability saved!' });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* noop */ }
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

function formatNotifyDates(match, dateOptions) {
  if (!dateOptions || dateOptions.length === 0) return match.match_date;
  const parts = [`${match.match_date}${match.match_time ? ` ${match.match_time}` : ''}`];
  for (const o of dateOptions) {
    parts.push(`${o.option_date}${o.option_time ? ` ${o.option_time}` : ''}`);
  }
  return parts.join(' / ');
}

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
    if (match.season_id) {
      players = (await query(`
        SELECT p.* FROM players p
        JOIN season_players sp ON sp.player_id = p.id
        WHERE sp.season_id = $1 AND p.active = 1
      `, [match.season_id])).rows;
    } else if (match.team_id) {
      players = (await query(`
        SELECT p.* FROM players p
        JOIN team_players tp ON tp.player_id = p.id
        WHERE tp.team_id = $1 AND p.active = 1
      `, [match.team_id])).rows;
    } else {
      players = (await query('SELECT * FROM players WHERE active = 1')).rows;
    }

    const dateOptions = await loadDateOptionsForMatch(match.id);
    const baseUrl = req.body.base_url || process.env.BASE_URL || 'http://localhost:5173';
    const link = `${baseUrl}/availability/match/${req.params.matchId}`;
    const opponent = match.opponent_name || 'TBD';
    const headline = match.team_name ? `🎾 ${match.team_name} vs ${opponent}\n\n` : '';
    const dateStr = formatNotifyDates(match, dateOptions);

    const messages = players.map(player => ({
      player,
      message: `${headline}Hi ${player.name}! Tennis match${match.team_name ? '' : ` vs ${opponent}`} — dates: 📅 ${dateStr}. Mark your availability: ${link}`,
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
      `SELECT ml.*, mdo.option_date AS opt_date, mdo.option_time AS opt_time
       FROM match_lines ml
       LEFT JOIN match_date_options mdo ON mdo.id = ml.match_date_option_id
       WHERE ml.match_id = $1
       ORDER BY ml.line_number`,
      [match.id]
    )).rows;
    const messages = [];
    const opponent = match.opponent_name || 'TBD';
    const headline = match.team_name ? `🎾 ${match.team_name} vs ${opponent}\n\n` : '';

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
      const dateStr = line.match_date_option_id ? line.opt_date : match.match_date;
      const timeStr = line.match_date_option_id ? (line.opt_time || '') : (match.match_time || '');
      const location = match.is_home ? 'Home' : `Away at ${match.away_address || 'TBD'}`;

      for (const player of players) {
        if (!player.cell) continue;
        const partners = players.filter(p => p.id !== player.id).map(p => p.name).join(', ');
        const partnerStr = partners ? ` Partner: ${partners}.` : '';
        const playingPart = match.team_name
          ? `You're playing ${lineLabel} on 📅 ${dateStr}${timeStr ? ` at ${timeStr}` : ''}`
          : `You're playing ${lineLabel} vs ${opponent} on 📅 ${dateStr}${timeStr ? ` at ${timeStr}` : ''}`;
        const body = `${headline}Hi ${player.name}! ${playingPart} (${location}).${partnerStr} Good luck!`;
        messages.push({ player, body });
      }
    }

    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
