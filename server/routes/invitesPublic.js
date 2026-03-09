const { query } = require('../database');

// GET /api/invites/preview/:token — no auth required
module.exports = async (req, res) => {
  try {
    const { token } = req.params;
    const result = await query(`
      SELECT t.name as team_name, ti.accepted_at
      FROM team_invite_tokens ti
      JOIN teams t ON t.id = ti.team_id
      WHERE ti.token = $1
    `, [token]);

    if (result.rows.length === 0) {
      return res.json({ valid: false });
    }

    const row = result.rows[0];
    res.json({
      valid: true,
      teamName: row.team_name,
      alreadyAccepted: !!row.accepted_at,
      token,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
