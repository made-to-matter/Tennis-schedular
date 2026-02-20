const express = require('express');
const router = express.Router();
const { getDb } = require('../database');

router.get('/', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM opponents ORDER BY name').all());
});

router.post('/', (req, res) => {
  const { name, address, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const db = getDb();
  const result = db.prepare('INSERT INTO opponents (name, address, notes) VALUES (?, ?, ?)').run(name, address || null, notes || null);
  res.status(201).json(db.prepare('SELECT * FROM opponents WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const { name, address, notes } = req.body;
  const db = getDb();
  db.prepare('UPDATE opponents SET name=?, address=?, notes=? WHERE id=?').run(name, address || null, notes || null, req.params.id);
  res.json(db.prepare('SELECT * FROM opponents WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM opponents WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
