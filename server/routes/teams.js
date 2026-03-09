const express = require('express');
const router = express.Router();
const { query, getClient } = require('../database');
const { assertTeamAccess } = require('../lib/teamAccess');

// GET all teams (active first) — includes co-captained teams
router.get('/', async (req, res) => {
  try {
    const result = await query(`
      SELECT * FROM teams WHERE captain_id = $1 AND active = 1
      UNION
      SELECT t.* FROM teams t JOIN team_co_captains tcc ON tcc.team_id = t.id
      WHERE tcc.co_captain_id = $1 AND t.active = 1
      UNION
      SELECT * FROM teams WHERE captain_id = $1 AND active = 0
      ORDER BY active DESC, name
    `, [req.captainId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create team
router.post('/', async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  try {
    const result = await query(
      'INSERT INTO teams (name, description, captain_id) VALUES ($1, $2, $3) RETURNING id',
      [name, description || null, req.captainId]
    );
    const team = (await query('SELECT * FROM teams WHERE id = $1', [result.rows[0].id])).rows[0];
    res.status(201).json(team);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update team
router.put('/:id', async (req, res) => {
  const { name, description } = req.body;
  try {
    const hasAccess = await assertTeamAccess(req.params.id, req.userId);
    if (!hasAccess) return res.status(403).json({ error: 'Access denied' });
    await query(
      'UPDATE teams SET name=$1, description=$2 WHERE id=$3',
      [name, description || null, req.params.id]
    );
    const team = (await query('SELECT * FROM teams WHERE id = $1', [req.params.id])).rows[0];
    if (!team) return res.status(404).json({ error: 'Team not found' });
    res.json(team);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH deactivate team (soft delete) — captain only
router.patch('/:id/deactivate', async (req, res) => {
  try {
    await query('UPDATE teams SET active=0 WHERE id=$1 AND captain_id=$2', [req.params.id, req.captainId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH reactivate team — captain only
router.patch('/:id/activate', async (req, res) => {
  try {
    await query('UPDATE teams SET active=1 WHERE id=$1 AND captain_id=$2', [req.params.id, req.captainId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET players on a team
router.get('/:id/players', async (req, res) => {
  try {
    const result = await query(`
      SELECT p.* FROM players p
      JOIN team_players tp ON tp.player_id = p.id
      WHERE tp.team_id = $1
      ORDER BY p.name
    `, [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST add player(s) to team
router.post('/:id/players', async (req, res) => {
  const { player_ids } = req.body;
  if (!Array.isArray(player_ids) || player_ids.length === 0) {
    return res.status(400).json({ error: 'player_ids array required' });
  }
  const client = await getClient();
  try {
    await client.query('BEGIN');
    for (const pid of player_ids) {
      await client.query(
        'INSERT INTO team_players (team_id, player_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [req.params.id, pid]
      );
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

// DELETE remove player from team
router.delete('/:id/players/:playerId', async (req, res) => {
  try {
    await query('DELETE FROM team_players WHERE team_id=$1 AND player_id=$2', [req.params.id, req.params.playerId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
