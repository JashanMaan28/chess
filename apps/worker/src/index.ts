import { Hono } from "hono";
import { cors } from "hono/cors";
import { nanoid } from "nanoid";
import { eq, desc, and, or, isNull, like, inArray, sql } from "drizzle-orm";
import type { Env } from "./env";
import { authenticate, bearerToken, verifySessionToken } from "./auth";
import { getDb, schema, type DBClient } from "./db/client";
import {
  bucketFor,
  resolveTimeControl,
  type TimeControlBucket,
} from "@chess/shared/time-controls";

/** Map any bucket to the elo column we track (we don't yet store eloClassical). */
function eloKeyForBucket(bucket: TimeControlBucket): "eloBullet" | "eloBlitz" | "eloRapid" {
  if (bucket === "bullet") return "eloBullet";
  if (bucket === "blitz") return "eloBlitz";
  // Classical folds into rapid for elo purposes.
  return "eloRapid";
}

async function pushNotification(
  db: DBClient,
  userId: string,
  kind: string,
  payload: Record<string, unknown>
) {
  await db.insert(schema.notifications).values({
    id: nanoid(12),
    userId,
    kind,
    payload: JSON.stringify(payload),
    createdAt: Date.now(),
  });
}

export { GameRoomDO } from "./do/GameRoom";
export { MatchmakingDO } from "./do/Matchmaking";

type Vars = {
  user: { clerkId: string; username: string };
};

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

