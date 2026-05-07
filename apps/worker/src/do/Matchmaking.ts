import type { Env } from "../env";
import { nanoid } from "nanoid";
import { getDb, schema } from "../db/client";
import { eq } from "drizzle-orm";
import {
  bucketFor,
  type TimeControl,
  type TimeControlBucket,
} from "@chess/shared/time-controls";
import type { ServerMsg } from "@chess/shared/protocol";

type Entry = {
  userId: string;
  username: string;
  elo: number;
  initialMs: number;
  incrementMs: number;
  tcId: string;
  joinedAt: number;
};

const TICK_MS = 2_000;

export class MatchmakingDO implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private bucket: TimeControlBucket | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      const upgrade = req.headers.get("Upgrade");
      if (upgrade !== "websocket") return new Response("upgrade", { status: 426 });

      const userId = url.searchParams.get("uid") || "";
      const username = url.searchParams.get("u") || "";
      const elo = Number(url.searchParams.get("elo") || "1200");
      const tcId = url.searchParams.get("tc") || "";
      const initialMs = Number(url.searchParams.get("im") || "0");
      const incrementMs = Number(url.searchParams.get("inc") || "0");
      if (!userId || !tcId || !initialMs) return new Response("bad", { status: 400 });

      this.bucket = bucketFor(initialMs, incrementMs);

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      const entry: Entry = {
        userId,
        username,
        elo,
        initialMs,
        incrementMs,
        tcId,
        joinedAt: Date.now(),
      };
      this.state.acceptWebSocket(server, [
        `uid:${userId}`,
        `e:${JSON.stringify(entry)}`,
      ]);
      const queueSize = this.state.getWebSockets().length;
      try {
        server.send(JSON.stringify({ t: "queued", size: queueSize } satisfies ServerMsg));
      } catch {
        /* ignore */
      }
      // Try immediate match, otherwise schedule periodic ticks.
      await this.tryPair();
      await this.scheduleTick();
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response("not found", { status: 404 });
  }

  async webSocketMessage(_ws: WebSocket, _msg: string | ArrayBuffer) {
    // No client messages expected once queued.
  }
  async webSocketClose(_ws: WebSocket) {
    // Removal is implicit; getWebSockets() reflects open sockets only.
  }
  async webSocketError(_ws: WebSocket) {
    // ignore
  }

  async alarm() {
    await this.tryPair();
    if (this.state.getWebSockets().length > 0) await this.scheduleTick();
  }

  private async scheduleTick() {
    await this.state.storage.setAlarm(Date.now() + TICK_MS);
  }

  private decode(ws: WebSocket): Entry | null {
    const tags = this.state.getTags(ws);
    const e = tags.find((t) => t.startsWith("e:"))?.slice(2);
    if (!e) return null;
    try {
      return JSON.parse(e) as Entry;
    } catch {
      return null;
    }
  }

  private async tryPair() {
    const sockets = this.state
      .getWebSockets()
      .filter((s) => s.readyState === WebSocket.READY_STATE_OPEN);
    if (sockets.length < 2) return;

    // Group by tcId so we only pair identical time controls.
    const byTc = new Map<string, { ws: WebSocket; e: Entry }[]>();
    for (const ws of sockets) {
      const e = this.decode(ws);
      if (!e) continue;
      const arr = byTc.get(e.tcId) || [];
      arr.push({ ws, e });
      byTc.set(e.tcId, arr);
    }

    const now = Date.now();
    for (const [, group] of byTc) {
      if (group.length < 2) continue;
      // Sort by elo
      group.sort((a, b) => a.e.elo - b.e.elo);

      const used = new Set<number>();
      for (let i = 0; i < group.length; i++) {
        if (used.has(i)) continue;
        const a = group[i]!;
        const waited = now - a.e.joinedAt;
        const window = waitWindow(waited);
        let matchIdx = -1;
        for (let j = i + 1; j < group.length; j++) {
          if (used.has(j)) continue;
          const b = group[j]!;
          const diff = Math.abs(a.e.elo - b.e.elo);
          if (diff <= window) {
            matchIdx = j;
            break;
          }
        }
        if (matchIdx === -1) continue;
        used.add(i);
        used.add(matchIdx);
        const b = group[matchIdx]!;
        await this.pair(a, b);
      }
    }
  }

  private async pair(
    a: { ws: WebSocket; e: Entry },
    b: { ws: WebSocket; e: Entry }
  ) {
    // Random color assignment
    const aIsWhite = Math.random() < 0.5;
    const white = aIsWhite ? a : b;
    const black = aIsWhite ? b : a;
    const gameId = nanoid(12);

    // Hydrate both users from D1 to get current elo + games.
    const db = getDb(this.env.DB);
    const [wu, bu] = await Promise.all([
      db.query.users.findFirst({ where: eq(schema.users.clerkId, white.e.userId) }),
      db.query.users.findFirst({ where: eq(schema.users.clerkId, black.e.userId) }),
    ]);
    const bucket = bucketFor(a.e.initialMs, a.e.incrementMs);
    const wElo = wu
      ? bucket === "bullet"
        ? wu.eloBullet
        : bucket === "blitz"
          ? wu.eloBlitz
          : wu.eloRapid
      : white.e.elo;
    const bElo = bu
      ? bucket === "bullet"
        ? bu.eloBullet
        : bucket === "blitz"
          ? bu.eloBlitz
          : bu.eloRapid
      : black.e.elo;

    const id = this.env.GAME_ROOM.idFromName(gameId);
    const stub = this.env.GAME_ROOM.get(id);
    await stub.fetch("https://do/init", {
      method: "POST",
      body: JSON.stringify({
        gameId,
        whiteId: white.e.userId,
        blackId: black.e.userId,
        whiteUsername: wu?.username || white.e.username,
        blackUsername: bu?.username || black.e.username,
        whiteElo: wElo,
        blackElo: bElo,
        whiteGames: wu?.gamesPlayed ?? 0,
        blackGames: bu?.gamesPlayed ?? 0,
        initialMs: a.e.initialMs,
        incrementMs: a.e.incrementMs,
        bucket,
      }),
    });

    const send = (ws: WebSocket, msg: ServerMsg) => {
      try {
        ws.send(JSON.stringify(msg));
      } catch {
        /* ignore */
      }
    };
    send(white.ws, { t: "matched", gameId, color: "w" });
    send(black.ws, { t: "matched", gameId, color: "b" });
    try {
      white.ws.close(1000, "matched");
      black.ws.close(1000, "matched");
    } catch {
      /* ignore */
    }
  }
}

function waitWindow(waitedMs: number): number {
  if (waitedMs < 5_000) return 50;
  if (waitedMs < 10_000) return 100;
  if (waitedMs < 15_000) return 200;
  if (waitedMs < 20_000) return 500;
  return 10_000; // effectively any
}
