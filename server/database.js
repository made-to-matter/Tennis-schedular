const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'tennis.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT,
      cell TEXT,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS opponents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS seasons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      default_day_of_week INTEGER,
      default_time TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS line_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      season_id INTEGER REFERENCES seasons(id) ON DELETE CASCADE,
      line_number INTEGER NOT NULL,
      line_type TEXT NOT NULL CHECK(line_type IN ('singles', 'doubles'))
    );

    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      season_id INTEGER REFERENCES seasons(id),
      opponent_id INTEGER REFERENCES opponents(id),
      match_date TEXT NOT NULL,
      match_time TEXT,
      is_home INTEGER DEFAULT 1,
      away_address TEXT,
      use_custom_dates INTEGER DEFAULT 0,
      notes TEXT,
      status TEXT DEFAULT 'scheduled',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS match_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE,
      line_number INTEGER NOT NULL,
      line_type TEXT NOT NULL CHECK(line_type IN ('singles', 'doubles')),
      custom_date TEXT,
      custom_time TEXT
    );

    CREATE TABLE IF NOT EXISTS match_line_players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_line_id INTEGER REFERENCES match_lines(id) ON DELETE CASCADE,
      player_id INTEGER REFERENCES players(id),
      position INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS player_availability (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER REFERENCES players(id),
      match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE,
      match_line_id INTEGER,
      available INTEGER,
      response_date DATETIME,
      UNIQUE(player_id, match_id, match_line_id)
    );

    CREATE TABLE IF NOT EXISTS match_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER REFERENCES players(id),
      match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      expires_at TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS team_players (
      team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
      player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
      PRIMARY KEY (team_id, player_id)
    );
  `);

  // Migrations: add team_id columns if they don't exist yet
  const seasonCols = db.prepare('PRAGMA table_info(seasons)').all().map(c => c.name);
  if (!seasonCols.includes('team_id')) {
    db.exec('ALTER TABLE seasons ADD COLUMN team_id INTEGER REFERENCES teams(id)');
  }

  const matchCols = db.prepare('PRAGMA table_info(matches)').all().map(c => c.name);
  if (!matchCols.includes('team_id')) {
    db.exec('ALTER TABLE matches ADD COLUMN team_id INTEGER REFERENCES teams(id)');
  }
}

module.exports = { getDb };
