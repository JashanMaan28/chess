CREATE TABLE IF NOT EXISTS users (
  clerk_id      TEXT PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  elo_bullet    INTEGER NOT NULL DEFAULT 1200,
  elo_blitz     INTEGER NOT NULL DEFAULT 1200,
  elo_rapid     INTEGER NOT NULL DEFAULT 1200,
  games_played  INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS games (
  id                 TEXT PRIMARY KEY,
  white_id           TEXT NOT NULL REFERENCES users(clerk_id),
  black_id           TEXT NOT NULL REFERENCES users(clerk_id),
  time_control       TEXT NOT NULL,
  initial_ms         INTEGER NOT NULL,
  increment_ms       INTEGER NOT NULL,
  result             TEXT NOT NULL,
  termination        TEXT,
  pgn                TEXT NOT NULL,
  started_at         INTEGER NOT NULL,
  ended_at           INTEGER,
  white_elo_before   INTEGER NOT NULL,
  black_elo_before   INTEGER NOT NULL,
  white_elo_after    INTEGER,
  black_elo_after    INTEGER
);

CREATE INDEX IF NOT EXISTS idx_games_white_ended ON games(white_id, ended_at DESC);
CREATE INDEX IF NOT EXISTS idx_games_black_ended ON games(black_id, ended_at DESC);

CREATE TABLE IF NOT EXISTS friend_invites (
  code          TEXT PRIMARY KEY,
  inviter_id    TEXT NOT NULL REFERENCES users(clerk_id),
  time_control  TEXT NOT NULL,
  initial_ms    INTEGER NOT NULL,
  increment_ms  INTEGER NOT NULL,
  color_pref    TEXT NOT NULL,
  expires_at    INTEGER NOT NULL,
  used_at       INTEGER,
  game_id       TEXT
);
