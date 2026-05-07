import { MiniBoard } from "@/components/chess/mini-board";
import { Button } from "@/components/ui/button";

const OPENINGS: Array<{
  name: string;
  eco: string;
  moves: string;
  played: number;
  wr: string;
  score: string;
  pop: number;
  on?: boolean;
  loss?: boolean;
}> = [
  { name: "Italian Game", eco: "C50", moves: "1. e4 e5 2. Nf3 Nc6 3. Bc4", played: 124, wr: "58%", score: "+0.34", pop: 92 },
  { name: "King's Indian Defense", eco: "E60", moves: "1. d4 Nf6 2. c4 g6 3. Nc3", played: 87, wr: "52%", score: "+0.12", pop: 78 },
  { name: "Sicilian Najdorf", eco: "B90", moves: "1. e4 c5 2. Nf3 d6 3. d4 cxd4", played: 64, wr: "49%", score: "-0.08", pop: 88, on: true, loss: true },
  { name: "London System", eco: "D02", moves: "1. d4 d5 2. Bf4", played: 53, wr: "61%", score: "+0.41", pop: 71 },
  { name: "Caro-Kann", eco: "B12", moves: "1. e4 c6 2. d4 d5", played: 47, wr: "54%", score: "+0.18", pop: 64 },
  { name: "Queen's Gambit Decl.", eco: "D30", moves: "1. d4 d5 2. c4 e6", played: 41, wr: "63%", score: "+0.52", pop: 81 },
  { name: "English Opening", eco: "A10", moves: "1. c4", played: 34, wr: "55%", score: "+0.22", pop: 58 },
  { name: "Scotch Game", eco: "C44", moves: "1. e4 e5 2. Nf3 Nc6 3. d4", played: 28, wr: "60%", score: "+0.38", pop: 49 },
];

const RECOMMENDED = [
  { m: "6. Be3", name: "English Attack", freq: "38%", good: true },
  { m: "6. Bg5", name: "Main Line", freq: "24%", good: false },
  { m: "6. Be2", name: "Classical", freq: "18%", good: false },
  { m: "6. f3", name: "English (Slow)", freq: "12%", good: false },
] as const;

export default function LearnPage() {
  return (
    <div className="px-14 pt-9 pb-12 max-w-[1280px] mx-auto w-full">
      {/* Hero */}
      <div className="flex items-end justify-between mb-7 gap-6 flex-wrap">
        <div>
          <div className="eyebrow mb-1.5">Library · 1,284 openings</div>
          <h1 className="h-display">Openings.</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 border border-[var(--border)] rounded-md bg-[var(--bg-elev)] text-[12.5px] text-[var(--fg-muted)] w-[280px]">
            <span aria-hidden className="text-[13px]">{"⌕"}</span>
            <span className="truncate">Search by name or ECO…</span>
          </div>
          <Button variant="outline">Filter</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-8">
        {/* List */}
        <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-elev)]">
          <div
            className="grid items-center px-3.5 py-3 border-b border-[var(--border)] font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--fg-muted)]"
            style={{ gridTemplateColumns: "1fr 80px 80px 80px 80px" }}
          >
            <div>Opening</div>
            <div>Played</div>
            <div>Win %</div>
            <div>Score</div>
            <div>Pop.</div>
          </div>
          {OPENINGS.map((o) => (
            <div
              key={o.name}
              className="grid items-center px-3.5 py-2.5 border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--bg-elev-2)] transition-colors text-[13px]"
              style={{
                gridTemplateColumns: "1fr 80px 80px 80px 80px",
                background: o.on ? "var(--bg-elev-2)" : "transparent",
              }}
            >
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{o.name}</span>
                  <span className="font-mono text-[11px] text-[var(--fg-muted)]">
                    {o.eco}
                  </span>
                  {o.loss && <span className="chip chip-red">−2 last 7d</span>}
                </div>
                <div className="font-mono text-[11.5px] text-[var(--fg-muted)]">
                  {o.moves}
                </div>
              </div>
              <div className="font-mono text-[12.5px]">{o.played}</div>
              <div className="font-mono text-[12.5px]">{o.wr}</div>
              <div
                className="font-mono text-[12.5px]"
                style={{
                  color: o.score.startsWith("+") ? "var(--success)" : "var(--danger)",
                }}
              >
                {o.score}
              </div>
              <div>
                <div
                  className="flex h-1.5 rounded-full overflow-hidden bg-[var(--border)]"
                  style={{ width: 60 }}
                >
                  <div
                    style={{
                      width: `${o.pop * 0.6}%`,
                      background: "var(--bg-elev)",
                      borderRight: "1px solid var(--border-strong)",
                    }}
                  />
                  <div style={{ width: "15%", background: "var(--fg-muted)" }} />
                  <div
                    style={{ width: `${(100 - o.pop) * 0.4}%`, background: "var(--fg)" }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Detail */}
        <div className="flex flex-col gap-5">
          <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-elev)]">
            <div className="px-6 py-5 border-b border-[var(--border)]">
              <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--fg-muted)] mb-1">
                B90 · Sicilian
              </div>
              <h2 className="text-[28px] font-medium tracking-tight">
                Najdorf Variation
              </h2>
              <div className="text-[13px] text-[var(--fg-muted)] mt-1">
                1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6
              </div>
            </div>
            <div className="p-6 flex justify-center">
              <MiniBoard
                fen="rnbqkb1r/1p2pppp/p2p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R"
                size={300}
                fromSq="a7"
                toSq="a6"
                flat
              />
            </div>
            <div className="px-6 pb-5 grid grid-cols-3 gap-3">
              <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-elev)] p-3">
                <div className="font-serif text-[26px] leading-none tracking-tight">
                  49<span className="text-[16px]">%</span>
                </div>
                <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--fg-muted)] mt-1.5">
                  Win rate
                </div>
              </div>
              <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-elev)] p-3">
                <div className="font-serif text-[26px] leading-none tracking-tight">
                  64
                </div>
                <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--fg-muted)] mt-1.5">
                  Games
                </div>
              </div>
              <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-elev)] p-3">
                <div
                  className="font-serif text-[26px] leading-none tracking-tight"
                  style={{ color: "var(--danger)" }}
                >
                  −.08
                </div>
                <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--fg-muted)] mt-1.5">
                  Avg eval
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-elev)] p-5 flex flex-col gap-3">
            <div className="text-[15px] font-medium tracking-tight">
              Recommended next moves
            </div>
            {RECOMMENDED.map((r) => (
              <div key={r.m} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[13px] font-medium">{r.m}</span>
                  <span className="text-[13px]">{r.name}</span>
                </div>
                <span className={r.good ? "chip chip-green" : "chip"}>{r.freq}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