// CORS
app.use("*", async (c, next) => {
  const allowed = (c.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const handler = cors({
    origin: (origin) => {
      if (!origin) return null;
      if (allowed.includes(origin)) return origin;
      // Allow Vercel preview subdomains for the same project
      try {
        const u = new URL(origin);
        if (u.hostname.endsWith(".vercel.app") && allowed.some((a) => a.endsWith(".vercel.app")))
          return origin;
      } catch {
        // ignore
      }
      return null;
    },
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Authorization", "Content-Type"],
    credentials: true,
  });
  return handler(c as any, next);
});

const authMw = async (c: any, next: any) => {
  const user = await authenticate(c.env, bearerToken(c.req.raw));
  if (!user) return c.json({ error: "unauthorized" }, 401);
  c.set("user", user);
  return next();
};

app.get("/", (c) => c.text("chess-worker ok"));

// ------- Auth -------
app.get("/me", authMw, async (c) => {
  const u = c.get("user");
  const db = getDb(c.env.DB);
  const row = await db.query.users.findFirst({
    where: eq(schema.users.clerkId, u.clerkId),
  });
  return c.json(row);
});

// Update onboarding-time prefs (level / preferredTc) and mark onboarded.
app.post("/me/onboard", authMw, async (c) => {
  const u = c.get("user");
  const body = (await c.req.json()) as {
    level?: string;
    preferredTc?: string;
  };
  const allowedLevels = new Set(["beginner", "casual", "club", "strong"]);
  const level = body.level && allowedLevels.has(body.level) ? body.level : null;
  const preferredTc =
    body.preferredTc && resolveTimeControl(body.preferredTc)
      ? body.preferredTc
      : null;
  if (!level || !preferredTc) return c.json({ error: "bad_input" }, 400);

  // Seed puzzle rating to roughly match self-reported level.
  const seedRating = level === "beginner" ? 800 : level === "casual" ? 1200 : level === "club" ? 1600 : 1900;

  const db = getDb(c.env.DB);
  await db
    .update(schema.users)
    .set({
      level,
      preferredTc,
      puzzleRating: seedRating,
      onboardedAt: Date.now(),
    })
    .where(eq(schema.users.clerkId, u.clerkId));
  return c.json({ ok: true });
});

// ------- User search (username prefix, case-insensitive) -------
app.get("/users/search", async (c) => {
  const q = (c.req.query("q") || "").trim().toLowerCase();
  if (q.length < 1) return c.json({ users: [] });
  const db = getDb(c.env.DB);
  const rows = await db
    .select({
      username: schema.users.username,
      eloBlitz: schema.users.eloBlitz,
      eloBullet: schema.users.eloBullet,
      eloRapid: schema.users.eloRapid,
      gamesPlayed: schema.users.gamesPlayed,
    })
    .from(schema.users)
    .where(like(sql`lower(${schema.users.username})`, `${q}%`))
    .limit(8);
  return c.json({ users: rows });
});

// ------- Recent opponents (last N distinct opponents from finished games) -------
app.get("/me/recent-opponents", authMw, async (c) => {
  const u = c.get("user");
  const db = getDb(c.env.DB);
  const recent = await db
    .select()
    .from(schema.games)
    .where(or(eq(schema.games.whiteId, u.clerkId), eq(schema.games.blackId, u.clerkId)))
    .orderBy(desc(schema.games.endedAt))
    .limit(40);
  const seen = new Set<string>();
  const opponentIds: string[] = [];
  for (const g of recent) {
    const oppId = g.whiteId === u.clerkId ? g.blackId : g.whiteId;
    if (oppId === u.clerkId) continue;
    if (seen.has(oppId)) continue;
    seen.add(oppId);
    opponentIds.push(oppId);
    if (opponentIds.length >= 8) break;
  }
  if (opponentIds.length === 0) return c.json({ opponents: [] });
  const oppRows = await db
    .select({
      clerkId: schema.users.clerkId,
      username: schema.users.username,
      eloBullet: schema.users.eloBullet,
      eloBlitz: schema.users.eloBlitz,
      eloRapid: schema.users.eloRapid,
    })
    .from(schema.users)
    .where(inArray(schema.users.clerkId, opponentIds));
  const byId = new Map(oppRows.map((r) => [r.clerkId, r]));
  return c.json({
    opponents: opponentIds
      .map((id) => byId.get(id))
      .filter((x): x is NonNullable<typeof x> => !!x),
  });
});

// ------- In-progress games (Continue section) -------
// Live games live only in Durable Objects; finished games are in D1. The home
// "Continue" section shows the user's most recently *finished* games as
// review-able entries. (A real in-progress index would need DO heartbeat.)
app.get("/me/recent-games", authMw, async (c) => {
  const u = c.get("user");
  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(schema.games)
    .where(or(eq(schema.games.whiteId, u.clerkId), eq(schema.games.blackId, u.clerkId)))
    .orderBy(desc(schema.games.endedAt))
    .limit(6);
  const ids = new Set<string>();
  for (const g of rows) {
    ids.add(g.whiteId);
    ids.add(g.blackId);
  }
  const userRows = ids.size
    ? await db
        .select({ clerkId: schema.users.clerkId, username: schema.users.username })
        .from(schema.users)
        .where(inArray(schema.users.clerkId, Array.from(ids)))
    : [];
  const nameById = new Map(userRows.map((r) => [r.clerkId, r.username]));
  return c.json({
    games: rows.map((g) => ({
      ...g,
      whiteUsername: nameById.get(g.whiteId) || "",
      blackUsername: nameById.get(g.blackId) || "",
    })),
  });
});

// ------- Follows / friends -------
app.post("/users/:username/follow", authMw, async (c) => {
  const u = c.get("user");
  const target = c.req.param("username");
  const db = getDb(c.env.DB);
  const tu = await db.query.users.findFirst({
    where: eq(schema.users.username, target),
  });
  if (!tu) return c.json({ error: "not_found" }, 404);
  if (tu.clerkId === u.clerkId) return c.json({ error: "cannot_follow_self" }, 400);
  // Idempotent insert; only push a notification on first-time follow.
  const inserted = await db
    .insert(schema.follows)
    .values({
      followerId: u.clerkId,
      followeeId: tu.clerkId,
      createdAt: Date.now(),
    })
    .onConflictDoNothing()
    .returning();
  if (inserted.length > 0) {
    await pushNotification(db, tu.clerkId, "new_follower", {
      fromUsername: u.username,
    });
  }
  return c.json({ ok: true, following: true });
});

app.delete("/users/:username/follow", authMw, async (c) => {
  const u = c.get("user");
  const target = c.req.param("username");
  const db = getDb(c.env.DB);
  const tu = await db.query.users.findFirst({
    where: eq(schema.users.username, target),
  });
  if (!tu) return c.json({ error: "not_found" }, 404);
  await db
    .delete(schema.follows)
    .where(
      and(
        eq(schema.follows.followerId, u.clerkId),
        eq(schema.follows.followeeId, tu.clerkId)
      )
    );
  return c.json({ ok: true, following: false });
});

// Returns the list of users you follow, with each user's mutual-follow flag
// (treat mutual = friend) and a freshness signal: "lastSeenAt" approximated
// from the latest finished game endedAt. We don't have a real presence layer.
app.get("/me/follows", authMw, async (c) => {
  const u = c.get("user");
  const db = getDb(c.env.DB);
  const myFollows = await db
    .select({ followeeId: schema.follows.followeeId })
    .from(schema.follows)
    .where(eq(schema.follows.followerId, u.clerkId));
  const ids = myFollows.map((r) => r.followeeId);
  if (ids.length === 0) return c.json({ follows: [] });

  const [users, mutual, lastGames] = await Promise.all([
    db
      .select({
        clerkId: schema.users.clerkId,
        username: schema.users.username,
        eloBlitz: schema.users.eloBlitz,
        eloBullet: schema.users.eloBullet,
        eloRapid: schema.users.eloRapid,
      })
      .from(schema.users)
      .where(inArray(schema.users.clerkId, ids)),
    db
      .select({ followerId: schema.follows.followerId })
      .from(schema.follows)
      .where(
        and(
          eq(schema.follows.followeeId, u.clerkId),
          inArray(schema.follows.followerId, ids)
        )
      ),
    db
      .select({
        whiteId: schema.games.whiteId,
        blackId: schema.games.blackId,
        endedAt: schema.games.endedAt,
      })
      .from(schema.games)
      .where(
        and(
          or(
            inArray(schema.games.whiteId, ids),
            inArray(schema.games.blackId, ids)
          )
        )
      )
      .orderBy(desc(schema.games.endedAt))
      .limit(80),
  ]);
  const mutualSet = new Set(mutual.map((m) => m.followerId));
  const lastSeen = new Map<string, number>();
  for (const g of lastGames) {
    if (!g.endedAt) continue;
    for (const id of [g.whiteId, g.blackId]) {
      if (!ids.includes(id)) continue;
      const cur = lastSeen.get(id) ?? 0;
      if (g.endedAt > cur) lastSeen.set(id, g.endedAt);
    }
  }
  return c.json({
    follows: users.map((u) => ({
      ...u,
      mutual: mutualSet.has(u.clerkId),
      lastSeenAt: lastSeen.get(u.clerkId) ?? null,
    })),
  });
});

app.get("/users/:username/follow-status", authMw, async (c) => {
  const u = c.get("user");
  const target = c.req.param("username");
  const db = getDb(c.env.DB);
  const tu = await db.query.users.findFirst({
    where: eq(schema.users.username, target),
  });
  if (!tu) return c.json({ error: "not_found" }, 404);
  const [iFollow, theyFollow] = await Promise.all([
    db.query.follows.findFirst({
      where: and(
        eq(schema.follows.followerId, u.clerkId),
        eq(schema.follows.followeeId, tu.clerkId)
      ),
    }),
    db.query.follows.findFirst({
      where: and(
        eq(schema.follows.followerId, tu.clerkId),
        eq(schema.follows.followeeId, u.clerkId)
      ),
    }),
  ]);
  return c.json({
    following: !!iFollow,
    followsYou: !!theyFollow,
    mutual: !!iFollow && !!theyFollow,
  });
});

// ------- Puzzles -------
// Pick the next puzzle id for the user from a candidate pool sent by the
// client. The client owns the puzzle dataset (static JSON); we only know which
// puzzles the user has already attempted. Returns an id to play.
app.post("/puzzles/next", authMw, async (c) => {
  const u = c.get("user");
  const body = (await c.req.json()) as { candidateIds: string[] };
  if (!Array.isArray(body.candidateIds) || body.candidateIds.length === 0) {
    return c.json({ error: "no_candidates" }, 400);
  }
  // Cap to avoid ginormous IN clauses.
  const candidates = body.candidateIds.slice(0, 200);
  const db = getDb(c.env.DB);
  const me = await db.query.users.findFirst({
    where: eq(schema.users.clerkId, u.clerkId),
  });
  const seen = await db
    .select({ id: schema.puzzleAttempts.puzzleId })
    .from(schema.puzzleAttempts)
    .where(
      and(
        eq(schema.puzzleAttempts.userId, u.clerkId),
        inArray(schema.puzzleAttempts.puzzleId, candidates)
      )
    );
  const seenSet = new Set(seen.map((r) => r.id));
  const fresh = candidates.filter((id) => !seenSet.has(id));
  // If none fresh, allow repeats.
  const pool = fresh.length ? fresh : candidates;
  const pick = pool[Math.floor(Math.random() * pool.length)]!;
  return c.json({ id: pick, puzzleRating: me?.puzzleRating ?? 1200 });
});

// Record an attempt and adjust the user's puzzle rating.
// We don't need a full Glicko impl; a simple Elo-style update with K=24 is
// fine and matches what users see on most chess sites.
app.post("/puzzles/attempt", authMw, async (c) => {
  const u = c.get("user");
  const body = (await c.req.json()) as {
    puzzleId: string;
    puzzleRating: number;
    solved: boolean;
  };
  if (
    !body.puzzleId ||
    typeof body.puzzleRating !== "number" ||
    typeof body.solved !== "boolean"
  ) {
    return c.json({ error: "bad_input" }, 400);
  }
  const db = getDb(c.env.DB);
  const me = await db.query.users.findFirst({
    where: eq(schema.users.clerkId, u.clerkId),
  });
  if (!me) return c.json({ error: "user_missing" }, 500);
  const before = me.puzzleRating;
  const expected =
    1 / (1 + Math.pow(10, (body.puzzleRating - before) / 400));
  const score = body.solved ? 1 : 0;
  const after = Math.round(before + 24 * (score - expected));
  // Idempotent: if we already have this attempt, don't double-apply.
  const existing = await db.query.puzzleAttempts.findFirst({
    where: and(
      eq(schema.puzzleAttempts.userId, u.clerkId),
      eq(schema.puzzleAttempts.puzzleId, body.puzzleId)
    ),
  });
  if (existing) {
    return c.json({
      ratingBefore: existing.ratingBefore,
      ratingAfter: existing.ratingAfter,
      duplicate: true,
    });
  }
  await db.batch([
    db.insert(schema.puzzleAttempts).values({
      userId: u.clerkId,
      puzzleId: body.puzzleId,
      solved: body.solved ? 1 : 0,
      ratingBefore: before,
      ratingAfter: after,
      attemptedAt: Date.now(),
    }),
    db
      .update(schema.users)
      .set({
        puzzleRating: after,
        puzzlesSolved: body.solved
          ? me.puzzlesSolved + 1
          : me.puzzlesSolved,
        puzzlesFailed: body.solved
          ? me.puzzlesFailed
          : me.puzzlesFailed + 1,
      })
      .where(eq(schema.users.clerkId, u.clerkId)),
  ]);
  return c.json({ ratingBefore: before, ratingAfter: after, duplicate: false });
});

// Today's session: count of puzzle attempts since local midnight (UTC-ish).
app.get("/me/puzzle-session", authMw, async (c) => {
  const u = c.get("user");
  const db = getDb(c.env.DB);
  const since = startOfDayUtc();
  const rows = await db
    .select({
      solved: schema.puzzleAttempts.solved,
      attemptedAt: schema.puzzleAttempts.attemptedAt,
      ratingAfter: schema.puzzleAttempts.ratingAfter,
      ratingBefore: schema.puzzleAttempts.ratingBefore,
    })
    .from(schema.puzzleAttempts)
    .where(
      and(
        eq(schema.puzzleAttempts.userId, u.clerkId),
        sql`${schema.puzzleAttempts.attemptedAt} >= ${since}`
      )
    )
    .orderBy(desc(schema.puzzleAttempts.attemptedAt));
  const me = await db.query.users.findFirst({
    where: eq(schema.users.clerkId, u.clerkId),
  });
  let solved = 0,
    failed = 0,
    delta = 0;
  for (const r of rows) {
    if (r.solved) solved++;
    else failed++;
    delta += r.ratingAfter - r.ratingBefore;
  }
  return c.json({
    solved,
    failed,
    total: rows.length,
    delta,
    puzzleRating: me?.puzzleRating ?? 1200,
    puzzlesSolved: me?.puzzlesSolved ?? 0,
    puzzlesFailed: me?.puzzlesFailed ?? 0,
  });
});

function startOfDayUtc(now = Date.now()): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

// ------- User profile -------
app.get("/u/:username", async (c) => {
  const username = c.req.param("username");
  const db = getDb(c.env.DB);
  const u = await db.query.users.findFirst({
    where: eq(schema.users.username, username),
  });
  if (!u) return c.json({ error: "not_found" }, 404);

  // We pull a wider window than the home "recent games" call so we can compute
  // an honest activity heatmap and rating sparklines from finished games.
  const HISTORY_LIMIT = 200;
  const allRecent = await db
    .select()
    .from(schema.games)
    .where(or(eq(schema.games.whiteId, u.clerkId), eq(schema.games.blackId, u.clerkId)))
    .orderBy(desc(schema.games.endedAt))
    .limit(HISTORY_LIMIT);

  const recent = allRecent.slice(0, 10);

  // Hydrate opponent usernames for the visible recent block.
  const ids = new Set<string>();
  for (const g of recent) {
    ids.add(g.whiteId);
    ids.add(g.blackId);
  }
  const idArr = Array.from(ids);
  const userRows = idArr.length
    ? await db
        .select({ clerkId: schema.users.clerkId, username: schema.users.username })
        .from(schema.users)
        .where(or(...idArr.map((id) => eq(schema.users.clerkId, id))))
    : [];
  const nameById = new Map(userRows.map((r) => [r.clerkId, r.username]));

  // Aggregate over the full recent window (up to 200 games).
  let wins = 0,
    losses = 0,
    draws = 0;
  let whiteWins = 0,
    whiteDraws = 0,
    whiteLosses = 0,
    whiteGames = 0;
  let blackWins = 0,
    blackDraws = 0,
    blackLosses = 0,
    blackGames = 0;

  // Activity heatmap: 84 days (12 weeks). Map day-bucket → count.
  const DAY_MS = 24 * 60 * 60 * 1000;
  const todayUtc = Math.floor(Date.now() / DAY_MS) * DAY_MS;
  const daySpan = 84;
  const oldestDay = todayUtc - (daySpan - 1) * DAY_MS;
  const heatmap = new Array<number>(daySpan).fill(0);

  // Rating sparkline points per bucket, oldest-first (we'll reverse later).
  const ratingPoints: Record<"bullet" | "blitz" | "rapid", number[]> = {
    bullet: [],
    blitz: [],
    rapid: [],
  };

  for (const g of allRecent) {
    if (!g.endedAt || g.result === "*") continue;
    const isWhite = g.whiteId === u.clerkId;
    const isDraw = g.result === "1/2-1/2";
    const won =
      (g.result === "1-0" && isWhite) || (g.result === "0-1" && !isWhite);

    if (isDraw) draws++;
    else if (won) wins++;
    else losses++;

    if (isWhite) {
      whiteGames++;
      if (isDraw) whiteDraws++;
      else if (won) whiteWins++;
      else whiteLosses++;
    } else {
      blackGames++;
      if (isDraw) blackDraws++;
      else if (won) blackWins++;
      else blackLosses++;
    }

    // Heatmap bucketing.
    if (g.endedAt >= oldestDay) {
      const idx = Math.floor((g.endedAt - oldestDay) / DAY_MS);
      if (idx >= 0 && idx < daySpan) heatmap[idx] = (heatmap[idx] || 0) + 1;
    }

    // Rating sparkline — derived from elo_after on each finished game in this
    // user's bucket. We classify by the timeControl text we stored.
    const tc = resolveTimeControl(g.timeControl);
    const bucket = tc?.bucket ?? bucketFor(g.initialMs, g.incrementMs);
    const sparkBucket: "bullet" | "blitz" | "rapid" =
      bucket === "bullet" ? "bullet" : bucket === "blitz" ? "blitz" : "rapid";
    const after = isWhite ? g.whiteEloAfter : g.blackEloAfter;
    if (after != null) ratingPoints[sparkBucket].push(after);
  }

  // We collected newest→oldest from the DB query; flip per-bucket so the
  // sparkline reads left-to-right in chronological order.
  const sparklines = {
    bullet: ratingPoints.bullet.slice().reverse(),
    blitz: ratingPoints.blitz.slice().reverse(),
    rapid: ratingPoints.rapid.slice().reverse(),
  };

  return c.json({
    user: {
      username: u.username,
      eloBullet: u.eloBullet,
      eloBlitz: u.eloBlitz,
      eloRapid: u.eloRapid,
      gamesPlayed: u.gamesPlayed,
      createdAt: u.createdAt,
    },
    record: { wins, losses, draws },
    byColor: {
      white: { wins: whiteWins, draws: whiteDraws, losses: whiteLosses, games: whiteGames },
      black: { wins: blackWins, draws: blackDraws, losses: blackLosses, games: blackGames },
    },
    activity: {
      days: daySpan,
      oldestDay,
      counts: heatmap,
    },
    sparklines,
    recent: recent.map((g) => ({
      ...g,
      whiteUsername: nameById.get(g.whiteId) || "",
      blackUsername: nameById.get(g.blackId) || "",
    })),
  });
});

app.get("/u/:username/games", async (c) => {
  const username = c.req.param("username");
  const tc = c.req.query("tc");
  const page = Math.max(1, Number(c.req.query("page") || "1"));
  const limit = 20;
  const db = getDb(c.env.DB);
  const u = await db.query.users.findFirst({
    where: eq(schema.users.username, username),
  });
  if (!u) return c.json({ error: "not_found" }, 404);

  const cond = tc
    ? and(
        or(eq(schema.games.whiteId, u.clerkId), eq(schema.games.blackId, u.clerkId)),
        eq(schema.games.timeControl, tc)
      )
    : or(eq(schema.games.whiteId, u.clerkId), eq(schema.games.blackId, u.clerkId));

  const rows = await db
    .select()
    .from(schema.games)
    .where(cond)
    .orderBy(desc(schema.games.endedAt))
    .limit(limit)
    .offset((page - 1) * limit);

  const ids = new Set<string>();
  for (const g of rows) {
    ids.add(g.whiteId);
    ids.add(g.blackId);
  }
  const idArr = Array.from(ids);
  const userRows = idArr.length
    ? await db
        .select({
          clerkId: schema.users.clerkId,
          username: schema.users.username,
          firstName: schema.users.firstName,
        })
        .from(schema.users)
        .where(or(...idArr.map((id) => eq(schema.users.clerkId, id))))
    : [];
  const nameById = new Map(userRows.map((r) => [r.clerkId, r.username]));
  const firstNameById = new Map(userRows.map((r) => [r.clerkId, r.firstName ?? ""]));

  return c.json({
    page,
    limit,
    user: { username: u.username, firstName: u.firstName ?? "" },
    games: rows.map((g) => ({
      ...g,
      whiteUsername: nameById.get(g.whiteId) || "",
      blackUsername: nameById.get(g.blackId) || "",
      whiteFirstName: firstNameById.get(g.whiteId) || "",
      blackFirstName: firstNameById.get(g.blackId) || "",
    })),
  });
});

// ------- Game info -------
app.get("/g/:id", async (c) => {
  const id = c.req.param("id");
  const db = getDb(c.env.DB);
  const g = await db.query.games.findFirst({ where: eq(schema.games.id, id) });
  if (!g) return c.json({ error: "not_found" }, 404);
  const userRows = await db
    .select({ clerkId: schema.users.clerkId, username: schema.users.username })
    .from(schema.users)
    .where(or(eq(schema.users.clerkId, g.whiteId), eq(schema.users.clerkId, g.blackId)));
  const nameById = new Map(userRows.map((r) => [r.clerkId, r.username]));
  return c.json({
    ...g,
    whiteUsername: nameById.get(g.whiteId),
    blackUsername: nameById.get(g.blackId),
  });
});

// ------- Friend invites -------
app.post("/friend/invite", authMw, async (c) => {
  const user = c.get("user");
  const body = (await c.req.json()) as {
    timeControl: string;
    color: "white" | "black" | "random";
  };
  const tc = resolveTimeControl(body.timeControl);
  if (!tc) return c.json({ error: "bad_time_control" }, 400);
  if (!["white", "black", "random"].includes(body.color))
    return c.json({ error: "bad_color" }, 400);

  const code = nanoid(10);
  const db = getDb(c.env.DB);
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24h
  await db.insert(schema.friendInvites).values({
    code,
    inviterId: user.clerkId,
    timeControl: tc.id,
    initialMs: tc.initialMs,
    incrementMs: tc.incrementMs,
    colorPref: body.color,
    expiresAt,
  });
  return c.json({ code, expiresAt });
});

app.get("/friend/:code", async (c) => {
  const code = c.req.param("code");
  const db = getDb(c.env.DB);
  const inv = await db.query.friendInvites.findFirst({
    where: eq(schema.friendInvites.code, code),
  });
  if (!inv) return c.json({ error: "not_found" }, 404);
  return c.json(inv);
});

app.post("/friend/:code/accept", authMw, async (c) => {
  const user = c.get("user");
  const code = c.req.param("code");
  const db = getDb(c.env.DB);
  const inv = await db.query.friendInvites.findFirst({
    where: eq(schema.friendInvites.code, code),
  });
  if (!inv) return c.json({ error: "not_found" }, 404);
  if (inv.usedAt) {
    if (inv.gameId) return c.json({ gameId: inv.gameId, alreadyUsed: true });
    return c.json({ error: "already_used" }, 410);
  }
  if (inv.expiresAt < Date.now()) return c.json({ error: "expired" }, 410);
  if (inv.inviterId === user.clerkId)
    return c.json({ error: "cannot_accept_own" }, 400);

  // Decide colors
  let whiteId: string;
  let blackId: string;
  if (inv.colorPref === "white") {
    whiteId = inv.inviterId;
    blackId = user.clerkId;
  } else if (inv.colorPref === "black") {
    whiteId = user.clerkId;
    blackId = inv.inviterId;
  } else {
    if (Math.random() < 0.5) {
      whiteId = inv.inviterId;
      blackId = user.clerkId;
    } else {
      whiteId = user.clerkId;
      blackId = inv.inviterId;
    }
  }

  // Hydrate users
  const [wu, bu] = await Promise.all([
    db.query.users.findFirst({ where: eq(schema.users.clerkId, whiteId) }),
    db.query.users.findFirst({ where: eq(schema.users.clerkId, blackId) }),
  ]);
  if (!wu || !bu) return c.json({ error: "user_missing" }, 500);
  const bucket = bucketFor(inv.initialMs, inv.incrementMs);
  const eloKey = eloKeyForBucket(bucket);

  const gameId = nanoid(12);
  // Mark invite used (atomically — single row update)
  const updated = await db
    .update(schema.friendInvites)
    .set({ usedAt: Date.now(), gameId })
    .where(and(eq(schema.friendInvites.code, code), isNull(schema.friendInvites.usedAt)))
    .returning();
  // The above where on usedAt = null may not work in all drivers; double-check by re-reading:
  if (updated.length === 0) {
    const fresh = await db.query.friendInvites.findFirst({
      where: eq(schema.friendInvites.code, code),
    });
    if (fresh?.gameId) return c.json({ gameId: fresh.gameId, alreadyUsed: true });
    return c.json({ error: "already_used" }, 410);
  }

  // Spawn GameRoom DO
  const stub = c.env.GAME_ROOM.get(c.env.GAME_ROOM.idFromName(gameId));
  await stub.fetch("https://do/init", {
    method: "POST",
    body: JSON.stringify({
      gameId,
      whiteId,
      blackId,
      whiteUsername: wu.username,
      blackUsername: bu.username,
      whiteElo: wu[eloKey],
      blackElo: bu[eloKey],
      whiteGames: wu.gamesPlayed,
      blackGames: bu.gamesPlayed,
      initialMs: inv.initialMs,
      incrementMs: inv.incrementMs,
      bucket,
    }),
  });

  return c.json({ gameId });
});

// ------- Direct user-to-user challenges -------
//
// A challenge targets a specific user (by username). They get a push notification
// (delivered via `/me/notifications` polling) and can accept/decline. On accept,
// a GameRoom is spawned and the inviter receives a `challenge_accepted`
// notification carrying the new gameId — used to auto-redirect them.

const CHALLENGE_TTL_MS = 10 * 60_000;

app.post("/challenges", authMw, async (c) => {
  const u = c.get("user");
  const body = (await c.req.json()) as {
    toUsername: string;
    timeControl: string;
    color: "white" | "black" | "random";
  };
  const tc = resolveTimeControl(body.timeControl);
  if (!tc) return c.json({ error: "bad_time_control" }, 400);
  if (!["white", "black", "random"].includes(body.color))
    return c.json({ error: "bad_color" }, 400);
  if (!body.toUsername) return c.json({ error: "missing_recipient" }, 400);

  const db = getDb(c.env.DB);
  const target = await db.query.users.findFirst({
    where: eq(schema.users.username, body.toUsername),
  });
  if (!target) return c.json({ error: "user_not_found" }, 404);
  if (target.clerkId === u.clerkId)
    return c.json({ error: "cannot_challenge_self" }, 400);

  // Cancel any prior pending challenge from me to this user — only one in
  // flight at a time so the receiver's UI doesn't pile up duplicates.
  const prior = await db
    .select()
    .from(schema.challenges)
    .where(
      and(
        eq(schema.challenges.fromUserId, u.clerkId),
        eq(schema.challenges.toUserId, target.clerkId),
        eq(schema.challenges.status, "pending")
      )
    );
  if (prior.length > 0) {
    await db
      .update(schema.challenges)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(schema.challenges.fromUserId, u.clerkId),
          eq(schema.challenges.toUserId, target.clerkId),
          eq(schema.challenges.status, "pending")
        )
      );
  }

  const now = Date.now();
  const id = nanoid(14);
  await db.insert(schema.challenges).values({
    id,
    fromUserId: u.clerkId,
    toUserId: target.clerkId,
    timeControl: tc.id,
    initialMs: tc.initialMs,
    incrementMs: tc.incrementMs,
    colorPref: body.color,
    status: "pending",
    createdAt: now,
    expiresAt: now + CHALLENGE_TTL_MS,
  });

  await pushNotification(db, target.clerkId, "challenge_received", {
    challengeId: id,
    fromUsername: u.username,
    toUsername: target.username,
    timeControl: tc.id,
  });

  return c.json({
    id,
    expiresAt: now + CHALLENGE_TTL_MS,
    timeControl: tc.id,
  });
});

