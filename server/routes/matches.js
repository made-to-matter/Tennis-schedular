const express = require('express');
const router = express.Router();
const { query, getClient } = require('../database');

async function getMatchFull(id) {
  const matchResult = await query(`
    SELECT m.*, o.name as opponent_name, o.address as opponent_address, s.name as season_name, t.name as team_name
    FROM matches m
    LEFT JOIN opponents o ON o.id = m.opponent_id
    LEFT JOIN seasons s ON s.id = m.season_id
    LEFT JOIN teams t ON t.id = m.team_id
    WHERE m.id = $1
  `, [id]);
  const match = matchResult.rows[0];
  if (!match) return null;

  match.lines = (await query(
    'SELECT * FROM match_lines WHERE match_id = $1 ORDER BY line_number',
    [id]
  )).rows;

  for (const line of match.lines) {
    line.players = (await query(`
      SELECT mlp.*, p.name, p.email, p.cell
      FROM match_line_players mlp
      JOIN players p ON p.id = mlp.player_id
      WHERE mlp.match_line_id = $1
      ORDER BY mlp.position
    `, [line.id])).rows;
    line.score = (await query(
      'SELECT * FROM match_scores WHERE match_line_id = $1',
      [line.id]
    )).rows[0] || null;
  }

  match.availability = (await query(`
    SELECT pa.*, p.name, p.cell
    FROM player_availability pa
    JOIN players p ON p.id = pa.player_id
    WHERE pa.match_id = $1
  `, [id])).rows;

  return match;
}

