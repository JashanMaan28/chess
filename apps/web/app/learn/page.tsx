"use client";
import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Chess } from "chess.js";
import { MiniBoard } from "@/components/chess/mini-board";
import { Button } from "@/components/ui/button";

type Opening = {
  id: string;
  eco: string;
  name: string;
  family: string;
  variation: string;
  pgn: string;
  uci: string[];
  fen: string;
  ply: number;
};

type Family = { family: string; count: number; head: string };

type OpeningsData = {
  count: number;
  familyCount: number;
  families: Family[];
  openings: Opening[];
};

const ECO_BUCKETS: Array<{ id: string; label: string; match: (eco: string) => boolean }> = [
  { id: "all", label: "All", match: () => true },
  { id: "A", label: "A · Flank", match: (e) => e.startsWith("A") },
  { id: "B", label: "B · Semi-open", match: (e) => e.startsWith("B") },
  { id: "C", label: "C · Open", match: (e) => e.startsWith("C") },
  { id: "D", label: "D · Closed", match: (e) => e.startsWith("D") },
  { id: "E", label: "E · Indian", match: (e) => e.startsWith("E") },
];

export default function LearnPage() {
  return (
    <React.Suspense fallback={<div className="px-14 pt-9 pb-12" />}>
      <LearnInner />
    </React.Suspense>
  );
}

