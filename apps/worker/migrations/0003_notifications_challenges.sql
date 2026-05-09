-- Direct user-to-user challenges (separate from one-time invite links).
CREATE TABLE IF NOT EXISTS challenges (
  id            TEXT PRIMARY KEY,
  from_user_id  TEXT NOT NULL REFERENCES users(clerk_id),
  to_user_id    TEXT NOT NULL REFERENCES users(clerk_id),
  time_control  TEXT NOT NULL,
  initial_ms    INTEGER NOT NULL,
  increment_ms  INTEGER NOT NULL,
  color_pref    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | declined | cancelled | expired
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  game_id       TEXT
);

CREATE INDEX IF NOT EXISTS idx_challenges_to_status     ON challenges(to_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_challenges_from_status   ON challenges(from_user_id, status, created_at DESC);

-- Generic per-user notifications. Payload is JSON the client decodes by `kind`.
CREATE TABLE IF NOT EXISTS notifications (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(clerk_id),
  kind        TEXT NOT NULL,    -- challenge_received | challenge_accepted | challenge_declined | new_follower | challenge_cancelled
  payload     TEXT NOT NULL,    -- JSON
  read_at     INTEGER,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_time   ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read_at, created_at DESC);
