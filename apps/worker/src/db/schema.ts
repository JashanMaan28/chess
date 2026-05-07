import { sqliteTable, text, integer, index, primaryKey } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  clerkId: text("clerk_id").primaryKey(),
  username: text("username").notNull().unique(),
  eloBullet: integer("elo_bullet").notNull().default(1200),
  eloBlitz: integer("elo_blitz").notNull().default(1200),
  eloRapid: integer("elo_rapid").notNull().default(1200),
  gamesPlayed: integer("games_played").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  level: text("level"),
  preferredTc: text("preferred_tc"),
  puzzleRating: integer("puzzle_rating").notNull().default(1200),
  puzzlesSolved: integer("puzzles_solved").notNull().default(0),
  puzzlesFailed: integer("puzzles_failed").notNull().default(0),
  onboardedAt: integer("onboarded_at"),
});

export const games = sqliteTable(
  "games",
  {
    id: text("id").primaryKey(),
    whiteId: text("white_id").notNull(),
    blackId: text("black_id").notNull(),
    timeControl: text("time_control").notNull(),
    initialMs: integer("initial_ms").notNull(),
    incrementMs: integer("increment_ms").notNull(),
    result: text("result").notNull(),
    termination: text("termination"),
    pgn: text("pgn").notNull(),
    startedAt: integer("started_at").notNull(),
    endedAt: integer("ended_at"),
    whiteEloBefore: integer("white_elo_before").notNull(),
    blackEloBefore: integer("black_elo_before").notNull(),
    whiteEloAfter: integer("white_elo_after"),
    blackEloAfter: integer("black_elo_after"),
  },
  (t) => ({
    whiteEndedIdx: index("idx_games_white_ended").on(t.whiteId, t.endedAt),
    blackEndedIdx: index("idx_games_black_ended").on(t.blackId, t.endedAt),
  })
);

export const friendInvites = sqliteTable("friend_invites", {
  code: text("code").primaryKey(),
  inviterId: text("inviter_id").notNull(),
  timeControl: text("time_control").notNull(),
  initialMs: integer("initial_ms").notNull(),
  incrementMs: integer("increment_ms").notNull(),
  colorPref: text("color_pref").notNull(),
  expiresAt: integer("expires_at").notNull(),
  usedAt: integer("used_at"),
  gameId: text("game_id"),
});

export const follows = sqliteTable(
  "follows",
  {
    followerId: text("follower_id").notNull(),
    followeeId: text("followee_id").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.followerId, t.followeeId] }),
    followeeIdx: index("idx_follows_followee").on(t.followeeId),
  })
);

export const puzzleAttempts = sqliteTable(
  "puzzle_attempts",
  {
    userId: text("user_id").notNull(),
    puzzleId: text("puzzle_id").notNull(),
    solved: integer("solved").notNull(),
    ratingBefore: integer("rating_before").notNull(),
    ratingAfter: integer("rating_after").notNull(),
    attemptedAt: integer("attempted_at").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.puzzleId] }),
    userTimeIdx: index("idx_puzzle_attempts_user_time").on(t.userId, t.attemptedAt),
  })
);

export type User = typeof users.$inferSelect;
export type Game = typeof games.$inferSelect;
export type FriendInvite = typeof friendInvites.$inferSelect;
export type Follow = typeof follows.$inferSelect;
export type PuzzleAttempt = typeof puzzleAttempts.$inferSelect;
