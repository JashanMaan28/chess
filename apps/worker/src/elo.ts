/**
 * Standard Elo with K=40 (<30 games), K=20 (>=30), K=10 (rating>=2400).
 * `score` is from white's perspective: 1 = white win, 0 = black win, 0.5 = draw.
 */

export function kFactor(elo: number, gamesPlayed: number): number {
  if (elo >= 2400) return 10;
  if (gamesPlayed < 30) return 40;
  return 20;
}

export function expectedScore(a: number, b: number): number {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

export function computeElo(args: {
  whiteElo: number;
  blackElo: number;
  whiteGames: number;
  blackGames: number;
  /** 1 = white win, 0 = black win, 0.5 = draw */
  whiteScore: 0 | 0.5 | 1;
}): { whiteAfter: number; blackAfter: number } {
  const ew = expectedScore(args.whiteElo, args.blackElo);
  const eb = 1 - ew;
  const kw = kFactor(args.whiteElo, args.whiteGames);
  const kb = kFactor(args.blackElo, args.blackGames);
  const sw = args.whiteScore;
  const sb = 1 - sw;
  const whiteAfter = Math.round(args.whiteElo + kw * (sw - ew));
  const blackAfter = Math.round(args.blackElo + kb * (sb - eb));
  return { whiteAfter, blackAfter };
}

export function scoreFromResult(result: "1-0" | "0-1" | "1/2-1/2"): 0 | 0.5 | 1 {
  if (result === "1-0") return 1;
  if (result === "0-1") return 0;
  return 0.5;
}
