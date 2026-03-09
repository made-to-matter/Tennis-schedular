const { createClient } = require('@supabase/supabase-js');
const { query: dbQuery } = require('../database');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

module.exports = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Invalid token' });

  req.userId = user.id;
  req.captainId = user.id; // unchanged for backward compat

  // Load captain_ids of teams this user co-captains
  try {
    const { rows } = await dbQuery(
      `SELECT DISTINCT t.captain_id FROM team_co_captains tcc
       JOIN teams t ON t.id = tcc.team_id WHERE tcc.co_captain_id = $1`,
      [user.id]
    );
    req.captainIds = [user.id, ...rows.map(r => r.captain_id)];
  } catch {
    req.captainIds = [user.id];
  }

  next();
};