function LearnInner() {
  const search = useSearchParams();
  const [data, setData] = React.useState<OpeningsData | null>(null);
  const [query, setQuery] = React.useState("");
  const [bucket, setBucket] = React.useState("all");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [movePly, setMovePly] = React.useState(0); // 0 = start position; max = full opening

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/data/openings.json", { cache: "force-cache" });
      const json = (await res.json()) as OpeningsData;
      if (!cancelled) {
        setData(json);
        const wanted = search.get("o");
        const found = wanted
          ? json.openings.find((o) => o.id === wanted)
          : null;
        setSelectedId(found?.id ?? json.families[0]?.head ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byId = React.useMemo(() => {
    if (!data) return new Map<string, Opening>();
    return new Map(data.openings.map((o) => [o.id, o]));
  }, [data]);

  const familyHeadIds = React.useMemo(() => {
    if (!data) return new Set<string>();
    return new Set(data.families.map((f) => f.head));
  }, [data]);

  const familyMembers = React.useMemo(() => {
    if (!data) return new Map<string, Opening[]>();
    const map = new Map<string, Opening[]>();
    for (const o of data.openings) {
      if (!map.has(o.family)) map.set(o.family, []);
      map.get(o.family)!.push(o);
    }
    for (const list of map.values()) list.sort((a, b) => a.ply - b.ply);
    return map;
  }, [data]);

  // List of family-head openings, filtered by query + ECO bucket.
  const filtered = React.useMemo(() => {
    if (!data) return [] as Opening[];
    const q = query.trim().toLowerCase();
    const ecoBucket = ECO_BUCKETS.find((b) => b.id === bucket) ?? ECO_BUCKETS[0]!;
    const heads = data.families
      .map((f) => byId.get(f.head))
      .filter((x): x is Opening => !!x);
    return heads
      .filter((o) => ecoBucket.match(o.eco))
      .filter(
        (o) =>
          q === "" ||
          o.name.toLowerCase().includes(q) ||
          o.eco.toLowerCase() === q ||
          o.eco.toLowerCase().startsWith(q)
      )
      .slice(0, 200);
  }, [data, byId, query, bucket]);

  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  const variations = selected ? familyMembers.get(selected.family) ?? [] : [];

  // Auto-animate the move ply when a new opening is selected.
  React.useEffect(() => {
    if (!selected) return;
    setMovePly(selected.ply);
  }, [selectedId, selected]);

  // Compute FEN at the chosen ply by playing the prefix of the selected opening's UCI moves.
  const renderedFen = React.useMemo(() => {
    if (!selected) return undefined;
    if (movePly >= selected.ply) return selected.fen;
    return computeFenAt(selected.uci, movePly);
  }, [selected, movePly]);

  const movePairs = React.useMemo(() => {
    if (!selected) return [] as Array<{ n: number; w: string; b?: string }>;
    return parsePgnPairs(selected.pgn);
  }, [selected]);

  return (
    <div className="px-14 pt-9 pb-12 max-w-[1280px] mx-auto w-full">
      {/* Hero */}
      <div className="flex items-end justify-between mb-7 gap-6 flex-wrap">
        <div>
          <div className="eyebrow mb-1.5">
            Library · {data ? `${data.familyCount} openings` : "loading…"}
          </div>
          <h1 className="h-display">Openings.</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 border border-[var(--border)] rounded-md bg-[var(--bg-elev)] w-[280px]">
            <span aria-hidden className="text-[13px] text-[var(--fg-muted)]">
              {"⌕"}
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or ECO…"
              className="flex-1 bg-transparent text-[12.5px] outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="text-[var(--fg-muted)] hover:text-[var(--fg)] text-[13px]"
                aria-label="Clear"
              >
                ×
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ECO bucket filter */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        {ECO_BUCKETS.map((b) => {
          const on = b.id === bucket;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => setBucket(b.id)}
              className="px-3 py-1.5 rounded-md border text-[12.5px] transition-colors"
              style={{
                borderColor: on ? "var(--fg)" : "var(--border)",
                background: on ? "var(--bg-elev-2)" : "transparent",
              }}
            >
              {b.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-8">
        {/* List */}
        <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-elev)]">
          <div
            className="grid items-center px-3.5 py-3 border-b border-[var(--border)] font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--fg-muted)]"
            style={{ gridTemplateColumns: "1fr 64px 90px" }}
          >
            <div>Opening</div>
            <div>ECO</div>
            <div>Variations</div>
          </div>
          {!data ? (
            <div className="px-4 py-6 text-[13px] text-[var(--fg-muted)]">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-6 text-[13px] text-[var(--fg-muted)]">
              No matches.
            </div>
          ) : (
            <div className="max-h-[640px] overflow-y-auto">
              {filtered.map((o) => {
                const family = data.families.find((f) => f.family === o.family);
                const on = selectedId === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setSelectedId(o.id)}
                    className="w-full text-left grid items-center px-3.5 py-2.5 border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--bg-elev-2)] transition-colors text-[13px]"
                    style={{
                      gridTemplateColumns: "1fr 64px 90px",
                      background: on ? "var(--bg-elev-2)" : "transparent",
                    }}
                  >
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium truncate">{o.family}</span>
                      </div>
                      <div className="font-mono text-[11.5px] text-[var(--fg-muted)] truncate">
                        {o.pgn}
                      </div>
                    </div>
                    <div className="font-mono text-[12.5px] text-[var(--fg-muted)]">
                      {o.eco}
                    </div>
                    <div className="font-mono text-[12.5px] text-[var(--fg-muted)]">
                      {family?.count ?? 1}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail */}
        <div className="flex flex-col gap-5">
          <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-elev)]">
            <div className="px-6 py-5 border-b border-[var(--border)]">
              <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--fg-muted)] mb-1">
                {selected?.eco ?? "—"}
              </div>
              <h2 className="text-[28px] font-medium tracking-tight">
                {selected?.family ?? "—"}
              </h2>
              <div className="text-[13px] text-[var(--fg-muted)] mt-1">
                {selected?.pgn ?? ""}
              </div>
            </div>
            <div className="p-6 flex justify-center">
              <MiniBoard
                fen={renderedFen ?? undefined}
                size={300}
                flat
              />
            </div>
            {selected && (
              <div className="px-6 pb-5 flex flex-col gap-2.5">
                <div className="flex items-center justify-between font-mono text-[11px] text-[var(--fg-muted)]">
                  <span>
                    Move {movePly} of {selected.ply}
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      className="px-2 py-0.5 rounded border border-[var(--border)] hover:bg-[var(--bg-elev-2)]"
                      onClick={() => setMovePly(0)}
                    >
                      «
                    </button>
                    <button
                      type="button"
                      className="px-2 py-0.5 rounded border border-[var(--border)] hover:bg-[var(--bg-elev-2)]"
                      onClick={() => setMovePly((p) => Math.max(0, p - 1))}
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      className="px-2 py-0.5 rounded border border-[var(--border)] hover:bg-[var(--bg-elev-2)]"
                      onClick={() => setMovePly((p) => Math.min(selected.ply, p + 1))}
                    >
                      ›
                    </button>
                    <button
                      type="button"
                      className="px-2 py-0.5 rounded border border-[var(--border)] hover:bg-[var(--bg-elev-2)]"
                      onClick={() => setMovePly(selected.ply)}
                    >
                      »
                    </button>
                  </div>
                </div>
                <div className="font-mono text-[12px] leading-[1.7] flex flex-wrap gap-x-2 max-h-[120px] overflow-y-auto">
                  {movePairs.map(({ n, w, b }) => (
                    <span key={n}>
                      <span className="text-[var(--fg-muted)]">{n}.</span>{" "}
                      <span>{w}</span>{" "}
                      {b && <span>{b}</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-elev)] p-5 flex flex-col gap-3">
            <div className="text-[15px] font-medium tracking-tight">
              Variations in this family
            </div>
            {variations.length === 0 ? (
              <div className="text-[13px] text-[var(--fg-muted)]">No variations.</div>
            ) : (
              <div className="flex flex-col gap-1.5 max-h-[260px] overflow-y-auto">
                {variations.map((v) => {
                  const isHead = familyHeadIds.has(v.id) && v.id === selectedId;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedId(v.id)}
                      className="flex items-center justify-between px-3 py-2 rounded-md border text-left transition-colors"
                      style={{
                        borderColor:
                          v.id === selectedId ? "var(--fg)" : "var(--border)",
                        background:
                          v.id === selectedId ? "var(--bg-elev-2)" : "transparent",
                      }}
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="text-[13px] truncate">
                          {isHead ? "Main line" : v.variation || v.name}
                        </span>
                        <span className="font-mono text-[11px] text-[var(--fg-muted)] truncate">
                          {v.pgn}
                        </span>
                      </div>
                      <span className="font-mono text-[11px] text-[var(--fg-muted)] ml-3 flex-shrink-0">
                        {v.eco}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {selected && (
            <Button asChild variant="outline">
              <a
                href={`https://lichess.org/analysis/standard/${encodeURIComponent(selected.fen)}`}
                target="_blank"
                rel="noreferrer"
              >
                Open in analysis →
              </a>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function computeFenAt(uci: string[], ply: number): string {
  const c = new Chess();
  for (let i = 0; i < ply && i < uci.length; i++) {
    const m = uci[i]!;
    c.move({
      from: m.slice(0, 2),
      to: m.slice(2, 4),
      promotion: (m[4] as "q" | "r" | "b" | "n" | undefined) ?? "q",
    });
  }
  return c.fen();
}

function parsePgnPairs(pgn: string): Array<{ n: number; w: string; b?: string }> {
  const tokens = pgn.split(/\s+/).filter(Boolean);
  const pairs: Array<{ n: number; w: string; b?: string }> = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i]!;
    const m = t.match(/^(\d+)\.+$/);
    if (m) {
      const n = parseInt(m[1]!, 10);
      const w = tokens[i + 1];
      const b = tokens[i + 2];
      const bIsMove = b && !/^\d+\.+$/.test(b);
      if (w && !/^\d+\.+$/.test(w)) {
        pairs.push({ n, w, b: bIsMove ? b : undefined });
        i += bIsMove ? 3 : 2;
        continue;
      }
    }
    i++;
  }
  return pairs;
}
