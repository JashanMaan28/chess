export type Color = "w" | "b";
export type ColorOrSpectator = Color | "spectator";
export type Promotion = "q" | "r" | "b" | "n";

export type Clocks = { w: number; b: number };

export type GameResult = "1-0" | "0-1" | "1/2-1/2" | "*";

export type Termination =
  | "checkmate"
  | "resignation"
  | "flag"
  | "draw_agreed"
  | "stalemate"
  | "insufficient"
  | "threefold"
  | "fifty_move"
  | "abandonment";

export type ClientMsg =
  | { t: "move"; from: string; to: string; promo?: Promotion }
  | { t: "resign" }
  | { t: "draw_offer" }
  | { t: "draw_accept" }
  | { t: "draw_decline" }
  | { t: "chat"; text: string }
  | { t: "sync" };

export type EloPair = {
  w: { before: number; after: number };
  b: { before: number; after: number };
};

export type StateMsg = {
  t: "state";
  fen: string;
  pgn: string;
  clocks: Clocks;
  turn: Color;
  you?: ColorOrSpectator;
  result?: GameResult;
  termination?: Termination;
  moves: { san: string; from: string; to: string; promo?: Promotion }[];
  players: { white: PlayerInfo | null; black: PlayerInfo | null };
  drawOfferFrom?: Color | null;
  chat: ChatMsg[];
};

export type PlayerInfo = {
  id: string;
  username: string;
  elo: number;
  connected: boolean;
};

export type ChatMsg = { from: string; text: string; at: number };

export type ServerMsg =
  | StateMsg
  | {
      t: "move";
      san: string;
      from: string;
      to: string;
      promo?: Promotion;
      fen: string;
      clocks: Clocks;
      turn: Color;
    }
  | { t: "chat"; from: string; text: string; at: number }
  | { t: "draw_offer"; from: Color }
  | { t: "draw_decline" }
  | { t: "presence"; white: boolean; black: boolean }
  | {
      t: "end";
      result: GameResult;
      termination: Termination;
      elo?: EloPair;
    }
  | { t: "matched"; gameId: string; color: Color }
  | { t: "queued"; size: number }
  | { t: "error"; code: string; msg: string };

export const ERR = {
  UNAUTH: "unauthorized",
  NOT_PLAYER: "not_a_player",
  NOT_TURN: "not_your_turn",
  ILLEGAL_MOVE: "illegal_move",
  GAME_OVER: "game_over",
  RATE_LIMIT: "rate_limit",
  TOO_LONG: "too_long",
  BAD_MSG: "bad_message",
  NOT_FOUND: "not_found",
  EXPIRED: "expired",
  ALREADY_USED: "already_used",
  INTERNAL: "internal",
} as const;
