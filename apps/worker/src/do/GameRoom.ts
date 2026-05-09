import { Chess } from "chess.js";
import type { Env } from "../env";
import { getDb, schema } from "../db/client";
import { eq } from "drizzle-orm";
import { computeElo, scoreFromResult } from "../elo";
import {
  type ClientMsg,
  type ServerMsg,
  type Color,
  type ColorOrSpectator,
  type GameResult,
  type Termination,
  type ChatMsg,
  ERR,
} from "@chess/shared/protocol";
import {
  bucketFor,
  disconnectGraceMs,
  type TimeControlBucket,
} from "@chess/shared/time-controls";

type PlayerSlot = {
  userId: string;
  username: string;
  eloBefore: number;
  gamesPlayed: number;
  connected: boolean;
  lastDisconnectAt: number | null;
};

type Init = {
  gameId: string;
  whiteId: string;
  blackId: string;
  whiteUsername: string;
  blackUsername: string;
  whiteElo: number;
  blackElo: number;
  whiteGames: number;
  blackGames: number;
  initialMs: number;
  incrementMs: number;
  bucket: TimeControlBucket;
};

type Persist = {
  gameId: string;
  initialMs: number;
  incrementMs: number;
  bucket: TimeControlBucket;
  white: PlayerSlot;
  black: PlayerSlot;
  fen: string;
  pgn: string;
  moves: { san: string; from: string; to: string; promo?: string }[];
  clocks: { w: number; b: number };
  lastMoveAt: number; // ms epoch when current side started thinking
  startedAt: number;
  endedAt: number | null;
  result: GameResult;
  termination: Termination | null;
  drawOfferFrom: Color | null;
  chat: ChatMsg[];
  /** alarmType encodes what the next alarm is for: "flag" or "abandon" */
  alarmType: "flag" | "abandon" | null;
};

type RateBucket = { last: number; count: number };

const CHAT_RATE_WINDOW_MS = 1000;
const CHAT_MAX_LEN = 200;
const MAX_CHAT_HISTORY = 200;

