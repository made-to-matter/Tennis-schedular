const express = require('express');
const router = express.Router();
const { query } = require('../database');

router.get('/', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM opponents WHERE captain_id = $1 ORDER BY name',
      [req.captainId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const { name, address, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  try {
    const result = await query(
      'INSERT INTO opponents (name, address, notes, captain_id) VALUES ($1, $2, $3, $4) RETURNING id',
      [name, address || null, notes || null, req.captainId]
    );
    const opponent = (await query('SELECT * FROM opponents WHERE id = $1', [result.rows[0].id])).rows[0];
    res.status(201).json(opponent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const { name, address, notes } = req.body;
  try {
    await query(
      'UPDATE opponents SET name=$1, address=$2, notes=$3 WHERE id=$4 AND captain_id=$5',
      [name, address || null, notes || null, req.params.id, req.captainId]
    );
    const opponent = (await query('SELECT * FROM opponents WHERE id = $1', [req.params.id])).rows[0];
    res.json(opponent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await query('DELETE FROM opponents WHERE id = $1 AND captain_id = $2', [req.params.id, req.captainId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
