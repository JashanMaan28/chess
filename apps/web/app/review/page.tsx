import { Button } from "@/components/ui/button";
import { MiniBoard } from "@/components/chess/mini-board";

const QUALITY: Array<[string, number, string]> = [
  ["Brilliant", 1, "var(--success)"],
  ["Best", 14, "var(--success)"],
  ["Good", 8, "var(--fg-muted)"],
  ["Inaccuracy", 3, "var(--warning)"],
  ["Mistake", 1, "var(--warning)"],
  ["Blunder", 1, "var(--danger)"],
];

const MOVES: Array<[number, string, string, string?, string?]> = [
  [16, "Bd3", "Nf6"],
  [17, "Qe2", "b6"],
  [18, "Rfd1", "Bb7"],
  [19, "Bxh7", "Kxh7", "blunder"],
  [20, "Ng5+", "Kg6"],
  [21, "Nxd5", "exd5", "best"],
  [22, "Bxd5", "Bxd5"],
  [23, "Rxd5", "Qe6", undefined, "current"],
];

export default function ReviewPage() {
  return (
    <div className="flex-1 grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)_360px] min-h-0">
      {/* Left: summary */}
      <aside className="border-r border-[var(--border)] px-7 py-7 flex flex-col gap-6">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--fg-muted)] mb-2">
            Game review
          </div>
          <h1 className="text-[28px] font-medium tracking-tight">vs jules_88</h1>
          <div className="text-[13px] text-[var(--fg-muted)]">
            5+3 Blitz · 7 May, 18:42 · 38 moves
          </div>
        </div>

        <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-elev)] p-5 flex items-center justify-between">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--fg-muted)]">
              Result
            </div>
            <div className="font-serif text-[28px] leading-none tracking-tight mt-1">
              1 – 0
            </div>
          </div>
          <span className="chip chip-green">+12 rating</span>
        </div>

        <div className="flex flex-col gap-3">
          <div className="text-[15px] font-medium tracking-tight">Move quality</div>
          {QUALITY.map(([label, count, color]) => (
            <div key={label} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="block size-2 rounded-sm"
                  style={{ background: color }}
                />
                <span className="text-[13px]">{label}</span>
              </div>
              <span className="font-mono text-[13px]">{count}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <div className="text-[15px] font-medium tracking-tight">Accuracy</div>
          <div className="flex items-center justify-between text-[14px]">
            <span>You</span>
            <span className="font-mono">
              <strong>87.4%</strong>
            </span>
          </div>
          <div className="flex items-center justify-between text-[14px]">
            <span className="text-[var(--fg-muted)]">jules_88</span>
            <span className="font-mono text-[var(--fg-muted)]">79.1%</span>
          </div>
        </div>

        <Button>Run deep analysis</Button>
      </aside>

      {/* Center: board + eval graph */}
      <div className="px-8 py-7 flex flex-col gap-4 items-center">
        <MiniBoard
          fen="r4rk1/pp3ppp/2n1pq2/3p4/3P4/2N1BQ2/PPP2PPP/R4RK1"
          size={500}
          fromSq="d8"
          toSq="f6"
          flat
        />

        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon">⏮</Button>
          <Button variant="outline" size="icon">⏴</Button>
          <div
            className="font-mono px-3.5 py-2 rounded-md text-[13px] min-w-[88px] text-center"
            style={{ background: "var(--bg-elev-2)" }}
          >
            Move 18 / 38
          </div>
          <Button variant="outline" size="icon">⏵</Button>
          <Button variant="outline" size="icon">⏭</Button>
          <div className="w-px h-6 bg-[var(--border)] mx-2" />
          <Button variant="outline" size="sm">Auto-play</Button>
          <Button variant="outline" size="sm">Flip</Button>
        </div>

        <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-elev)] p-3.5 w-full">
          <svg
            viewBox="0 0 800 120"
            preserveAspectRatio="none"
            width="100%"
            height="100"
          >
            <line
              x1="0"
              y1="60"
              x2="800"
              y2="60"
              stroke="var(--border-strong)"
              strokeDasharray="2 4"
            />
            <path
              d="M0,60 L20,58 L40,55 L60,52 L80,48 L100,44 L120,50 L140,38 L160,42 L180,30 L200,36 L220,28 L240,46 L260,32 L280,24 L300,30 L320,22 L340,28 L360,16 L380,72 L400,30 L420,36 L440,28 L460,24 L480,18 L500,28 L520,22 L540,14 L560,18 L580,12 L600,16 L620,10 L640,14 L660,8 L680,12 L700,10 L720,8 L740,6 L760,8 L780,4 L800,2 L800,120 L0,120 Z"
              fill="rgba(105,125,58,0.18)"
            />
            <path
              d="M0,60 L20,58 L40,55 L60,52 L80,48 L100,44 L120,50 L140,38 L160,42 L180,30 L200,36 L220,28 L240,46 L260,32 L280,24 L300,30 L320,22 L340,28 L360,16 L380,72 L400,30 L420,36 L440,28 L460,24 L480,18 L500,28 L520,22 L540,14 L560,18 L580,12 L600,16 L620,10 L640,14 L660,8 L680,12 L700,10 L720,8 L740,6 L760,8 L780,4 L800,2"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="1.5"
            />
            <circle cx="380" cy="72" r="5" fill="var(--danger)" />
            <line
              x1="380"
              y1="0"
              x2="380"
              y2="120"
              stroke="var(--fg)"
              strokeWidth="1"
              strokeDasharray="3 3"
              opacity="0.4"
            />
            <text
              x="384"
              y="14"
              fontSize="10"
              fill="var(--danger)"
              fontFamily="JetBrains Mono"
            >
              19. Bxh7? Blunder
            </text>
          </svg>
        </div>
      </div>

      {/* Right: coach commentary */}
      <aside className="border-l border-[var(--border)] flex flex-col min-h-0">
        <div className="flex border-b border-[var(--border)] px-5">
          <button className="px-3.5 py-2.5 text-[13px] text-[var(--fg-muted)]">
            Moves
          </button>
          <button
            className="px-3.5 py-2.5 text-[13px] text-[var(--fg)] -mb-px"
            style={{ borderBottom: "2px solid var(--fg)" }}
          >
            Coach
          </button>
          <button className="px-3.5 py-2.5 text-[13px] text-[var(--fg-muted)]">
            Lines
          </button>
        </div>
        <div className="flex flex-col gap-4 p-5 overflow-auto">
          <div
            className="rounded-[10px] p-5"
            style={{
              background: "var(--accent-soft)",
              border: "1px solid #cdd2a8",
            }}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className="chip chip-green">Brilliant</span>
              <span className="font-mono text-[12px]">21. Nxd5!</span>
            </div>
            <div className="text-[13.5px] leading-[1.5]">
              A piece sacrifice that opens the long diagonal. After …exd5, Bxd5+ wins the
              rook on a8 with tempo.
            </div>
          </div>

          <div
            className="rounded-[10px] p-5"
            style={{ background: "#fbeae6", border: "1px solid #e8c8c0" }}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className="chip chip-red">Blunder</span>
              <span className="font-mono text-[12px]">19. Bxh7?</span>
            </div>
            <div className="text-[13.5px] leading-[1.5]">
              A premature sacrifice — the king escapes via h6 because the knight on f3
              can't relocate fast enough. Try <strong>19. Rad1</strong> first.
            </div>
            <Button variant="outline" size="sm" className="mt-2.5">
              Show better line →
            </Button>
          </div>

          <div className="movelist flex flex-col gap-0.5">
            {MOVES.map(([n, w, b, wcls, bcls]) => (
              <div key={n} className="row">
                <span className="num">{n}.</span>
                <span
                  className="ply"
                  style={{
                    color:
                      wcls === "blunder"
                        ? "var(--danger)"
                        : wcls === "best"
                          ? "var(--success)"
                          : undefined,
                  }}
                >
                  {w}
                </span>
                <span
                  className={`ply ${bcls === "current" ? "ply-current" : ""}`}
                  style={{
                    color:
                      bcls === "blunder"
                        ? "var(--danger)"
                        : bcls === "best"
                          ? "var(--success)"
                          : undefined,
                  }}
                >
                  {b}
                </span>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
