// Build a small, curated puzzle dataset from the Lichess CC0 puzzle DB.
// Run: bun scripts/build-puzzles.ts /tmp/lichess_puzzles.csv apps/web/public/data/puzzles.json

import { readFileSync, writeFileSync } from "node:fs";

const SRC = process.argv[2];
const OUT = process.argv[3];
if (!SRC || !OUT) {
  console.error("usage: build-puzzles.ts <src-csv> <out-json>");
  process.exit(1);
}

type Row = {
  id: string;
  fen: string;
  moves: string[];
  rating: number;
  themes: string[];
  popularity: number;
  nbPlays: number;
};

const BUCKETS: Array<[number, number]> = [
  [600, 900],
  [900, 1200],
  [1200, 1500],
  [1500, 1800],
  [1800, 2100],
  [2100, 2400],
];
const PER_BUCKET = 350;
const MIN_POPULARITY = 90;
const MIN_NB_PLAYS = 800;
const MAX_THEMES_PER_PUZZLE = 6;

const csv = readFileSync(SRC, "utf8");
const lines = csv.split("\n");
lines.shift();

const collected: Row[][] = BUCKETS.map(() => []);
const themeCounts = new Map<string, number>();

let scanned = 0;
for (const line of lines) {
  if (!line) continue;
  scanned++;
  const cols = line.split(",");
  if (cols.length < 8) continue;
  const [id, fen, movesStr, ratingStr, , popularityStr, nbPlaysStr, themesStr] =
    cols;
  if (!id || !fen || !movesStr) continue;
  const rating = parseInt(ratingStr ?? "0", 10);
  const popularity = parseInt(popularityStr ?? "0", 10);
  const nbPlays = parseInt(nbPlaysStr ?? "0", 10);
  if (popularity < MIN_POPULARITY) continue;
  if (nbPlays < MIN_NB_PLAYS) continue;
  const bucketIdx = BUCKETS.findIndex(([lo, hi]) => rating >= lo && rating < hi);
  if (bucketIdx < 0) continue;
  if ((collected[bucketIdx]?.length ?? 0) >= PER_BUCKET) continue;
  const moves = (movesStr ?? "").split(" ").filter(Boolean);
  if (moves.length < 2) continue;
  const themes = (themesStr ?? "").split(" ").filter(Boolean).slice(0, MAX_THEMES_PER_PUZZLE);
  for (const t of themes) themeCounts.set(t, (themeCounts.get(t) ?? 0) + 1);
  collected[bucketIdx]!.push({ id, fen, moves, rating, themes, popularity, nbPlays });
  if (collected.every((b) => b.length >= PER_BUCKET)) break;
}

const all = collected.flat();
console.error(`scanned ${scanned} rows, kept ${all.length} puzzles`);

// Theme catalog for search/filter UI.
const themes = Array.from(themeCounts.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 60)
  .map(([id, count]) => ({ id, count }));

writeFileSync(
  OUT,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString().slice(0, 10),
      count: all.length,
      themes,
      puzzles: all,
    },
    null,
    0
  ) + "\n"
);
console.error(`wrote ${OUT}`);