// GET all matches (scoped to captain via teams; optional ?team_id= filter)
router.get('/', async (req, res) => {
  try {
    const { team_id } = req.query;
    let matches;
    if (team_id) {
      matches = (await query(`
        SELECT m.*, o.name as opponent_name, s.name as season_name
        FROM matches m
        LEFT JOIN opponents o ON o.id = m.opponent_id
        LEFT JOIN seasons s ON s.id = m.season_id
        LEFT JOIN teams t ON t.id = m.team_id
        WHERE m.team_id = $1 AND t.captain_id = $2
        ORDER BY m.match_date DESC
      `, [team_id, req.captainId])).rows;
    } else {
      matches = (await query(`
        SELECT m.*, o.name as opponent_name, s.name as season_name
        FROM matches m
        LEFT JOIN opponents o ON o.id = m.opponent_id
        LEFT JOIN seasons s ON s.id = m.season_id
        LEFT JOIN teams t ON t.id = m.team_id
        WHERE t.captain_id = $1
        ORDER BY m.match_date DESC
      `, [req.captainId])).rows;
    }
    res.json(matches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single match (full detail)
router.get('/:id', async (req, res) => {
  try {
    const match = await getMatchFull(req.params.id);
    if (!match) return res.status(404).json({ error: 'Match not found' });
    res.json(match);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create match
router.post('/', async (req, res) => {
  const {
    season_id, opponent_id, match_date, match_time,
    is_home, away_address, use_custom_dates, notes, lines, team_id
  } = req.body;

  if (!match_date) return res.status(400).json({ error: 'match_date is required' });
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const result = await client.query(`
      INSERT INTO matches (season_id, opponent_id, match_date, match_time, is_home, away_address, use_custom_dates, notes, team_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `, [
      season_id || null, opponent_id || null, match_date, match_time || null,
      is_home !== undefined ? is_home : 1, away_address || null,
      use_custom_dates ? 1 : 0, notes || null, team_id || null
    ]);
    const matchId = result.rows[0].id;

    // If season provided but no lines, use season templates
    let lineList = lines;
    if (!lineList && season_id) {
      lineList = (await client.query(
        'SELECT * FROM line_templates WHERE season_id = $1 ORDER BY line_number',
        [season_id]
      )).rows;
    }

    if (Array.isArray(lineList)) {
      for (const l of lineList) {
        await client.query(
          'INSERT INTO match_lines (match_id, line_number, line_type, custom_date, custom_time) VALUES ($1, $2, $3, $4, $5)',
          [matchId, l.line_number, l.line_type, l.custom_date || null, l.custom_time || null]
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json(await getMatchFull(matchId));
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PUT update match
router.put('/:id', async (req, res) => {
  const {
    season_id, opponent_id, match_date, match_time,
    is_home, away_address, use_custom_dates, notes, status, lines, team_id
  } = req.body;
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Preserve existing team_id if not provided in body
    let resolvedTeamId = team_id !== undefined ? (team_id || null) : null;
    if (team_id === undefined) {
      const existing = (await client.query('SELECT team_id FROM matches WHERE id=$1', [req.params.id])).rows[0];
      resolvedTeamId = existing?.team_id || null;
    }

    await client.query(`
      UPDATE matches SET season_id=$1, opponent_id=$2, match_date=$3, match_time=$4,
      is_home=$5, away_address=$6, use_custom_dates=$7, notes=$8, status=$9, team_id=$10
      WHERE id=$11
    `, [
      season_id || null, opponent_id || null, match_date, match_time || null,
      is_home !== undefined ? is_home : 1, away_address || null,
      use_custom_dates ? 1 : 0, notes || null, status || 'scheduled',
      resolvedTeamId, req.params.id
    ]);

    if (Array.isArray(lines)) {
      await client.query('DELETE FROM match_lines WHERE match_id = $1', [req.params.id]);
      for (const l of lines) {
        await client.query(
          'INSERT INTO match_lines (match_id, line_number, line_type, custom_date, custom_time) VALUES ($1, $2, $3, $4, $5)',
          [req.params.id, l.line_number, l.line_type, l.custom_date || null, l.custom_time || null]
        );
      }
    }

    await client.query('COMMIT');
    res.json(await getMatchFull(req.params.id));
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PATCH update match line (custom date/time)
router.patch('/:id/lines/:lineId', async (req, res) => {
  const { custom_date, custom_time, line_type } = req.body;
  try {
    await query(
      'UPDATE match_lines SET custom_date=$1, custom_time=$2, line_type=$3 WHERE id=$4 AND match_id=$5',
      [custom_date || null, custom_time || null, line_type, req.params.lineId, req.params.id]
    );
    const line = (await query('SELECT * FROM match_lines WHERE id = $1', [req.params.lineId])).rows[0];
    res.json(line);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST assign players to a line
router.post('/:id/lines/:lineId/players', async (req, res) => {
  const { player_ids } = req.body;
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM match_line_players WHERE match_line_id = $1', [req.params.lineId]);
    if (Array.isArray(player_ids)) {
      const unique = [...new Set(player_ids)];
      for (let idx = 0; idx < unique.length; idx++) {
        await client.query(
          'INSERT INTO match_line_players (match_line_id, player_id, position) VALUES ($1, $2, $3)',
          [req.params.lineId, unique[idx], idx + 1]
        );
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

// POST update score for a line
router.post('/:id/lines/:lineId/score', async (req, res) => {
  const { set1_us, set1_them, set2_us, set2_them, set3_us, set3_them, result, notes } = req.body;
  try {
    await query(`
      INSERT INTO match_scores (match_line_id, set1_us, set1_them, set2_us, set2_them, set3_us, set3_them, result, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT(match_line_id) DO UPDATE SET
        set1_us=EXCLUDED.set1_us, set1_them=EXCLUDED.set1_them,
        set2_us=EXCLUDED.set2_us, set2_them=EXCLUDED.set2_them,
        set3_us=EXCLUDED.set3_us, set3_them=EXCLUDED.set3_them,
        result=EXCLUDED.result, notes=EXCLUDED.notes
    `, [req.params.lineId, set1_us ?? null, set1_them ?? null, set2_us ?? null, set2_them ?? null,
        set3_us ?? null, set3_them ?? null, result || null, notes || null]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE match
router.delete('/:id', async (req, res) => {
  try {
    await query('DELETE FROM matches WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
