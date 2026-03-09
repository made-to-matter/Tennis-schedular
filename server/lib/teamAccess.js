const { query } = require('../database');

async function assertTeamAccess(teamId, userId) {
  const result = await query(`
    SELECT 1 FROM teams WHERE id = $1 AND captain_id = $2
    UNION
    SELECT 1 FROM team_co_captains WHERE team_id = $1 AND co_captain_id = $2
    LIMIT 1
  `, [teamId, userId]);
  return result.rows.length > 0;
}

module.exports = { assertTeamAccess };
