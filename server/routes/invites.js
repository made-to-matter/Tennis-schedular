const express = require('express');
const router = express.Router();
const { query } = require('../database');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

function adminClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// GET /api/invites/team/:teamId/token — captain only; returns invite link
router.get('/team/:teamId/token', async (req, res) => {
  const { teamId } = req.params;
  try {
    // Only true captain can invite
    const teamRow = (await query(
      'SELECT id FROM teams WHERE id = $1 AND captain_id = $2',
      [teamId, req.captainId]
    )).rows[0];
    if (!teamRow) return res.status(403).json({ error: 'Only the team captain can invite co-captains' });

    // Re-use unaccepted token or generate new one
    let existing = (await query(
      'SELECT token FROM team_invite_tokens WHERE team_id = $1 AND accepted_at IS NULL ORDER BY created_at DESC LIMIT 1',
      [teamId]
    )).rows[0];

    let token;
    if (existing) {
      token = existing.token;
    } else {
      token = crypto.randomUUID();
      await query(
        'INSERT INTO team_invite_tokens (team_id, invited_by, token) VALUES ($1, $2, $3)',
        [teamId, req.captainId, token]
      );
    }

    const baseUrl = process.env.BASE_URL || 'http://localhost:5175';
    res.json({ link: `${baseUrl}/invite/${token}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/invites/accept/:token — auth required; accept the invite
router.post('/accept/:token', async (req, res) => {
  const { token } = req.params;
  try {
    const tokenRow = (await query(
      'SELECT * FROM team_invite_tokens WHERE token = $1',
      [token]
    )).rows[0];

    if (!tokenRow) return res.status(404).json({ error: 'Invalid invite token' });
    if (tokenRow.accepted_at) return res.status(409).json({ error: 'Invite already accepted' });

    // Prevent captain from accepting their own invite
    const teamRow = (await query('SELECT captain_id FROM teams WHERE id = $1', [tokenRow.team_id])).rows[0];
    if (teamRow?.captain_id === req.userId) {
      return res.status(400).json({ error: 'You are already the captain of this team' });
    }

    // Insert co-captain (ignore if already exists)
    await query(
      'INSERT INTO team_co_captains (team_id, co_captain_id, invited_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [tokenRow.team_id, req.userId, tokenRow.invited_by]
    );

    // Mark token accepted
    await query(
      'UPDATE team_invite_tokens SET accepted_at = CURRENT_TIMESTAMP WHERE id = $1',
      [tokenRow.id]
    );

    res.json({ success: true, teamId: tokenRow.team_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/invites/team/:teamId/co-captains — captain only
router.get('/team/:teamId/co-captains', async (req, res) => {
  const { teamId } = req.params;
  try {
    const teamRow = (await query(
      'SELECT id FROM teams WHERE id = $1 AND captain_id = $2',
      [teamId, req.captainId]
    )).rows[0];
    if (!teamRow) return res.status(403).json({ error: 'Access denied' });

    const rows = (await query(
      'SELECT co_captain_id FROM team_co_captains WHERE team_id = $1',
      [teamId]
    )).rows;

    if (rows.length === 0) return res.json([]);

    // Fetch user info from Supabase auth
    const admin = adminClient();
    const coCaptains = await Promise.all(rows.map(async (r) => {
      try {
        const { data } = await admin.auth.admin.getUserById(r.co_captain_id);
        return {
          id: r.co_captain_id,
          email: data?.user?.email || null,
          name: data?.user?.user_metadata?.full_name || null,
        };
      } catch {
        return { id: r.co_captain_id, email: null, name: null };
      }
    }));

    res.json(coCaptains);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/invites/team/:teamId/co-captains/:userId — captain only
router.delete('/team/:teamId/co-captains/:userId', async (req, res) => {
  const { teamId, userId } = req.params;
  try {
    const teamRow = (await query(
      'SELECT id FROM teams WHERE id = $1 AND captain_id = $2',
      [teamId, req.captainId]
    )).rows[0];
    if (!teamRow) return res.status(403).json({ error: 'Access denied' });

    await query(
      'DELETE FROM team_co_captains WHERE team_id = $1 AND co_captain_id = $2',
      [teamId, userId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
