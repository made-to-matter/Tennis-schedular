const express = require('express');
const router = express.Router();
const { query, getClient } = require('../database');

// GET all seasons (scoped to captain via teams; optional ?team_id= filter)
router.get('/', async (req, res) => {
  try {
    const { team_id } = req.query;
    let seasons;
    if (team_id) {
      seasons = (await query(
        `SELECT s.* FROM seasons s
         JOIN teams t ON t.id = s.team_id
         WHERE s.team_id = $1 AND t.captain_id = $2
         ORDER BY s.created_at DESC`,
        [team_id, req.captainId]
      )).rows;
    } else {
      seasons = (await query(
        `SELECT s.* FROM seasons s
         JOIN teams t ON t.id = s.team_id
         WHERE t.captain_id = $1
         ORDER BY s.created_at DESC`,
        [req.captainId]
      )).rows;
    }
    for (const s of seasons) {
      s.line_templates = (await query(
        'SELECT * FROM line_templates WHERE season_id = $1 ORDER BY line_number',
        [s.id]
      )).rows;
    }
    res.json(seasons);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single season (captain-scoped)
router.get('/:id', async (req, res) => {
  try {
    const season = (await query(
      `SELECT s.* FROM seasons s
       JOIN teams t ON t.id = s.team_id
       WHERE s.id = $1 AND t.captain_id = $2`,
      [req.params.id, req.captainId]
    )).rows[0];
    if (!season) return res.status(404).json({ error: 'Season not found' });
    season.line_templates = (await query(
      'SELECT * FROM line_templates WHERE season_id = $1 ORDER BY line_number',
      [season.id]
    )).rows;
    res.json(season);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create season (requires team_id; validates captain owns team)
router.post('/', async (req, res) => {
  const { name, default_day_of_week, default_time, line_templates, team_id } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  if (!team_id) return res.status(400).json({ error: 'team_id is required' });

  // Validate captain owns team
  const teamRow = (await query(
    'SELECT id FROM teams WHERE id = $1 AND captain_id = $2',
    [team_id, req.captainId]
  )).rows[0];
  if (!teamRow) return res.status(403).json({ error: 'Team not found or access denied' });

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      'INSERT INTO seasons (name, default_day_of_week, default_time, team_id) VALUES ($1, $2, $3, $4) RETURNING id',
      [name, default_day_of_week !== undefined ? default_day_of_week : null, default_time || null, team_id]
    );
    const seasonId = result.rows[0].id;

    if (Array.isArray(line_templates)) {
      for (const t of line_templates) {
        await client.query(
          'INSERT INTO line_templates (season_id, line_number, line_type) VALUES ($1, $2, $3)',
          [seasonId, t.line_number, t.line_type]
        );
      }
    }

    await client.query('COMMIT');

    const season = (await query(
      `SELECT s.* FROM seasons s
       JOIN teams t ON t.id = s.team_id
       WHERE s.id = $1 AND t.captain_id = $2`,
      [seasonId, req.captainId]
    )).rows[0];
    season.line_templates = (await query(
      'SELECT * FROM line_templates WHERE season_id = $1 ORDER BY line_number',
      [seasonId]
    )).rows;
    res.status(201).json(season);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PUT update season (captain-scoped)
router.put('/:id', async (req, res) => {
  const { name, default_day_of_week, default_time, line_templates } = req.body;
  // Verify captain owns this season via team
  const existing = (await query(
    `SELECT s.id FROM seasons s
     JOIN teams t ON t.id = s.team_id
     WHERE s.id = $1 AND t.captain_id = $2`,
    [req.params.id, req.captainId]
  )).rows[0];
  if (!existing) return res.status(403).json({ error: 'Season not found or access denied' });

  const client = await getClient();
  try {
    await client.query('BEGIN');

    await client.query(
      'UPDATE seasons SET name=$1, default_day_of_week=$2, default_time=$3 WHERE id=$4',
      [name, default_day_of_week !== undefined ? default_day_of_week : null, default_time || null, req.params.id]
    );

    if (Array.isArray(line_templates)) {
      await client.query('DELETE FROM line_templates WHERE season_id = $1', [req.params.id]);
      for (const t of line_templates) {
        await client.query(
          'INSERT INTO line_templates (season_id, line_number, line_type) VALUES ($1, $2, $3)',
          [req.params.id, t.line_number, t.line_type]
        );
      }
    }

    await client.query('COMMIT');

    const season = (await query(
      `SELECT s.* FROM seasons s
       JOIN teams t ON t.id = s.team_id
       WHERE s.id = $1 AND t.captain_id = $2`,
      [req.params.id, req.captainId]
    )).rows[0];
    season.line_templates = (await query(
      'SELECT * FROM line_templates WHERE season_id = $1 ORDER BY line_number',
      [req.params.id]
    )).rows;
    res.json(season);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// DELETE season (captain-scoped)
router.delete('/:id', async (req, res) => {
  try {
    const existing = (await query(
      `SELECT s.id FROM seasons s
       JOIN teams t ON t.id = s.team_id
       WHERE s.id = $1 AND t.captain_id = $2`,
      [req.params.id, req.captainId]
    )).rows[0];
    if (!existing) return res.status(403).json({ error: 'Season not found or access denied' });

    await query('DELETE FROM seasons WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET season roster
router.get('/:id/players', async (req, res) => {
  try {
    const season = (await query(
      `SELECT s.id FROM seasons s
       JOIN teams t ON t.id = s.team_id
       WHERE s.id = $1 AND t.captain_id = $2`,
      [req.params.id, req.captainId]
    )).rows[0];
    if (!season) return res.status(403).json({ error: 'Season not found or access denied' });

    const players = (await query(
      `SELECT p.* FROM players p
       JOIN season_players sp ON sp.player_id = p.id
       WHERE sp.season_id = $1
       ORDER BY p.name`,
      [req.params.id]
    )).rows;
    res.json(players);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST add players to season roster
router.post('/:id/players', async (req, res) => {
  const { player_ids } = req.body;
  if (!Array.isArray(player_ids) || player_ids.length === 0) {
    return res.status(400).json({ error: 'player_ids array required' });
  }
  try {
    const season = (await query(
      `SELECT s.id FROM seasons s
       JOIN teams t ON t.id = s.team_id
       WHERE s.id = $1 AND t.captain_id = $2`,
      [req.params.id, req.captainId]
    )).rows[0];
    if (!season) return res.status(403).json({ error: 'Season not found or access denied' });

    for (const pid of player_ids) {
      await query(
        'INSERT INTO season_players (season_id, player_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [req.params.id, pid]
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE remove a player from season roster
router.delete('/:id/players/:playerId', async (req, res) => {
  try {
    const season = (await query(
      `SELECT s.id FROM seasons s
       JOIN teams t ON t.id = s.team_id
       WHERE s.id = $1 AND t.captain_id = $2`,
      [req.params.id, req.captainId]
    )).rows[0];
    if (!season) return res.status(403).json({ error: 'Season not found or access denied' });

    await query(
      'DELETE FROM season_players WHERE season_id = $1 AND player_id = $2',
      [req.params.id, req.params.playerId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
