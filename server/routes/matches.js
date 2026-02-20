const express = require('express');
const router = express.Router();
const { getDb } = require('../database');

function getMatchFull(db, id) {
  const match = db.prepare(`
    SELECT m.*, o.name as opponent_name, o.address as opponent_address, s.name as season_name, t.name as team_name
    FROM matches m
    LEFT JOIN opponents o ON o.id = m.opponent_id
    LEFT JOIN seasons s ON s.id = m.season_id
    LEFT JOIN teams t ON t.id = m.team_id
    WHERE m.id = ?
  `).get(id);
  if (!match) return null;

  match.lines = db.prepare('SELECT * FROM match_lines WHERE match_id = ? ORDER BY line_number').all(id);
  for (const line of match.lines) {
    line.players = db.prepare(`
      SELECT mlp.*, p.name, p.email, p.cell
      FROM match_line_players mlp
      JOIN players p ON p.id = mlp.player_id
      WHERE mlp.match_line_id = ?
      ORDER BY mlp.position
    `).all(line.id);
    line.score = db.prepare('SELECT * FROM match_scores WHERE match_line_id = ?').get(line.id) || null;
  }

  match.availability = db.prepare(`
    SELECT pa.*, p.name, p.cell
    FROM player_availability pa
    JOIN players p ON p.id = pa.player_id
    WHERE pa.match_id = ?
  `).all(id);

  return match;
}

// GET all matches (optional ?team_id= filter)
router.get('/', (req, res) => {
  const db = getDb();
  const { team_id } = req.query;
  let matches;
  if (team_id) {
    matches = db.prepare(`
      SELECT m.*, o.name as opponent_name, s.name as season_name
      FROM matches m
      LEFT JOIN opponents o ON o.id = m.opponent_id
      LEFT JOIN seasons s ON s.id = m.season_id
      WHERE m.team_id = ?
      ORDER BY m.match_date DESC
    `).all(team_id);
  } else {
    matches = db.prepare(`
      SELECT m.*, o.name as opponent_name, s.name as season_name
      FROM matches m
      LEFT JOIN opponents o ON o.id = m.opponent_id
      LEFT JOIN seasons s ON s.id = m.season_id
      ORDER BY m.match_date DESC
    `).all();
  }
  res.json(matches);
});

// GET single match (full detail)
router.get('/:id', (req, res) => {
  const db = getDb();
  const match = getMatchFull(db, req.params.id);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  res.json(match);
});

// POST create match
router.post('/', (req, res) => {
  const {
    season_id, opponent_id, match_date, match_time,
    is_home, away_address, use_custom_dates, notes, lines, team_id
  } = req.body;

  if (!match_date) return res.status(400).json({ error: 'match_date is required' });
  const db = getDb();

  const createMatch = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO matches (season_id, opponent_id, match_date, match_time, is_home, away_address, use_custom_dates, notes, team_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      season_id || null, opponent_id || null, match_date, match_time || null,
      is_home !== undefined ? is_home : 1, away_address || null,
      use_custom_dates ? 1 : 0, notes || null, team_id || null
    );
    const matchId = result.lastInsertRowid;

    // If season provided but no lines, use season templates
    let lineList = lines;
    if (!lineList && season_id) {
      lineList = db.prepare('SELECT * FROM line_templates WHERE season_id = ? ORDER BY line_number').all(season_id);
    }

    if (Array.isArray(lineList)) {
      const insertLine = db.prepare('INSERT INTO match_lines (match_id, line_number, line_type, custom_date, custom_time) VALUES (?, ?, ?, ?, ?)');
      for (const l of lineList) {
        insertLine.run(matchId, l.line_number, l.line_type, l.custom_date || null, l.custom_time || null);
      }
    }

    return getMatchFull(db, matchId);
  });

  res.status(201).json(createMatch());
});

// PUT update match
router.put('/:id', (req, res) => {
  const {
    season_id, opponent_id, match_date, match_time,
    is_home, away_address, use_custom_dates, notes, status, lines, team_id
  } = req.body;
  const db = getDb();

  const updateMatch = db.transaction(() => {
    db.prepare(`
      UPDATE matches SET season_id=?, opponent_id=?, match_date=?, match_time=?,
      is_home=?, away_address=?, use_custom_dates=?, notes=?, status=?, team_id=? WHERE id=?
    `).run(
      season_id || null, opponent_id || null, match_date, match_time || null,
      is_home !== undefined ? is_home : 1, away_address || null,
      use_custom_dates ? 1 : 0, notes || null, status || 'scheduled',
      team_id !== undefined ? (team_id || null) : (db.prepare('SELECT team_id FROM matches WHERE id=?').get(req.params.id)?.team_id || null),
      req.params.id
    );

    if (Array.isArray(lines)) {
      // Remove existing lines only if new ones are provided
      db.prepare('DELETE FROM match_lines WHERE match_id = ?').run(req.params.id);
      const insertLine = db.prepare('INSERT INTO match_lines (match_id, line_number, line_type, custom_date, custom_time) VALUES (?, ?, ?, ?, ?)');
      for (const l of lines) {
        insertLine.run(req.params.id, l.line_number, l.line_type, l.custom_date || null, l.custom_time || null);
      }
    }

    return getMatchFull(db, req.params.id);
  });

  res.json(updateMatch());
});

// PATCH update match line (custom date/time)
router.patch('/:id/lines/:lineId', (req, res) => {
  const { custom_date, custom_time, line_type } = req.body;
  const db = getDb();
  db.prepare('UPDATE match_lines SET custom_date=?, custom_time=?, line_type=? WHERE id=? AND match_id=?')
    .run(custom_date || null, custom_time || null, line_type, req.params.lineId, req.params.id);
  res.json(db.prepare('SELECT * FROM match_lines WHERE id = ?').get(req.params.lineId));
});

// POST assign players to a line
router.post('/:id/lines/:lineId/players', (req, res) => {
  const { player_ids } = req.body; // array of player IDs
  const db = getDb();

  const assign = db.transaction(() => {
    db.prepare('DELETE FROM match_line_players WHERE match_line_id = ?').run(req.params.lineId);
    const insert = db.prepare('INSERT INTO match_line_players (match_line_id, player_id, position) VALUES (?, ?, ?)');
    if (Array.isArray(player_ids)) {
      [...new Set(player_ids)].forEach((pid, idx) => insert.run(req.params.lineId, pid, idx + 1));
    }
  });
  assign();
  res.json({ success: true });
});

// POST update score for a line
router.post('/:id/lines/:lineId/score', (req, res) => {
  const { set1_us, set1_them, set2_us, set2_them, set3_us, set3_them, result, notes } = req.body;
  const db = getDb();
  db.prepare(`
    INSERT INTO match_scores (match_line_id, set1_us, set1_them, set2_us, set2_them, set3_us, set3_them, result, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(match_line_id) DO UPDATE SET
      set1_us=excluded.set1_us, set1_them=excluded.set1_them,
      set2_us=excluded.set2_us, set2_them=excluded.set2_them,
      set3_us=excluded.set3_us, set3_them=excluded.set3_them,
      result=excluded.result, notes=excluded.notes
  `).run(req.params.lineId, set1_us ?? null, set1_them ?? null, set2_us ?? null, set2_them ?? null, set3_us ?? null, set3_them ?? null, result || null, notes || null);
  res.json({ success: true });
});

// DELETE match
router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM matches WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
