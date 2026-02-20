const express = require('express');
const router = express.Router();
const { getDb } = require('../database');

// GET all teams (active first)
router.get('/', (req, res) => {
  const db = getDb();
  const teams = db.prepare('SELECT * FROM teams ORDER BY active DESC, name').all();
  res.json(teams);
});

// POST create team
router.post('/', (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const db = getDb();
  const result = db.prepare('INSERT INTO teams (name, description) VALUES (?, ?)').run(name, description || null);
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(team);
});

// PUT update team
router.put('/:id', (req, res) => {
  const { name, description } = req.body;
  const db = getDb();
  db.prepare('UPDATE teams SET name=?, description=? WHERE id=?').run(name, description || null, req.params.id);
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.id);
  if (!team) return res.status(404).json({ error: 'Team not found' });
  res.json(team);
});

// PATCH deactivate team (soft delete)
router.patch('/:id/deactivate', (req, res) => {
  const db = getDb();
  db.prepare('UPDATE teams SET active=0 WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// PATCH reactivate team
router.patch('/:id/activate', (req, res) => {
  const db = getDb();
  db.prepare('UPDATE teams SET active=1 WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// GET players on a team
router.get('/:id/players', (req, res) => {
  const db = getDb();
  const players = db.prepare(`
    SELECT p.* FROM players p
    JOIN team_players tp ON tp.player_id = p.id
    WHERE tp.team_id = ?
    ORDER BY p.name
  `).all(req.params.id);
  res.json(players);
});

// POST add player(s) to team
router.post('/:id/players', (req, res) => {
  const { player_ids } = req.body;
  if (!Array.isArray(player_ids) || player_ids.length === 0) {
    return res.status(400).json({ error: 'player_ids array required' });
  }
  const db = getDb();
  const insert = db.prepare('INSERT OR IGNORE INTO team_players (team_id, player_id) VALUES (?, ?)');
  const addAll = db.transaction(() => {
    for (const pid of player_ids) insert.run(req.params.id, pid);
  });
  addAll();
  res.json({ success: true });
});

// DELETE remove player from team
router.delete('/:id/players/:playerId', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM team_players WHERE team_id=? AND player_id=?').run(req.params.id, req.params.playerId);
  res.json({ success: true });
});

module.exports = router;