app.get("/me/challenges/incoming", authMw, async (c) => {
  const u = c.get("user");
  const db = getDb(c.env.DB);
  // Auto-expire stale ones first.
  await db
    .update(schema.challenges)
    .set({ status: "expired" })
    .where(
      and(
        eq(schema.challenges.toUserId, u.clerkId),
        eq(schema.challenges.status, "pending"),
        sql`${schema.challenges.expiresAt} < ${Date.now()}`
      )
    );
  const rows = await db
    .select()
    .from(schema.challenges)
    .where(
      and(
        eq(schema.challenges.toUserId, u.clerkId),
        eq(schema.challenges.status, "pending")
      )
    )
    .orderBy(desc(schema.challenges.createdAt))
    .limit(20);
  const fromIds = Array.from(new Set(rows.map((r) => r.fromUserId)));
  const fromRows = fromIds.length
    ? await db
        .select({ clerkId: schema.users.clerkId, username: schema.users.username })
        .from(schema.users)
        .where(inArray(schema.users.clerkId, fromIds))
    : [];
  const nameById = new Map(fromRows.map((r) => [r.clerkId, r.username]));
  return c.json({
    challenges: rows.map((r) => ({
      ...r,
      fromUsername: nameById.get(r.fromUserId) || "",
      toUsername: u.username,
    })),
  });
});

