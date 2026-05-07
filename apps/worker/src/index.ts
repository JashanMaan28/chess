import { Hono } from "hono";
import { cors } from "hono/cors";
import { nanoid } from "nanoid";
import { eq, desc, and, or, isNull } from "drizzle-orm";
import type { Env } from "./env";
import { authenticate, bearerToken, verifySessionToken } from "./auth";
import { getDb, schema } from "./db/client";
import {
  TIME_CONTROL_BY_ID,
  bucketFor,
  type TimeControlBucket,
} from "@chess/shared/time-controls";

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

// ------- User profile -------
app.get("/u/:username", async (c) => {
  const username = c.req.param("username");
  const db = getDb(c.env.DB);
  const u = await db.query.users.findFirst({
    where: eq(schema.users.username, username),
  });
  if (!u) return c.json({ error: "not_found" }, 404);

  const recent = await db
    .select()
    .from(schema.games)
    .where(or(eq(schema.games.whiteId, u.clerkId), eq(schema.games.blackId, u.clerkId)))
    .orderBy(desc(schema.games.endedAt))
    .limit(10);

  // Hydrate opponent usernames
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

  let wins = 0,
    losses = 0,
    draws = 0;
  for (const g of recent) {
    if (!g.endedAt || g.result === "*") continue;
    const isWhite = g.whiteId === u.clerkId;
    if (g.result === "1/2-1/2") draws++;
    else if ((g.result === "1-0" && isWhite) || (g.result === "0-1" && !isWhite)) wins++;
    else losses++;
  }

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
        .select({ clerkId: schema.users.clerkId, username: schema.users.username })
        .from(schema.users)
        .where(or(...idArr.map((id) => eq(schema.users.clerkId, id))))
    : [];
  const nameById = new Map(userRows.map((r) => [r.clerkId, r.username]));

  return c.json({
    page,
    limit,
    games: rows.map((g) => ({
      ...g,
      whiteUsername: nameById.get(g.whiteId) || "",
      blackUsername: nameById.get(g.blackId) || "",
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
  const tc = TIME_CONTROL_BY_ID[body.timeControl];
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
  const eloKey = bucket === "bullet" ? "eloBullet" : bucket === "blitz" ? "eloBlitz" : "eloRapid";

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

// ------- WebSocket: matchmaking -------
app.get("/ws/queue", async (c) => {
  const upgrade = c.req.header("Upgrade");
  if (upgrade !== "websocket") return c.text("upgrade required", 426);
  const token = bearerToken(c.req.raw);
  const payload = token ? await verifySessionToken(c.env, token) : null;
  if (!payload) return c.text("unauthorized", 401);

  const tcId = c.req.query("tc") || "";
  const tc = TIME_CONTROL_BY_ID[tcId];
  if (!tc) return c.text("bad time control", 400);

  // Hydrate user (lazy create)
  const user = await authenticate(c.env, token);
  if (!user) return c.text("unauthorized", 401);
  const db = getDb(c.env.DB);
  const u = await db.query.users.findFirst({
    where: eq(schema.users.clerkId, user.clerkId),
  });
  if (!u) return c.text("user missing", 500);
  const elo = tc.bucket === "bullet" ? u.eloBullet : tc.bucket === "blitz" ? u.eloBlitz : u.eloRapid;

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
  return stub.fetch(url.toString(), {
    headers: { Upgrade: "websocket" },
  });
});

// ------- WebSocket: in-game -------
app.get("/ws/game/:id", async (c) => {
  const upgrade = c.req.header("Upgrade");
  if (upgrade !== "websocket") return c.text("upgrade required", 426);
  const token = bearerToken(c.req.raw);
  // Spectators allowed if no token, but with empty user id (read-only)
  let userId = `spec_${Math.random().toString(36).slice(2, 10)}`;
  let username = "spectator";
  if (token) {
    const user = await authenticate(c.env, token);
    if (user) {
      userId = user.clerkId;
      username = user.username;
    }
  }

  const gameId = c.req.param("id");
  const id = c.env.GAME_ROOM.idFromName(gameId);
  const stub = c.env.GAME_ROOM.get(id);
  const url = new URL("https://do/ws");
  url.searchParams.set("uid", userId);
  url.searchParams.set("u", username);
  return stub.fetch(url.toString(), { headers: { Upgrade: "websocket" } });
});

export default app;
