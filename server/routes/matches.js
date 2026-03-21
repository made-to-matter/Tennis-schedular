const express = require('express');
const router = express.Router();
const { query, getClient } = require('../database');

async function loadDateOptions(matchId) {
  return (await query(
    'SELECT * FROM match_date_options WHERE match_id = $1 ORDER BY sort_order, id',
    [matchId]
  )).rows;
}

function sameOptionSlot(row, inc) {
  if (row.option_date !== inc.option_date) return false;
  const t1 = row.option_time == null || row.option_time === '' ? null : row.option_time;
  const t2 = inc.option_time == null || inc.option_time === '' ? null : inc.option_time;
  return t1 === t2;
}

/** Update options in place when date/time match so IDs stay stable (preserves player_availability FKs). */
async function replaceDateOptions(client, matchId, dateOptions) {
  if (!Array.isArray(dateOptions)) {
    await client.query('DELETE FROM match_date_options WHERE match_id = $1', [matchId]);
    return;
  }

  const normalized = dateOptions
    .filter(o => o && o.option_date)
    .map((o, i) => ({
      option_date: o.option_date,
      option_time: o.option_time || null,
      sort_order: o.sort_order != null ? o.sort_order : i,
    }));

  const { rows: existing } = await client.query(
    'SELECT * FROM match_date_options WHERE match_id = $1',
    [matchId]
  );

  for (const inc of normalized) {
    const hit = existing.find(ex => sameOptionSlot(ex, inc));
    if (hit) {
      await client.query(
        'UPDATE match_date_options SET sort_order = $1 WHERE id = $2',
        [inc.sort_order, hit.id]
      );
    }
  }

  for (const ex of existing) {
    const keep = normalized.some(inc => sameOptionSlot(ex, inc));
    if (!keep) {
      await client.query('DELETE FROM match_date_options WHERE id = $1', [ex.id]);
    }
  }

  for (const inc of normalized) {
    const had = existing.some(ex => sameOptionSlot(ex, inc));
    if (!had) {
      await client.query(
        `INSERT INTO match_date_options (match_id, option_date, option_time, sort_order)
         VALUES ($1, $2, $3, $4)`,
        [matchId, inc.option_date, inc.option_time, inc.sort_order]
      );
    }
  }
}

async function getMatchFull(id) {
  const matchResult = await query(`
    SELECT m.*, o.name as opponent_name, o.address as opponent_address, s.name as season_name, s.num_sets as season_num_sets, s.last_set_tiebreak as season_last_set_tiebreak, t.name as team_name
    FROM matches m
    LEFT JOIN opponents o ON o.id = m.opponent_id
    LEFT JOIN seasons s ON s.id = m.season_id
    LEFT JOIN teams t ON t.id = m.team_id
    WHERE m.id = $1
  `, [id]);
  const match = matchResult.rows[0];
  if (!match) return null;

  match.date_options = await loadDateOptions(id);

  match.lines = (await query(
    'SELECT * FROM match_lines WHERE match_id = $1 ORDER BY line_number',
    [id]
  )).rows;

  for (const line of match.lines) {
    line.players = (await query(`
      SELECT mlp.*, p.name, p.email, p.cell
      FROM match_line_players mlp
      JOIN players p ON p.id = mlp.player_id
      WHERE mlp.match_line_id = $1
      ORDER BY mlp.position
    `, [line.id])).rows;
    line.score = (await query(
      'SELECT * FROM match_scores WHERE match_line_id = $1',
      [line.id]
    )).rows[0] || null;
  }

  match.availability = (await query(`
    SELECT pa.*, p.name, p.cell
    FROM player_availability pa
    JOIN players p ON p.id = pa.player_id
    WHERE pa.match_id = $1
  `, [id])).rows;

  return match;
}

