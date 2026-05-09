import type { ClientMsg, ServerMsg } from "@chess/shared/protocol";
import { WS_URL } from "./api";

export type WSStatus = "connecting" | "open" | "closed";

type Handlers = {
  onMessage: (msg: ServerMsg) => void;
  onStatus?: (s: WSStatus) => void;
};

type GetToken = () => Promise<string | null>;

// Marker subprotocol that pairs with the bearer JWT in the Sec-WebSocket-Protocol
// header. The server echoes this marker back; the token never appears in URLs
// or response headers, keeping it out of CDN access logs.
const WS_BEARER_PROTOCOL = "chess.bearer.v1";

function buildProtocols(token: string | null): string[] | undefined {
  if (!token) return undefined;
  return [WS_BEARER_PROTOCOL, token];
}

export class GameWS {
  private url: string;
  private getToken: GetToken;
  private socket: WebSocket | null = null;
  private handlers: Handlers;
  private reconnectMs = 250;
  private closedByUser = false;
  private reconnectTimer: number | null = null;
  // After this many consecutive auth-shaped failures, stop hammering the server.
  private authFailures = 0;
  private static MAX_AUTH_FAILURES = 3;

  constructor(opts: { gameId: string; getToken: GetToken; handlers: Handlers }) {
    this.url = `${WS_URL}/ws/game/${opts.gameId}`;
    this.getToken = opts.getToken;
    this.handlers = opts.handlers;
  }

  async connect() {
    this.closedByUser = false;
    this.handlers.onStatus?.("connecting");
    let token: string | null = null;
    try {
      token = await this.getToken();
    } catch {
      token = null;
    }
    if (this.closedByUser) return;
    const ws = new WebSocket(this.url, buildProtocols(token));
    this.socket = ws;
    ws.onopen = () => {
      this.reconnectMs = 250;
      this.authFailures = 0;
      this.handlers.onStatus?.("open");
      // Always sync immediately on (re)open
      this.send({ t: "sync" });
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as ServerMsg;
        this.handlers.onMessage(msg);
      } catch {
        // ignore
      }
    };
    ws.onclose = (e) => {
      this.handlers.onStatus?.("closed");
      if (this.closedByUser) return;
      // 1006 with no prior open often signals a handshake-level rejection
      // (e.g. the worker returned 401 for an invalid token). Cap retries so
      // we don't spin if the user's session is genuinely gone.
      if (e.code === 1006 && this.reconnectMs <= 250) {
        this.authFailures += 1;
        if (this.authFailures >= GameWS.MAX_AUTH_FAILURES) return;
      }
      this.scheduleReconnect();
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        // ignore
      }
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer != null) return;
    const delay = Math.min(4000, this.reconnectMs);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectMs = Math.min(4000, this.reconnectMs * 2);
      void this.connect();
    }, delay);
  }

  send(msg: ClientMsg) {
    const ws = this.socket;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(msg));
    return true;
  }

  close() {
    this.closedByUser = true;
    if (this.reconnectTimer != null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      this.socket?.close();
    } catch {
      // ignore
    }
  }
}

export class QueueWS {
  private socket: WebSocket | null = null;
  private url: string;
  private getToken: GetToken;
  private handlers: { onMessage: (msg: ServerMsg) => void; onStatus?: (s: WSStatus) => void };
  private closedByUser = false;

  constructor(opts: {
    tcId: string;
    getToken: GetToken;
    handlers: { onMessage: (msg: ServerMsg) => void; onStatus?: (s: WSStatus) => void };
  }) {
    const u = new URL(`${WS_URL}/ws/queue`);
    u.searchParams.set("tc", opts.tcId);
    this.url = u.toString();
    this.getToken = opts.getToken;
    this.handlers = opts.handlers;
  }

  async connect() {
    this.handlers.onStatus?.("connecting");
    let token: string | null = null;
    try {
      token = await this.getToken();
    } catch {
      token = null;
    }
    if (this.closedByUser) return;
    const ws = new WebSocket(this.url, buildProtocols(token));
    this.socket = ws;
    ws.onopen = () => this.handlers.onStatus?.("open");
    ws.onmessage = (e) => {
      try {
        this.handlers.onMessage(JSON.parse(e.data) as ServerMsg);
      } catch {
        // ignore
      }
    };
    ws.onclose = () => this.handlers.onStatus?.("closed");
    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        // ignore
      }
    };
  }

  close() {
    this.closedByUser = true;
    try {
      this.socket?.close();
    } catch {
      // ignore
    }
  }
}
