import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  clerkId: text("clerk_id").primaryKey(),
  username: text("username").notNull().unique(),
  eloBullet: integer("elo_bullet").notNull().default(1200),
  eloBlitz: integer("elo_blitz").notNull().default(1200),
  eloRapid: integer("elo_rapid").notNull().default(1200),
  gamesPlayed: integer("games_played").notNull().default(0),
  createdAt: integer("created_at").notNull(),
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

export type User = typeof users.$inferSelect;
export type Game = typeof games.$inferSelect;
export type FriendInvite = typeof friendInvites.$inferSelect;