app.get("/me/challenges/outgoing", authMw, async (c) => {
  const u = c.get("user");
  const db = getDb(c.env.DB);
  await db
    .update(schema.challenges)
    .set({ status: "expired" })
    .where(
      and(
        eq(schema.challenges.fromUserId, u.clerkId),
        eq(schema.challenges.status, "pending"),
        sql`${schema.challenges.expiresAt} < ${Date.now()}`
      )
    );
  const rows = await db
    .select()
    .from(schema.challenges)
    .where(
      and(
        eq(schema.challenges.fromUserId, u.clerkId),
        // Show pending + recently-resolved (for sender's "accepted" auto-redirect).
        or(
          eq(schema.challenges.status, "pending"),
          and(
            inArray(schema.challenges.status, ["accepted", "declined", "cancelled"]),
            sql`${schema.challenges.createdAt} > ${Date.now() - 30 * 60_000}`
          )
        )
      )
    )
    .orderBy(desc(schema.challenges.createdAt))
    .limit(20);
  const toIds = Array.from(new Set(rows.map((r) => r.toUserId)));
  const toRows = toIds.length
    ? await db
        .select({ clerkId: schema.users.clerkId, username: schema.users.username })
        .from(schema.users)
        .where(inArray(schema.users.clerkId, toIds))
    : [];
  const nameById = new Map(toRows.map((r) => [r.clerkId, r.username]));
  return c.json({
    challenges: rows.map((r) => ({
      ...r,
      fromUsername: u.username,
      toUsername: nameById.get(r.toUserId) || "",
    })),
  });
});

