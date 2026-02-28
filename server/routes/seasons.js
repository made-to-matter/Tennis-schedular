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

// GET single season
router.get('/:id', async (req, res) => {
  try {
    const season = (await query('SELECT * FROM seasons WHERE id = $1', [req.params.id])).rows[0];
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

// POST create season
router.post('/', async (req, res) => {
  const { name, default_day_of_week, default_time, line_templates, team_id } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      'INSERT INTO seasons (name, default_day_of_week, default_time, team_id) VALUES ($1, $2, $3, $4) RETURNING id',
      [name, default_day_of_week !== undefined ? default_day_of_week : null, default_time || null, team_id || null]
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

    const season = (await query('SELECT * FROM seasons WHERE id = $1', [seasonId])).rows[0];
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

// PUT update season
router.put('/:id', async (req, res) => {
  const { name, default_day_of_week, default_time, line_templates } = req.body;
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

    const season = (await query('SELECT * FROM seasons WHERE id = $1', [req.params.id])).rows[0];
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

router.delete('/:id', async (req, res) => {
  try {
    await query('DELETE FROM seasons WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
