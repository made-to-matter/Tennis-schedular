const express = require('express');
const router = express.Router();
const { getDb } = require('../database');

// GET all players
router.get('/', (req, res) => {
  const db = getDb();
  const players = db.prepare('SELECT * FROM players ORDER BY name').all();
  res.json(players);
});

// GET single player with record
router.get('/:id', (req, res) => {
  const db = getDb();
  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(req.params.id);
  if (!player) return res.status(404).json({ error: 'Player not found' });

  // Get match history with scores
  const history = db.prepare(`
    SELECT
      m.match_date, m.match_time, m.is_home, m.away_address,
      o.name as opponent_name,
      ml.line_number, ml.line_type,
      ms.set1_us, ms.set1_them, ms.set2_us, ms.set2_them, ms.set3_us, ms.set3_them, ms.result,
      GROUP_CONCAT(p2.name, ' / ') as partner_names
    FROM match_line_players mlp
    JOIN match_lines ml ON ml.id = mlp.match_line_id
    JOIN matches m ON m.id = ml.match_id
    LEFT JOIN opponents o ON o.id = m.opponent_id
    LEFT JOIN match_scores ms ON ms.match_line_id = ml.id
    LEFT JOIN match_line_players mlp2 ON mlp2.match_line_id = ml.id AND mlp2.player_id != mlp.player_id
    LEFT JOIN players p2 ON p2.id = mlp2.player_id
    WHERE mlp.player_id = ?
    GROUP BY ml.id
    ORDER BY m.match_date DESC
  `).all(req.params.id);

  const wins = history.filter(h => h.result === 'win' || h.result === 'default_win').length;
  const losses = history.filter(h => h.result === 'loss' || h.result === 'default_loss').length;

  res.json({ player, history, record: { wins, losses, played: history.filter(h => h.result).length } });
});

// POST create player
router.post('/', (req, res) => {
  const { name, email, cell } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const db = getDb();
  const result = db.prepare('INSERT INTO players (name, email, cell) VALUES (?, ?, ?)').run(name, email || null, cell || null);
  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(player);
});

// PUT update player
router.put('/:id', (req, res) => {
  const { name, email, cell, active } = req.body;
  const db = getDb();
  db.prepare('UPDATE players SET name=?, email=?, cell=?, active=? WHERE id=?')
    .run(name, email || null, cell || null, active !== undefined ? active : 1, req.params.id);
  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(req.params.id);
  res.json(player);
});

// DELETE player
router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM players WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// POST bulk import players (CSV style)
router.post('/import', (req, res) => {
  const { players } = req.body;
  if (!Array.isArray(players)) return res.status(400).json({ error: 'players must be an array' });
  const db = getDb();
  const insert = db.prepare('INSERT INTO players (name, email, cell) VALUES (?, ?, ?)');
  const insertMany = db.transaction((players) => {
    const inserted = [];
    for (const p of players) {
      if (!p.name) continue;
      const r = insert.run(p.name, p.email || null, p.cell || null);
      inserted.push(r.lastInsertRowid);
    }
    return inserted;
  });
  const ids = insertMany(players);
  res.status(201).json({ imported: ids.length });
});

module.exports = router;
