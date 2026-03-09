-- Co-captain invite feature
CREATE TABLE IF NOT EXISTS team_co_captains (
  id SERIAL PRIMARY KEY,
  team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
  co_captain_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(team_id, co_captain_id)
);

CREATE TABLE IF NOT EXISTS team_invite_tokens (
  id SERIAL PRIMARY KEY,
  team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
  invited_by UUID REFERENCES auth.users(id),
  token TEXT UNIQUE NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