app.get("/challenges/:id", authMw, async (c) => {
  const u = c.get("user");
  const id = c.req.param("id");
  const db = getDb(c.env.DB);
  const ch = await db.query.challenges.findFirst({
    where: eq(schema.challenges.id, id),
  });
  if (!ch) return c.json({ error: "not_found" }, 404);
  if (ch.fromUserId !== u.clerkId && ch.toUserId !== u.clerkId)
    return c.json({ error: "not_yours" }, 403);
  const [from, to] = await Promise.all([
    db.query.users.findFirst({ where: eq(schema.users.clerkId, ch.fromUserId) }),
    db.query.users.findFirst({ where: eq(schema.users.clerkId, ch.toUserId) }),
  ]);
  return c.json({
    ...ch,
    fromUsername: from?.username || "",
    toUsername: to?.username || "",
  });
});

app.post("/challenges/:id/accept", authMw, async (c) => {
  const u = c.get("user");
  const id = c.req.param("id");
  const db = getDb(c.env.DB);
  const ch = await db.query.challenges.findFirst({
    where: eq(schema.challenges.id, id),
  });
  if (!ch) return c.json({ error: "not_found" }, 404);
  if (ch.toUserId !== u.clerkId) return c.json({ error: "not_recipient" }, 403);
  if (ch.status !== "pending") {
    if (ch.status === "accepted" && ch.gameId)
      return c.json({ gameId: ch.gameId, alreadyAccepted: true });
    return c.json({ error: ch.status }, 410);
  }
  if (ch.expiresAt < Date.now()) {
    await db
      .update(schema.challenges)
      .set({ status: "expired" })
      .where(eq(schema.challenges.id, id));
    return c.json({ error: "expired" }, 410);
  }

  // Decide colors based on inviter's preference.
  let whiteId: string;
  let blackId: string;
  if (ch.colorPref === "white") {
    whiteId = ch.fromUserId;
    blackId = ch.toUserId;
  } else if (ch.colorPref === "black") {
    whiteId = ch.toUserId;
    blackId = ch.fromUserId;
  } else if (Math.random() < 0.5) {
    whiteId = ch.fromUserId;
    blackId = ch.toUserId;
  } else {
    whiteId = ch.toUserId;
    blackId = ch.fromUserId;
  }

  const [wu, bu] = await Promise.all([
    db.query.users.findFirst({ where: eq(schema.users.clerkId, whiteId) }),
    db.query.users.findFirst({ where: eq(schema.users.clerkId, blackId) }),
  ]);
  if (!wu || !bu) return c.json({ error: "user_missing" }, 500);

  const bucket = bucketFor(ch.initialMs, ch.incrementMs);
  const eloKey = eloKeyForBucket(bucket);
  const gameId = nanoid(12);

  // Atomically claim the challenge.
  const claimed = await db
    .update(schema.challenges)
    .set({ status: "accepted", gameId })
    .where(
      and(eq(schema.challenges.id, id), eq(schema.challenges.status, "pending"))
    )
    .returning();
  if (claimed.length === 0) {
    const fresh = await db.query.challenges.findFirst({
      where: eq(schema.challenges.id, id),
    });
    if (fresh?.gameId) return c.json({ gameId: fresh.gameId, alreadyAccepted: true });
    return c.json({ error: "race" }, 409);
  }

  // Spawn GameRoom DO.
  const stub = c.env.GAME_ROOM.get(c.env.GAME_ROOM.idFromName(gameId));
  await stub.fetch("https://do/init", {
    method: "POST",
    body: JSON.stringify({
      gameId,
      whiteId,
      blackId,
      whiteUsername: wu.username,
      blackUsername: bu.username,
      whiteElo: wu[eloKey],
      blackElo: bu[eloKey],
      whiteGames: wu.gamesPlayed,
      blackGames: bu.gamesPlayed,
      initialMs: ch.initialMs,
      incrementMs: ch.incrementMs,
      bucket,
    }),
  });

  // Notify the original sender so they can auto-redirect.
  await pushNotification(db, ch.fromUserId, "challenge_accepted", {
    challengeId: id,
    fromUsername: wu.username, // sender's POV
    toUsername: bu.username,
    timeControl: ch.timeControl,
    gameId,
  });

  return c.json({ gameId });
});

