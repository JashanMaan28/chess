import type { Color, Promotion } from "./protocol";

export type Square = string; // 'a1'..'h8'

export type MoveRecord = {
  san: string;
  from: Square;
  to: Square;
  promo?: Promotion;
  fenAfter: string;
  movedBy: Color;
  ms: number; // ms remaining for the player who moved, after this move
  at: number; // server timestamp
};

export const STARTING_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