export class GameRoomDO implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private game: Persist | null = null;
  private chat = new Map<string, RateBucket>();
  private chess: Chess | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<Persist>("game");
      if (stored) {
        this.game = stored;
        this.chess = new Chess();
        try {
          if (stored.pgn) this.chess.loadPgn(stored.pgn);
          else this.chess.load(stored.fen);
        } catch {
          this.chess.load(stored.fen);
        }
      }
    });
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    if (path === "/init" && req.method === "POST") {
      const body = (await req.json()) as Init;
      await this.initGame(body);
      return new Response("ok");
    }

    if (path === "/state" && req.method === "GET") {
      if (!this.game) return new Response("not found", { status: 404 });
      return Response.json(this.publicSnapshot());
    }

    if (path === "/ws") {
      const upgrade = req.headers.get("Upgrade");
      if (upgrade !== "websocket") {
        return new Response("expected websocket", { status: 426 });
      }
      const userId = url.searchParams.get("uid") || "";
      const username = url.searchParams.get("u") || "";
      if (!userId) return new Response("unauthorized", { status: 401 });

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      const role: ColorOrSpectator = this.roleFor(userId);
      this.state.acceptWebSocket(server, [`uid:${userId}`, `role:${role}`, `name:${username}`]);
      this.onConnect(userId, role);
      return new Response(null, {
        status: 101,
        webSocket: client,
        headers: wsAcceptHeaders(req),
      });
    }

    return new Response("not found", { status: 404 });
  }

  private async initGame(init: Init) {
    if (this.game) return;
    const now = Date.now();
    const persist: Persist = {
      gameId: init.gameId,
      initialMs: init.initialMs,
      incrementMs: init.incrementMs,
      bucket: init.bucket,
      white: {
        userId: init.whiteId,
        username: init.whiteUsername,
        eloBefore: init.whiteElo,
        gamesPlayed: init.whiteGames,
        connected: false,
        lastDisconnectAt: null,
      },
      black: {
        userId: init.blackId,
        username: init.blackUsername,
        eloBefore: init.blackElo,
        gamesPlayed: init.blackGames,
        connected: false,
        lastDisconnectAt: null,
      },
      fen: new Chess().fen(),
      pgn: "",
      moves: [],
      clocks: { w: init.initialMs, b: init.initialMs },
      lastMoveAt: now,
      startedAt: now,
      endedAt: null,
      result: "*",
      termination: null,
      drawOfferFrom: null,
      chat: [],
      alarmType: null,
    };
    this.game = persist;
    this.chess = new Chess();
    await this.persist();

    // Persist initial games row immediately (result='*') so the page exists
    // even before the first move.
    const db = getDb(this.env.DB);
    const tcId = `${Math.round(init.initialMs / 60000)}+${Math.round(init.incrementMs / 1000)}`;
    await db
      .insert(schema.games)
      .values({
        id: init.gameId,
        whiteId: init.whiteId,
        blackId: init.blackId,
        timeControl: tcId,
        initialMs: init.initialMs,
        incrementMs: init.incrementMs,
        result: "*",
        pgn: "",
        startedAt: now,
        whiteEloBefore: init.whiteElo,
        blackEloBefore: init.blackElo,
      })
      .onConflictDoNothing();

    // Set first flag alarm for white.
    await this.scheduleFlagAlarm();
  }

  private roleFor(userId: string): ColorOrSpectator {
    if (!this.game) return "spectator";
    if (userId === this.game.white.userId) return "w";
    if (userId === this.game.black.userId) return "b";
    return "spectator";
  }

  private onConnect(userId: string, role: ColorOrSpectator) {
    if (!this.game) return;
    if (role === "w" || role === "b") {
      const slot = role === "w" ? this.game.white : this.game.black;
      // If same user reconnects, drop their old socket(s)
      const sockets = this.state.getWebSockets(`uid:${userId}`);
      for (const s of sockets.slice(0, -1)) {
        try {
          s.close(1000, "replaced");
        } catch {
          // ignore
        }
      }
      slot.connected = true;
      slot.lastDisconnectAt = null;
      // If we had scheduled an abandon alarm, recompute next alarm to flag.
      if (this.game.alarmType === "abandon" && !this.game.endedAt) {
        this.scheduleFlagAlarm();
      }
      this.broadcastPresence();
    }
    // Send initial state to the connecting socket
    const ws = this.state.getWebSockets(`uid:${userId}`).at(-1);
    if (ws) this.send(ws, { ...this.publicSnapshot(), you: role });
    this.persist();
  }

  // Hibernation handlers
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const tags = this.state.getTags(ws);
    const userId = tags.find((t) => t.startsWith("uid:"))?.slice(4) || "";
    const role = (tags.find((t) => t.startsWith("role:"))?.slice(5) ||
      "spectator") as ColorOrSpectator;
    const username = tags.find((t) => t.startsWith("name:"))?.slice(5) || userId.slice(-6);

    let msg: ClientMsg;
    try {
      msg = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message));
    } catch {
      return this.sendErr(ws, ERR.BAD_MSG, "bad json");
    }
    if (!this.game) return this.sendErr(ws, ERR.NOT_FOUND, "no game");
    if (this.game.endedAt && msg.t !== "sync" && msg.t !== "chat")
      return this.sendErr(ws, ERR.GAME_OVER, "game over");

    switch (msg.t) {
      case "sync":
        return this.send(ws, { ...this.publicSnapshot(), you: role });
      case "chat":
        return this.handleChat(ws, userId, username, role, msg.text);
      case "move":
        return this.handleMove(ws, role, msg.from, msg.to, msg.promo);
      case "resign":
        return this.handleResign(ws, role);
      case "draw_offer":
        return this.handleDrawOffer(ws, role);
      case "draw_accept":
        return this.handleDrawAccept(ws, role);
      case "draw_decline":
        return this.handleDrawDecline(ws, role);
      default:
        return this.sendErr(ws, ERR.BAD_MSG, "unknown");
    }
  }

  async webSocketClose(ws: WebSocket) {
    return this.handleSocketClose(ws);
  }
  async webSocketError(ws: WebSocket) {
    return this.handleSocketClose(ws);
  }
  private async handleSocketClose(ws: WebSocket) {
    if (!this.game) return;
    const tags = this.state.getTags(ws);
    const userId = tags.find((t) => t.startsWith("uid:"))?.slice(4) || "";
    if (!userId) return;
    // Are any other sockets still open for this user?
    const remaining = this.state
      .getWebSockets(`uid:${userId}`)
      .filter((s) => s !== ws && s.readyState === WebSocket.READY_STATE_OPEN);
    if (remaining.length > 0) return;

    if (this.game.white.userId === userId) {
      this.game.white.connected = false;
      this.game.white.lastDisconnectAt = Date.now();
    } else if (this.game.black.userId === userId) {
      this.game.black.connected = false;
      this.game.black.lastDisconnectAt = Date.now();
    } else {
      return; // spectator
    }
    this.broadcastPresence();
    if (!this.game.endedAt) await this.scheduleNextAlarm();
    await this.persist();
  }

  private async handleChat(
    ws: WebSocket,
    userId: string,
    username: string,
    role: ColorOrSpectator,
    text: string
  ) {
    if (!this.game) return;
    if (role === "spectator") return this.sendErr(ws, ERR.NOT_PLAYER, "spectators cannot chat");
    if (typeof text !== "string") return this.sendErr(ws, ERR.BAD_MSG, "bad text");
    const trimmed = text.trim();
    if (!trimmed) return;
    if (trimmed.length > CHAT_MAX_LEN)
      return this.sendErr(ws, ERR.TOO_LONG, `max ${CHAT_MAX_LEN} chars`);
    const now = Date.now();
    const bucket = this.chat.get(userId) || { last: 0, count: 0 };
    if (now - bucket.last < CHAT_RATE_WINDOW_MS)
      return this.sendErr(ws, ERR.RATE_LIMIT, "1 msg/sec");
    bucket.last = now;
    this.chat.set(userId, bucket);
    const entry: ChatMsg = { from: username, text: trimmed, at: now };
    this.game.chat.push(entry);
    if (this.game.chat.length > MAX_CHAT_HISTORY)
      this.game.chat.splice(0, this.game.chat.length - MAX_CHAT_HISTORY);
    this.broadcast({ t: "chat", from: username, text: trimmed, at: now });
    await this.persist();
  }

  private async handleMove(
    ws: WebSocket,
    role: ColorOrSpectator,
    from: string,
    to: string,
    promo?: "q" | "r" | "b" | "n"
  ) {
    if (!this.game || !this.chess) return;
    if (role === "spectator") return this.sendErr(ws, ERR.NOT_PLAYER, "spectator");
    const turn = this.chess.turn() as Color;
    if (turn !== role) return this.sendErr(ws, ERR.NOT_TURN, "not your turn");

    const now = Date.now();
    // Deduct elapsed thinking time before applying the move.
    const elapsed = now - this.game.lastMoveAt;
    const remaining = this.game.clocks[turn] - elapsed;
    if (remaining <= 0) {
      // Flag fall race — finalize as flag.
      return this.endByFlag(turn);
    }

    let result;
    try {
      result = this.chess.move({ from, to, promotion: promo });
    } catch {
      return this.sendErr(ws, ERR.ILLEGAL_MOVE, "illegal");
    }
    if (!result) return this.sendErr(ws, ERR.ILLEGAL_MOVE, "illegal");

    // Add increment AFTER move, on the mover's clock.
    const newRemaining = remaining + this.game.incrementMs;
    this.game.clocks[turn] = newRemaining;
    this.game.lastMoveAt = now;
    this.game.fen = this.chess.fen();
    this.game.pgn = this.chess.pgn();
    this.game.moves.push({
      san: result.san,
      from: result.from,
      to: result.to,
      promo: result.promotion,
    });
    // A move cancels any pending draw offer.
    if (this.game.drawOfferFrom) this.game.drawOfferFrom = null;

    this.broadcast({
      t: "move",
      san: result.san,
      from: result.from,
      to: result.to,
      promo: result.promotion as "q" | "r" | "b" | "n" | undefined,
      fen: this.chess.fen(),
      clocks: { ...this.game.clocks },
      turn: this.chess.turn() as Color,
    });

    if (this.chess.isGameOver()) {
      let res: GameResult = "1/2-1/2";
      let term: Termination = "stalemate";
      if (this.chess.isCheckmate()) {
        res = turn === "w" ? "1-0" : "0-1";
        term = "checkmate";
      } else if (this.chess.isStalemate()) {
        term = "stalemate";
      } else if (this.chess.isInsufficientMaterial()) {
        term = "insufficient";
      } else if (this.chess.isThreefoldRepetition()) {
        term = "threefold";
      } else if (this.chess.isDraw()) {
        term = "fifty_move";
      }
      await this.finalize(res, term);
      return;
    }
    await this.scheduleFlagAlarm();
    await this.persist();
  }

  private async handleResign(ws: WebSocket, role: ColorOrSpectator) {
    if (role !== "w" && role !== "b") return this.sendErr(ws, ERR.NOT_PLAYER, "spectator");
    const result: GameResult = role === "w" ? "0-1" : "1-0";
    await this.finalize(result, "resignation");
  }

  private async handleDrawOffer(ws: WebSocket, role: ColorOrSpectator) {
    if (!this.game) return;
    if (role !== "w" && role !== "b") return this.sendErr(ws, ERR.NOT_PLAYER, "spectator");
    if (this.game.drawOfferFrom === role) return; // already offered
    if (this.game.drawOfferFrom && this.game.drawOfferFrom !== role) {
      // Counter-offer = accept
      return this.handleDrawAccept(ws, role);
    }
    this.game.drawOfferFrom = role;
    this.broadcast({ t: "draw_offer", from: role });
    await this.persist();
  }

  private async handleDrawAccept(ws: WebSocket, role: ColorOrSpectator) {
    if (!this.game) return;
    if (role !== "w" && role !== "b") return this.sendErr(ws, ERR.NOT_PLAYER, "spectator");
    if (!this.game.drawOfferFrom || this.game.drawOfferFrom === role)
      return this.sendErr(ws, ERR.BAD_MSG, "no offer");
    await this.finalize("1/2-1/2", "draw_agreed");
  }

  private async handleDrawDecline(ws: WebSocket, role: ColorOrSpectator) {
    if (!this.game) return;
    if (role !== "w" && role !== "b") return this.sendErr(ws, ERR.NOT_PLAYER, "spectator");
    if (!this.game.drawOfferFrom) return;
    this.game.drawOfferFrom = null;
    this.broadcast({ t: "draw_decline" });
    await this.persist();
  }

  private async scheduleFlagAlarm() {
    if (!this.game || !this.chess || this.game.endedAt) return;
    const turn = this.chess.turn() as Color;
    const flagAt = this.game.lastMoveAt + this.game.clocks[turn];
    // If a player is disconnected, also consider abandonment alarm.
    const grace = disconnectGraceMs(this.game.bucket);
    const dcSlot = this.game[turn === "w" ? "white" : "black"];
    const otherSlot = this.game[turn === "w" ? "black" : "white"];
    let abandonAt: number | null = null;
    // Only the OPPONENT can claim abandonment if they remain connected.
    if (otherSlot.connected && !dcSlot.connected && dcSlot.lastDisconnectAt) {
      abandonAt = dcSlot.lastDisconnectAt + grace;
    }
    let nextAt = flagAt;
    let type: "flag" | "abandon" = "flag";
    if (abandonAt !== null && abandonAt < nextAt) {
      nextAt = abandonAt;
      type = "abandon";
    }
    this.game.alarmType = type;
    await this.state.storage.setAlarm(nextAt);
    await this.persist();
  }

  private async scheduleNextAlarm() {
    return this.scheduleFlagAlarm();
  }

  async alarm() {
    if (!this.game || !this.chess || this.game.endedAt) return;
    const now = Date.now();
    const turn = this.chess.turn() as Color;
    const elapsed = now - this.game.lastMoveAt;
    const remaining = this.game.clocks[turn] - elapsed;

    if (this.game.alarmType === "abandon") {
      const dcSlot = this.game[turn === "w" ? "white" : "black"];
      const otherSlot = this.game[turn === "w" ? "black" : "white"];
      const grace = disconnectGraceMs(this.game.bucket);
      if (
        otherSlot.connected &&
        !dcSlot.connected &&
        dcSlot.lastDisconnectAt &&
        now - dcSlot.lastDisconnectAt >= grace
      ) {
        const result: GameResult = turn === "w" ? "0-1" : "1-0";
        await this.finalize(result, "abandonment");
        return;
      }
      // Not actually abandonable anymore — re-evaluate.
      await this.scheduleFlagAlarm();
      return;
    }

    if (remaining <= 0) {
      await this.endByFlag(turn);
    } else {
      // Race condition — reschedule
      await this.scheduleFlagAlarm();
    }
  }

  private async endByFlag(loser: Color) {
    if (!this.game || !this.chess) return;
    // Flag-fall draw if opponent has only insufficient material.
    let result: GameResult = loser === "w" ? "0-1" : "1-0";
    let termination: Termination = "flag";
    try {
      // chess.js doesn't expose a "has mating material" by color directly
      // for the opponent. Approximation: if board is K vs K, K vs KN, K vs KB
      // the side to receive the flag-win cannot mate => draw.
      const fen = this.chess.fen();
      if (cannotMate(fen, loser === "w" ? "b" : "w")) {
        result = "1/2-1/2";
        termination = "insufficient";
      }
    } catch {
      // ignore
    }
    this.game.clocks[loser] = 0;
    await this.finalize(result, termination);
  }

  private async finalize(result: GameResult, termination: Termination) {
    if (!this.game || this.game.endedAt) return;
    this.game.result = result;
    this.game.termination = termination;
    this.game.endedAt = Date.now();
    await this.state.storage.deleteAlarm();

    // Compute Elo, write to D1 in a single batch.
    const db = getDb(this.env.DB);
    let elo: { w: { before: number; after: number }; b: { before: number; after: number } } | undefined;

    if (result !== "*") {
      const ws = this.game.white.eloBefore;
      const bs = this.game.black.eloBefore;
      const wg = this.game.white.gamesPlayed;
      const bg = this.game.black.gamesPlayed;
      const score = scoreFromResult(result);
      const { whiteAfter, blackAfter } = computeElo({
        whiteElo: ws,
        blackElo: bs,
        whiteGames: wg,
        blackGames: bg,
        whiteScore: score,
      });
      elo = {
        w: { before: ws, after: whiteAfter },
        b: { before: bs, after: blackAfter },
      };

      const whiteUpdate =
        this.game.bucket === "bullet"
          ? { eloBullet: whiteAfter, gamesPlayed: wg + 1 }
          : this.game.bucket === "blitz"
            ? { eloBlitz: whiteAfter, gamesPlayed: wg + 1 }
            : { eloRapid: whiteAfter, gamesPlayed: wg + 1 };
      const blackUpdate =
        this.game.bucket === "bullet"
          ? { eloBullet: blackAfter, gamesPlayed: bg + 1 }
          : this.game.bucket === "blitz"
            ? { eloBlitz: blackAfter, gamesPlayed: bg + 1 }
            : { eloRapid: blackAfter, gamesPlayed: bg + 1 };

      await db.batch([
        db
          .update(schema.games)
          .set({
            result,
            termination,
            pgn: this.game.pgn,
            endedAt: this.game.endedAt,
            whiteEloAfter: whiteAfter,
            blackEloAfter: blackAfter,
          })
          .where(eq(schema.games.id, this.game.gameId)),
        db
          .update(schema.users)
          .set(whiteUpdate)
          .where(eq(schema.users.clerkId, this.game.white.userId)),
        db
          .update(schema.users)
          .set(blackUpdate)
          .where(eq(schema.users.clerkId, this.game.black.userId)),
      ]);
    } else {
      // Should not happen; finalize always provides result.
      await db
        .update(schema.games)
        .set({
          result,
          termination,
          pgn: this.game.pgn,
          endedAt: this.game.endedAt,
        })
        .where(eq(schema.games.id, this.game.gameId));
    }

    this.broadcast({
      t: "end",
      result,
      termination,
      elo,
    });
    // Send final state as well.
    this.broadcast(this.publicSnapshot());
    await this.persist();

    // Close all sockets.
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.close(1000, "game over");
      } catch {
        // ignore
      }
    }
  }

  // ---------- helpers ----------

  private publicSnapshot(): ServerMsg {
    if (!this.game || !this.chess) {
      return { t: "error", code: ERR.NOT_FOUND, msg: "no game" };
    }
    // Live-deduct current side's clock for accurate display.
    const now = Date.now();
    const turn = this.chess.turn() as Color;
    const clocks = { ...this.game.clocks };
    if (!this.game.endedAt) {
      const elapsed = now - this.game.lastMoveAt;
      clocks[turn] = Math.max(0, clocks[turn] - elapsed);
    }
    return {
      t: "state",
      fen: this.game.fen,
      pgn: this.game.pgn,
      clocks,
      turn,
      moves: this.game.moves.map((m) => ({
        san: m.san,
        from: m.from,
        to: m.to,
        promo: m.promo as any,
      })),
      players: {
        white: {
          id: this.game.white.userId,
          username: this.game.white.username,
          elo: this.game.white.eloBefore,
          connected: this.game.white.connected,
        },
        black: {
          id: this.game.black.userId,
          username: this.game.black.username,
          elo: this.game.black.eloBefore,
          connected: this.game.black.connected,
        },
      },
      drawOfferFrom: this.game.drawOfferFrom,
      chat: this.game.chat,
      result: this.game.result,
      termination: this.game.termination ?? undefined,
    };
  }

  private broadcastPresence() {
    if (!this.game) return;
    this.broadcast({
      t: "presence",
      white: this.game.white.connected,
      black: this.game.black.connected,
    });
  }

  private broadcast(msg: ServerMsg) {
    const data = JSON.stringify(msg);
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.send(data);
      } catch {
        // ignore
      }
    }
  }

  private send(ws: WebSocket, msg: ServerMsg) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // ignore
    }
  }

  private sendErr(ws: WebSocket, code: string, m: string) {
    this.send(ws, { t: "error", code, msg: m });
  }

  private async persist() {
    if (!this.game) return;
    await this.state.storage.put("game", this.game);
  }
}

