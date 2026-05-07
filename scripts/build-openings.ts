// Build a static opening book from the lichess-org/chess-openings TSVs (CC0).
// Run from repo root: bun scripts/build-openings.ts /tmp/chess-openings-src apps/web/public/data/openings.json

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// chess.js is hoisted under apps/web — load it from there.
const { Chess } = await import(
  "/Users/jmaan/Github Projects/chess/apps/web/node_modules/chess.js/dist/esm/chess.js"
) as { Chess: new (fen?: string) => any };

const SRC = process.argv[2];
const OUT = process.argv[3];
if (!SRC || !OUT) {
  console.error("usage: build-openings.ts <src-dir> <out-json>");
  process.exit(1);
}

type Opening = {
  id: string;          // slug, unique
  eco: string;
  name: string;        // full name e.g. "Sicilian Defense: Najdorf Variation"
  family: string;      // top-level e.g. "Sicilian Defense"
  variation: string;   // remainder e.g. "Najdorf Variation"
  pgn: string;         // SAN moves
  uci: string[];       // UCI moves
  fen: string;         // FEN after final move
  ply: number;         // half-move count
};

function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const all: Opening[] = [];
const seen = new Set<string>();

for (const file of readdirSync(SRC).sort()) {
  if (!file.endsWith(".tsv")) continue;
  const content = readFileSync(join(SRC, file), "utf8");
  const lines = content.split("\n");
  lines.shift(); // header
  for (const line of lines) {
    if (!line) continue;
    const [eco, name, pgn] = line.split("\t");
    if (!eco || !name || !pgn) continue;
    const c = new Chess();
    let ok = true;
    const sanMoves = pgn
      .replace(/\d+\./g, "")
      .split(/\s+/)
      .filter(Boolean);
    const uci: string[] = [];
    for (const san of sanMoves) {
      try {
        const m = c.move(san);
        if (!m) {
          ok = false;
          break;
        }
        uci.push(m.from + m.to + (m.promotion ?? ""));
      } catch {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    const [family, ...rest] = name.split(":").map((s) => s.trim());
    const variation = rest.join(": ");
    let id = slug(name);
    if (seen.has(id)) {
      let n = 2;
      while (seen.has(`${id}-${n}`)) n++;
      id = `${id}-${n}`;
    }
    seen.add(id);
    all.push({
      id,
      eco,
      name,
      family: family ?? name,
      variation,
      pgn,
      uci,
      fen: c.fen(),
      ply: uci.length,
    });
  }
}

console.error(`parsed ${all.length} openings`);

// Group families for the listing UI: pick one canonical "head" per family
// (shortest / fewest plies under that family) for the main row, and keep all
// children inline so the page can show siblings.
const byFamily = new Map<string, Opening[]>();
for (const o of all) {
  if (!byFamily.has(o.family)) byFamily.set(o.family, []);
  byFamily.get(o.family)!.push(o);
}
for (const list of byFamily.values()) list.sort((a, b) => a.ply - b.ply);

const families = Array.from(byFamily.entries()).map(([name, items]) => ({
  family: name,
  count: items.length,
  head: items[0]!.id,
}));
families.sort((a, b) => b.count - a.count);

writeFileSync(
  OUT,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString().slice(0, 10),
      count: all.length,
      familyCount: families.length,
      families,
      openings: all,
    },
    null,
    0
  ) + "\n"
);
console.error(`wrote ${OUT}`);