app.post("/challenges/:id/decline", authMw, async (c) => {
  const u = c.get("user");
  const id = c.req.param("id");
  const db = getDb(c.env.DB);
  const ch = await db.query.challenges.findFirst({
    where: eq(schema.challenges.id, id),
  });
  if (!ch) return c.json({ error: "not_found" }, 404);
  if (ch.toUserId !== u.clerkId) return c.json({ error: "not_recipient" }, 403);
  if (ch.status !== "pending") return c.json({ ok: true, noop: true });
  await db
    .update(schema.challenges)
    .set({ status: "declined" })
    .where(eq(schema.challenges.id, id));
  // Hydrate sender + recipient names for the notification payload.
  const fromUser = await db.query.users.findFirst({
    where: eq(schema.users.clerkId, ch.fromUserId),
  });
  await pushNotification(db, ch.fromUserId, "challenge_declined", {
    challengeId: id,
    fromUsername: fromUser?.username || "",
    toUsername: u.username,
    timeControl: ch.timeControl,
  });
  return c.json({ ok: true });
});

app.post("/challenges/:id/cancel", authMw, async (c) => {
  const u = c.get("user");
  const id = c.req.param("id");
  const db = getDb(c.env.DB);
  const ch = await db.query.challenges.findFirst({
    where: eq(schema.challenges.id, id),
  });
  if (!ch) return c.json({ error: "not_found" }, 404);
  if (ch.fromUserId !== u.clerkId) return c.json({ error: "not_sender" }, 403);
  if (ch.status !== "pending") return c.json({ ok: true, noop: true });
  await db
    .update(schema.challenges)
    .set({ status: "cancelled" })
    .where(eq(schema.challenges.id, id));
  // Tell the recipient the challenge went away so their inbox can clear it.
  await pushNotification(db, ch.toUserId, "challenge_cancelled", {
    challengeId: id,
    fromUsername: u.username,
    toUsername: "",
    timeControl: ch.timeControl,
  });
  return c.json({ ok: true });
});

