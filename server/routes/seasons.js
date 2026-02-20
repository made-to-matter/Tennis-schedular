const express = require('express');
const router = express.Router();
const { getDb } = require('../database');

// GET all seasons (optional ?team_id= filter)
router.get('/', (req, res) => {
  const db = getDb();
  const { team_id } = req.query;
  const seasons = team_id
    ? db.prepare('SELECT * FROM seasons WHERE team_id = ? ORDER BY created_at DESC').all(team_id)
    : db.prepare('SELECT * FROM seasons ORDER BY created_at DESC').all();
  for (const s of seasons) {
    s.line_templates = db.prepare('SELECT * FROM line_templates WHERE season_id = ? ORDER BY line_number').all(s.id);
  }
  res.json(seasons);
});

// GET single season
router.get('/:id', (req, res) => {
  const db = getDb();
  const season = db.prepare('SELECT * FROM seasons WHERE id = ?').get(req.params.id);
  if (!season) return res.status(404).json({ error: 'Season not found' });
  season.line_templates = db.prepare('SELECT * FROM line_templates WHERE season_id = ? ORDER BY line_number').all(season.id);
  res.json(season);
});

// POST create season
router.post('/', (req, res) => {
  const { name, default_day_of_week, default_time, line_templates, team_id } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const db = getDb();

  const createSeason = db.transaction(() => {
    const result = db.prepare('INSERT INTO seasons (name, default_day_of_week, default_time, team_id) VALUES (?, ?, ?, ?)').run(
      name, default_day_of_week !== undefined ? default_day_of_week : null, default_time || null, team_id || null
    );
    const seasonId = result.lastInsertRowid;

    if (Array.isArray(line_templates)) {
      const insertTemplate = db.prepare('INSERT INTO line_templates (season_id, line_number, line_type) VALUES (?, ?, ?)');
      for (const t of line_templates) {
        insertTemplate.run(seasonId, t.line_number, t.line_type);
      }
    }

    const season = db.prepare('SELECT * FROM seasons WHERE id = ?').get(seasonId);
    season.line_templates = db.prepare('SELECT * FROM line_templates WHERE season_id = ? ORDER BY line_number').all(seasonId);
    return season;
  });

  res.status(201).json(createSeason());
});

// PUT update season
router.put('/:id', (req, res) => {
  const { name, default_day_of_week, default_time, line_templates } = req.body;
  const db = getDb();

  const updateSeason = db.transaction(() => {
    db.prepare('UPDATE seasons SET name=?, default_day_of_week=?, default_time=? WHERE id=?').run(
      name, default_day_of_week !== undefined ? default_day_of_week : null, default_time || null, req.params.id
    );

    if (Array.isArray(line_templates)) {
      db.prepare('DELETE FROM line_templates WHERE season_id = ?').run(req.params.id);
      const insertTemplate = db.prepare('INSERT INTO line_templates (season_id, line_number, line_type) VALUES (?, ?, ?)');
      for (const t of line_templates) {
        insertTemplate.run(req.params.id, t.line_number, t.line_type);
      }
    }

    const season = db.prepare('SELECT * FROM seasons WHERE id = ?').get(req.params.id);
    season.line_templates = db.prepare('SELECT * FROM line_templates WHERE season_id = ? ORDER BY line_number').all(req.params.id);
    return season;
  });

  res.json(updateSeason());
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM seasons WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
