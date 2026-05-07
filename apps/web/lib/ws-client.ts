import type { ClientMsg, ServerMsg } from "@chess/shared/protocol";
import { WS_URL } from "./api";

export type WSStatus = "connecting" | "open" | "closed";

type Handlers = {
  onMessage: (msg: ServerMsg) => void;
  onStatus?: (s: WSStatus) => void;
};

export class GameWS {
  private url: string;
  private token: string | null;
  private socket: WebSocket | null = null;
  private handlers: Handlers;
  private reconnectMs = 250;
  private closedByUser = false;
  private reconnectTimer: number | null = null;

  constructor(opts: { gameId: string; token: string | null; handlers: Handlers }) {
    const u = new URL(`${WS_URL}/ws/game/${opts.gameId}`);
    if (opts.token) u.searchParams.set("token", opts.token);
    this.url = u.toString();
    this.token = opts.token;
    this.handlers = opts.handlers;
  }

  connect() {
    this.closedByUser = false;
    this.handlers.onStatus?.("connecting");
    const ws = new WebSocket(this.url);
    this.socket = ws;
    ws.onopen = () => {
      this.reconnectMs = 250;
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
    ws.onclose = () => {
      this.handlers.onStatus?.("closed");
      if (!this.closedByUser) this.scheduleReconnect();
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
      this.connect();
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
  private handlers: { onMessage: (msg: ServerMsg) => void; onStatus?: (s: WSStatus) => void };

  constructor(opts: {
    tcId: string;
    token: string;
    handlers: { onMessage: (msg: ServerMsg) => void; onStatus?: (s: WSStatus) => void };
  }) {
    const u = new URL(`${WS_URL}/ws/queue`);
    u.searchParams.set("tc", opts.tcId);
    u.searchParams.set("token", opts.token);
    this.url = u.toString();
    this.handlers = opts.handlers;
  }

  connect() {
    this.handlers.onStatus?.("connecting");
    const ws = new WebSocket(this.url);
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
    try {
      this.socket?.close();
    } catch {
      // ignore
    }
  }
}