// ------- Notifications -------

app.get("/me/notifications", authMw, async (c) => {
  const u = c.get("user");
  const db = getDb(c.env.DB);
  const sinceParam = Number(c.req.query("since") || "0");
  const limit = Math.min(50, Math.max(1, Number(c.req.query("limit") || "20")));
  const cond =
    sinceParam > 0
      ? and(
          eq(schema.notifications.userId, u.clerkId),
          sql`${schema.notifications.createdAt} > ${sinceParam}`
        )
      : eq(schema.notifications.userId, u.clerkId);
  const rows = await db
    .select()
    .from(schema.notifications)
    .where(cond)
    .orderBy(desc(schema.notifications.createdAt))
    .limit(limit);
  // Decode payload for clients.
  const items = rows.map((r) => {
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(r.payload);
    } catch {
      // ignore — leave empty
    }
    return {
      id: r.id,
      kind: r.kind,
      payload: parsed,
      readAt: r.readAt,
      createdAt: r.createdAt,
    };
  });
  // Compute unread count (independent of since) so the bell badge stays right.
  const unreadRows = await db
    .select({ id: schema.notifications.id })
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.userId, u.clerkId),
        isNull(schema.notifications.readAt)
      )
    );
  return c.json({ items, unread: unreadRows.length });
});