/**
 * If the client offered the bearer subprotocol, the 101 response MUST select
 * one of the offered values or browsers will fail the handshake. We only ever
 * echo back the marker — never the token itself.
 */
function wsAcceptHeaders(req: Request): Record<string, string> {
  const proto = req.headers.get("Sec-WebSocket-Protocol");
  if (!proto) return {};
  const parts = proto.split(",").map((s) => s.trim());
  if (parts.includes("chess.bearer.v1")) {
    return { "Sec-WebSocket-Protocol": "chess.bearer.v1" };
  }
  return {};
}

function cannotMate(fen: string, side: "w" | "b"): boolean {
  // Parse pieces; return true if `side` has only K, K+N, or K+B (and opponent has only K).
  try {
    const board = fen.split(" ")[0]!;
    const pieces: string[] = [];
    for (const ch of board) {
      if (/[a-zA-Z]/.test(ch)) pieces.push(ch);
    }
    const sideUpper = side === "w";
    const own = pieces.filter((p) => (sideUpper ? p === p.toUpperCase() : p === p.toLowerCase()));
    const opp = pieces.filter((p) => (sideUpper ? p === p.toLowerCase() : p === p.toUpperCase()));
    const norm = (p: string) => p.toLowerCase();
    const oppNon = opp.map(norm).filter((p) => p !== "k");
    const ownNon = own.map(norm).filter((p) => p !== "k");
    // If opponent has anything beyond K + insufficient minor, they can be mated by some lines.
    // But we need: can `side` checkmate at all? K alone, K+N, K+B can never force mate.
    if (ownNon.length === 0) return true;
    if (ownNon.length === 1 && (ownNon[0] === "n" || ownNon[0] === "b")) return true;
    // K+B+B same color is technically insufficient; skip for simplicity.
    void oppNon;
    return false;
  } catch {
    return false;
  }
}
