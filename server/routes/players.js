const express = require('express');
const router = express.Router();
const { query, getClient } = require('../database');

// GET all players
router.get('/', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM players WHERE captain_id = $1 ORDER BY name',
      [req.captainId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single player with record
router.get('/:id', async (req, res) => {
  try {
    const playerResult = await query(
      'SELECT * FROM players WHERE id = $1 AND captain_id = $2',
      [req.params.id, req.captainId]
    );
    const player = playerResult.rows[0];
    if (!player) return res.status(404).json({ error: 'Player not found' });

    // Get match history with scores
    const historyResult = await query(`
      SELECT
        m.match_date, m.match_time, m.is_home, m.away_address,
        o.name as opponent_name,
        ml.line_number, ml.line_type,
        ms.set1_us, ms.set1_them, ms.set2_us, ms.set2_them, ms.set3_us, ms.set3_them, ms.result,
        STRING_AGG(p2.name, ' / ') as partner_names
      FROM match_line_players mlp
      JOIN match_lines ml ON ml.id = mlp.match_line_id
      JOIN matches m ON m.id = ml.match_id
      LEFT JOIN opponents o ON o.id = m.opponent_id
      LEFT JOIN match_scores ms ON ms.match_line_id = ml.id
      LEFT JOIN match_line_players mlp2 ON mlp2.match_line_id = ml.id AND mlp2.player_id != mlp.player_id
      LEFT JOIN players p2 ON p2.id = mlp2.player_id
      WHERE mlp.player_id = $1
      GROUP BY ml.id, m.match_date, m.match_time, m.is_home, m.away_address,
               o.name, ml.line_number, ml.line_type,
               ms.set1_us, ms.set1_them, ms.set2_us, ms.set2_them,
               ms.set3_us, ms.set3_them, ms.result
      ORDER BY m.match_date DESC
    `, [req.params.id]);

    const history = historyResult.rows;
    const wins = history.filter(h => h.result === 'win' || h.result === 'default_win').length;
    const losses = history.filter(h => h.result === 'loss' || h.result === 'default_loss').length;

    res.json({ player, history, record: { wins, losses, played: history.filter(h => h.result).length } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create player
router.post('/', async (req, res) => {
  const { name, email, cell } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  try {
    const result = await query(
      'INSERT INTO players (name, email, cell, captain_id) VALUES ($1, $2, $3, $4) RETURNING id',
      [name, email || null, cell || null, req.captainId]
    );
    const player = (await query('SELECT * FROM players WHERE id = $1', [result.rows[0].id])).rows[0];
    res.status(201).json(player);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update player
router.put('/:id', async (req, res) => {
  const { name, email, cell, active } = req.body;
  try {
    await query(
      'UPDATE players SET name=$1, email=$2, cell=$3, active=$4 WHERE id=$5 AND captain_id=$6',
      [name, email || null, cell || null, active !== undefined ? active : 1, req.params.id, req.captainId]
    );
    const player = (await query('SELECT * FROM players WHERE id = $1', [req.params.id])).rows[0];
    res.json(player);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE player
router.delete('/:id', async (req, res) => {
  try {
    await query('DELETE FROM players WHERE id = $1 AND captain_id = $2', [req.params.id, req.captainId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST bulk import players
router.post('/import', async (req, res) => {
  const { players } = req.body;
  if (!Array.isArray(players)) return res.status(400).json({ error: 'players must be an array' });
  const client = await getClient();
  try {
    await client.query('BEGIN');
    let count = 0;
    for (const p of players) {
      if (!p.name) continue;
      await client.query(
        'INSERT INTO players (name, email, cell, captain_id) VALUES ($1, $2, $3, $4)',
        [p.name, p.email || null, p.cell || null, req.captainId]
      );
      count++;
    }
    await client.query('COMMIT');
    res.status(201).json({ imported: count });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