app.post("/me/notifications/read-all", authMw, async (c) => {
  const u = c.get("user");
  const db = getDb(c.env.DB);
  await db
    .update(schema.notifications)
    .set({ readAt: Date.now() })
    .where(
      and(
        eq(schema.notifications.userId, u.clerkId),
        isNull(schema.notifications.readAt)
      )
    );
  return c.json({ ok: true });
});

app.post("/me/notifications/:id/read", authMw, async (c) => {
  const u = c.get("user");
  const id = c.req.param("id");
  const db = getDb(c.env.DB);
  await db
    .update(schema.notifications)
    .set({ readAt: Date.now() })
    .where(
      and(
        eq(schema.notifications.id, id),
        eq(schema.notifications.userId, u.clerkId)
      )
    );
  return c.json({ ok: true });
});

// Forward the WS upgrade headers we care about. The bearer subprotocol must
// pass through so the DO can echo it back in the 101 response.
function wsForwardHeaders(c: any): Record<string, string> {
  const headers: Record<string, string> = { Upgrade: "websocket" };
  const proto = c.req.header("Sec-WebSocket-Protocol");
  if (proto) headers["Sec-WebSocket-Protocol"] = proto;
  return headers;
}

// ------- WebSocket: matchmaking -------
app.get("/ws/queue", async (c) => {
  const upgrade = c.req.header("Upgrade");
  if (upgrade !== "websocket") return c.text("upgrade required", 426);
  const token = bearerToken(c.req.raw);
  const payload = token ? await verifySessionToken(c.env, token) : null;
  if (!payload) return c.text("unauthorized", 401);

  const tcId = c.req.query("tc") || "";
  const tc = resolveTimeControl(tcId);
  if (!tc) return c.text("bad time control", 400);

  // Hydrate user (lazy create)
  const user = await authenticate(c.env, token);
  if (!user) return c.text("unauthorized", 401);
  const db = getDb(c.env.DB);
  const u = await db.query.users.findFirst({
    where: eq(schema.users.clerkId, user.clerkId),
  });
  if (!u) return c.text("user missing", 500);
  const elo = u[eloKeyForBucket(tc.bucket)];

  // Route to bucket DO
  const id = c.env.MATCHMAKING.idFromName(tc.bucket);
  const stub = c.env.MATCHMAKING.get(id);

  const url = new URL("https://do/ws");
  url.searchParams.set("uid", user.clerkId);
  url.searchParams.set("u", user.username);
  url.searchParams.set("elo", String(elo));
  url.searchParams.set("tc", tc.id);
  url.searchParams.set("im", String(tc.initialMs));
  url.searchParams.set("inc", String(tc.incrementMs));
  return stub.fetch(url.toString(), { headers: wsForwardHeaders(c) });
});

// ------- WebSocket: in-game -------
app.get("/ws/game/:id", async (c) => {
  const upgrade = c.req.header("Upgrade");
  if (upgrade !== "websocket") return c.text("upgrade required", 426);
  const token = bearerToken(c.req.raw);
  // Spectators allowed if no token, but with empty user id (read-only).
  // If a token is provided but invalid, reject loudly — silently demoting an
  // authed player to spectator detaches their player slot in the GameRoom and
  // can result in an abandonment loss after the disconnect grace period.
  let userId = `spec_${Math.random().toString(36).slice(2, 10)}`;
  let username = "spectator";
  if (token) {
    const user = await authenticate(c.env, token);
    if (!user) return c.text("unauthorized", 401);
    userId = user.clerkId;
    username = user.username;
  }

  const gameId = c.req.param("id");
  const id = c.env.GAME_ROOM.idFromName(gameId);
  const stub = c.env.GAME_ROOM.get(id);
  const url = new URL("https://do/ws");
  url.searchParams.set("uid", userId);
  url.searchParams.set("u", username);
  return stub.fetch(url.toString(), { headers: wsForwardHeaders(c) });
});

export default app;