// GET all matches (scoped to captain via teams; optional ?team_id= filter)
router.get('/', async (req, res) => {
  try {
    const { team_id } = req.query;
    let matches;
    if (team_id) {
      matches = (await query(`
        SELECT m.*, o.name as opponent_name, s.name as season_name
        FROM matches m
        LEFT JOIN opponents o ON o.id = m.opponent_id
        LEFT JOIN seasons s ON s.id = m.season_id
        LEFT JOIN teams t ON t.id = m.team_id
        WHERE m.team_id = $1 AND t.captain_id = ANY($2::uuid[])
        ORDER BY m.match_date DESC
      `, [team_id, req.captainIds])).rows;
    } else {
      matches = (await query(`
        SELECT m.*, o.name as opponent_name, s.name as season_name
        FROM matches m
        LEFT JOIN opponents o ON o.id = m.opponent_id
        LEFT JOIN seasons s ON s.id = m.season_id
        LEFT JOIN teams t ON t.id = m.team_id
        WHERE t.captain_id = ANY($1::uuid[])
        ORDER BY m.match_date DESC
      `, [req.captainIds])).rows;
    }
    res.json(matches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single match (full detail)
router.get('/:id', async (req, res) => {
  try {
    const match = await getMatchFull(req.params.id);
    if (!match) return res.status(404).json({ error: 'Match not found' });
    res.json(match);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create match
router.post('/', async (req, res) => {
  const {
    season_id, opponent_id, match_date, match_time,
    is_home, away_address, notes, lines, team_id, date_options
  } = req.body;

  if (!match_date) return res.status(400).json({ error: 'match_date is required' });
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const result = await client.query(`
      INSERT INTO matches (season_id, opponent_id, match_date, match_time, is_home, away_address, use_custom_dates, notes, team_id)
      VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8)
      RETURNING id
    `, [
      season_id || null, opponent_id || null, match_date, match_time || null,
      is_home !== undefined ? is_home : 1, away_address || null,
      notes || null, team_id || null
    ]);
    const matchId = result.rows[0].id;

    await replaceDateOptions(client, matchId, date_options);

    let lineList = lines;
    if (!lineList && season_id) {
      lineList = (await client.query(
        'SELECT * FROM line_templates WHERE season_id = $1 ORDER BY line_number',
        [season_id]
      )).rows;
    }

    if (Array.isArray(lineList)) {
      for (const l of lineList) {
        await client.query(
          `INSERT INTO match_lines (match_id, line_number, line_type, custom_date, custom_time, match_date_option_id)
           VALUES ($1, $2, $3, NULL, NULL, NULL)`,
          [matchId, l.line_number, l.line_type]
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json(await getMatchFull(matchId));
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PUT update match
router.put('/:id', async (req, res) => {
  const {
    season_id, opponent_id, match_date, match_time,
    is_home, away_address, notes, status, lines, team_id, date_options
  } = req.body;
  const client = await getClient();
  try {
    await client.query('BEGIN');

    let resolvedTeamId = team_id !== undefined ? (team_id || null) : null;
    if (team_id === undefined) {
      const existing = (await client.query('SELECT team_id FROM matches WHERE id=$1', [req.params.id])).rows[0];
      resolvedTeamId = existing?.team_id || null;
    }

    await client.query(`
      UPDATE matches SET season_id=$1, opponent_id=$2, match_date=$3, match_time=$4,
      is_home=$5, away_address=$6, use_custom_dates=0, notes=$7, status=$8, team_id=$9
      WHERE id=$10
    `, [
      season_id || null, opponent_id || null, match_date, match_time || null,
      is_home !== undefined ? is_home : 1, away_address || null,
      notes || null, status || 'scheduled',
      resolvedTeamId, req.params.id
    ]);

    if (Object.prototype.hasOwnProperty.call(req.body, 'date_options') && Array.isArray(date_options)) {
      await replaceDateOptions(client, req.params.id, date_options);
    }

    if (Array.isArray(lines)) {
      await client.query('DELETE FROM match_lines WHERE match_id = $1', [req.params.id]);
      for (const l of lines) {
        await client.query(
          `INSERT INTO match_lines (match_id, line_number, line_type, custom_date, custom_time, match_date_option_id)
           VALUES ($1, $2, $3, NULL, NULL, NULL)`,
          [req.params.id, l.line_number, l.line_type]
        );
      }
    }

    await client.query('COMMIT');
    res.json(await getMatchFull(req.params.id));
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PATCH update match line (play slot + line type)
router.patch('/:id/lines/:lineId', async (req, res) => {
  const { match_date_option_id, line_type } = req.body;
  try {
    const updates = [];
    const vals = [];
    let n = 1;
    if (Object.prototype.hasOwnProperty.call(req.body, 'match_date_option_id')) {
      const optRaw = match_date_option_id;
      const optId = optRaw === null || optRaw === '' || optRaw === undefined
        ? null
        : parseInt(optRaw, 10);
      updates.push(`match_date_option_id=$${n++}`);
      vals.push(Number.isFinite(optId) ? optId : null);
    }
    if (line_type !== undefined) {
      updates.push(`line_type=$${n++}`);
      vals.push(line_type);
    }
    if (updates.length === 0) {
      const line = (await query('SELECT * FROM match_lines WHERE id = $1', [req.params.lineId])).rows[0];
      return res.json(line);
    }
    vals.push(req.params.lineId, req.params.id);
    await query(
      `UPDATE match_lines SET ${updates.join(', ')} WHERE id=$${n++} AND match_id=$${n++}`,
      vals
    );
    const line = (await query('SELECT * FROM match_lines WHERE id = $1', [req.params.lineId])).rows[0];
    res.json(line);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST assign players to a line
router.post('/:id/lines/:lineId/players', async (req, res) => {
  const { player_ids } = req.body;
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM match_line_players WHERE match_line_id = $1', [req.params.lineId]);
    if (Array.isArray(player_ids)) {
      const unique = [...new Set(player_ids)];
      for (let idx = 0; idx < unique.length; idx++) {
        await client.query(
          'INSERT INTO match_line_players (match_line_id, player_id, position) VALUES ($1, $2, $3)',
          [req.params.lineId, unique[idx], idx + 1]
        );
      }
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

// POST update score for a line
router.post('/:id/lines/:lineId/score', async (req, res) => {
  const { set1_us, set1_them, set2_us, set2_them, set3_us, set3_them, result, notes } = req.body;
  try {
    await query(`
      INSERT INTO match_scores (match_line_id, set1_us, set1_them, set2_us, set2_them, set3_us, set3_them, result, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT(match_line_id) DO UPDATE SET
        set1_us=EXCLUDED.set1_us, set1_them=EXCLUDED.set1_them,
        set2_us=EXCLUDED.set2_us, set2_them=EXCLUDED.set2_them,
        set3_us=EXCLUDED.set3_us, set3_them=EXCLUDED.set3_them,
        result=EXCLUDED.result, notes=EXCLUDED.notes
    `, [req.params.lineId, set1_us ?? null, set1_them ?? null, set2_us ?? null, set2_them ?? null,
        set3_us ?? null, set3_them ?? null, result || null, notes || null]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE match
router.delete('/:id', async (req, res) => {
  try {
    await query('DELETE FROM matches WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
