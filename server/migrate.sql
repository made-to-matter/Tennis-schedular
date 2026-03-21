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
-- available: 0 = unavailable, 1 = available, 2 = maybe
COMMENT ON COLUMN player_availability.available IS '0 = unavailable, 1 = available, 2 = maybe';

-- Functional unique index handles NULL match_line_id correctly (legacy; superseded below after migration)
CREATE UNIQUE INDEX IF NOT EXISTS player_avail_unique_idx
  ON player_availability (player_id, match_id, COALESCE(match_line_id, 0));

-- Match-level date options (extra slots beyond primary match_date / match_time)
CREATE TABLE IF NOT EXISTS match_date_options (
  id SERIAL PRIMARY KEY,
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  option_date TEXT NOT NULL,
  option_time TEXT,
  sort_order INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS match_date_options_match_id_idx ON match_date_options (match_id);

ALTER TABLE match_lines ADD COLUMN IF NOT EXISTS match_date_option_id INTEGER REFERENCES match_date_options(id) ON DELETE SET NULL;

ALTER TABLE player_availability ADD COLUMN IF NOT EXISTS match_date_option_id INTEGER REFERENCES match_date_options(id) ON DELETE CASCADE;

-- One-time migration from per-line availability to slot-based (idempotent-ish: safe if options already exist)
-- 1) Backfill options for matches that used custom line dates
INSERT INTO match_date_options (match_id, option_date, option_time, sort_order)
SELECT x.match_id, x.option_date, x.option_time,
  ROW_NUMBER() OVER (PARTITION BY x.match_id ORDER BY x.option_date, COALESCE(x.option_time, ''))
FROM (
  SELECT DISTINCT ml.match_id,
    COALESCE(NULLIF(TRIM(ml.custom_date), ''), m.match_date) AS option_date,
    COALESCE(NULLIF(TRIM(ml.custom_time), ''), m.match_time) AS option_time
  FROM match_lines ml
  JOIN matches m ON m.id = ml.match_id
  WHERE COALESCE(m.use_custom_dates, 0) = 1
) x
WHERE NOT EXISTS (
  SELECT 1 FROM match_date_options o
  WHERE o.match_id = x.match_id
    AND o.option_date = x.option_date
    AND (o.option_time IS NOT DISTINCT FROM x.option_time)
);

UPDATE match_lines ml
SET match_date_option_id = mdo.id
FROM match_date_options mdo, matches m
WHERE m.id = ml.match_id
  AND ml.match_id = mdo.match_id
  AND COALESCE(m.use_custom_dates, 0) = 1
  AND COALESCE(NULLIF(TRIM(ml.custom_date), ''), m.match_date) = mdo.option_date
  AND (COALESCE(NULLIF(TRIM(ml.custom_time), ''), m.match_time) IS NOT DISTINCT FROM mdo.option_time);

UPDATE player_availability pa
SET match_date_option_id = ml.match_date_option_id
FROM match_lines ml
WHERE pa.match_line_id = ml.id
  AND pa.match_date_option_id IS NULL;

-- Prefer available=1 when deduping same slot (while match_line_id still differentiates rows)
DELETE FROM player_availability pa
WHERE pa.id IN (
  SELECT pa2.id
  FROM player_availability pa2
  INNER JOIN (
    SELECT player_id, match_id, COALESCE(match_date_option_id, 0) AS slot,
      (ARRAY_AGG(id ORDER BY available DESC, id))[1] AS keep_id
    FROM player_availability
    GROUP BY player_id, match_id, COALESCE(match_date_option_id, 0)
    HAVING COUNT(*) > 1
  ) d ON pa2.player_id = d.player_id AND pa2.match_id = d.match_id
    AND COALESCE(pa2.match_date_option_id, 0) = d.slot
    AND pa2.id <> d.keep_id
);

-- MUST drop legacy index before clearing match_line_id: otherwise every row gets
-- COALESCE(match_line_id,0)=0 and violates (player_id, match_id, 0) uniqueness.
DROP INDEX IF EXISTS player_avail_unique_idx;

UPDATE player_availability SET match_line_id = NULL WHERE match_line_id IS NOT NULL;

-- Dedupe again on slot after line ids are cleared
DELETE FROM player_availability pa
WHERE pa.id IN (
  SELECT pa2.id
  FROM player_availability pa2
  INNER JOIN (
    SELECT player_id, match_id, COALESCE(match_date_option_id, 0) AS slot,
      (ARRAY_AGG(id ORDER BY available DESC, id))[1] AS keep_id
    FROM player_availability
    GROUP BY player_id, match_id, COALESCE(match_date_option_id, 0)
    HAVING COUNT(*) > 1
  ) d ON pa2.player_id = d.player_id AND pa2.match_id = d.match_id
    AND COALESCE(pa2.match_date_option_id, 0) = d.slot
    AND pa2.id <> d.keep_id
);

CREATE UNIQUE INDEX IF NOT EXISTS player_avail_option_unique_idx
  ON player_availability (player_id, match_id, COALESCE(match_date_option_id, 0));

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

-- Add season scoring defaults (run once on existing DB)
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS num_sets INTEGER DEFAULT 3;
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS last_set_tiebreak BOOLEAN DEFAULT TRUE;

-- Co-captain feature
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
