-- User preferences set during onboarding.
ALTER TABLE users ADD COLUMN level TEXT;
ALTER TABLE users ADD COLUMN preferred_tc TEXT;
ALTER TABLE users ADD COLUMN puzzle_rating INTEGER NOT NULL DEFAULT 1200;
ALTER TABLE users ADD COLUMN puzzles_solved INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN puzzles_failed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN onboarded_at INTEGER;

-- Followship: a follows b. Mutual follow == friends.
CREATE TABLE IF NOT EXISTS follows (
  follower_id  TEXT NOT NULL REFERENCES users(clerk_id),
  followee_id  TEXT NOT NULL REFERENCES users(clerk_id),
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (follower_id, followee_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_followee ON follows(followee_id);

-- Per-user puzzle attempt log; small ring used to derive recents + stats.
CREATE TABLE IF NOT EXISTS puzzle_attempts (
  user_id     TEXT NOT NULL REFERENCES users(clerk_id),
  puzzle_id   TEXT NOT NULL,
  solved      INTEGER NOT NULL,
  rating_before INTEGER NOT NULL,
  rating_after  INTEGER NOT NULL,
  attempted_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, puzzle_id)
);

CREATE INDEX IF NOT EXISTS idx_puzzle_attempts_user_time ON puzzle_attempts(user_id, attempted_at DESC);
