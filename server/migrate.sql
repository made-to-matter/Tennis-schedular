-- Tennis Scheduler — PostgreSQL schema (Supabase)
-- Run once: psql $DATABASE_URL -f server/migrate.sql
-- Or: npm run migrate --prefix server

-- Captain-scoped tables (captain_id references Supabase auth.users)
CREATE TABLE IF NOT EXISTS teams (
  id SERIAL PRIMARY KEY,
  captain_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  description TEXT,
  active INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS players (
  id SERIAL PRIMARY KEY,
  captain_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  email TEXT,
  cell TEXT,
  active INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS opponents (
  id SERIAL PRIMARY KEY,
  captain_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  address TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS team_players (
  team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  PRIMARY KEY (team_id, player_id)
);

-- Seasons scoped to teams (captain scoping via teams.captain_id join)
CREATE TABLE IF NOT EXISTS seasons (
  id SERIAL PRIMARY KEY,
  team_id INTEGER REFERENCES teams(id),
  name TEXT NOT NULL,
  default_day_of_week INTEGER,
  default_time TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS line_templates (
  id SERIAL PRIMARY KEY,
  season_id INTEGER REFERENCES seasons(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  line_type TEXT NOT NULL CHECK(line_type IN ('singles', 'doubles'))
);

-- Matches scoped to teams
CREATE TABLE IF NOT EXISTS matches (
  id SERIAL PRIMARY KEY,
  team_id INTEGER REFERENCES teams(id),
  season_id INTEGER REFERENCES seasons(id),
  opponent_id INTEGER REFERENCES opponents(id),
  match_date TEXT NOT NULL,
  match_time TEXT,
  is_home INTEGER DEFAULT 1,
  away_address TEXT,
  use_custom_dates INTEGER DEFAULT 0,
  notes TEXT,
  status TEXT DEFAULT 'scheduled',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS match_lines (
  id SERIAL PRIMARY KEY,
  match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  line_type TEXT NOT NULL CHECK(line_type IN ('singles', 'doubles')),
  custom_date TEXT,
  custom_time TEXT
);

CREATE TABLE IF NOT EXISTS match_line_players (
  id SERIAL PRIMARY KEY,
  match_line_id INTEGER REFERENCES match_lines(id) ON DELETE CASCADE,
  player_id INTEGER REFERENCES players(id),
  position INTEGER DEFAULT 1
);

-- Availability (nullable match_line_id: null = match-level, set = line-level)
CREATE TABLE IF NOT EXISTS player_availability (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id),
  match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE,
  match_line_id INTEGER,
  available INTEGER,
  response_date TIMESTAMPTZ
);

-- Functional unique index handles NULL match_line_id correctly
CREATE UNIQUE INDEX IF NOT EXISTS player_avail_unique_idx
  ON player_availability (player_id, match_id, COALESCE(match_line_id, 0));

CREATE TABLE IF NOT EXISTS match_scores (
  id SERIAL PRIMARY KEY,
  match_line_id INTEGER REFERENCES match_lines(id) ON DELETE CASCADE,
  set1_us INTEGER,
  set1_them INTEGER,
  set2_us INTEGER,
  set2_them INTEGER,
  set3_us INTEGER,
  set3_them INTEGER,
  result TEXT CHECK(result IN ('win', 'loss', 'default_win', 'default_loss')),
  notes TEXT,
  UNIQUE(match_line_id)
);

CREATE TABLE IF NOT EXISTS availability_tokens (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id),
  match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS season_players (
  season_id INTEGER REFERENCES seasons(id) ON DELETE CASCADE,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  PRIMARY KEY (season_id, player_id)
);
