import { Button } from "@/components/ui/button";
import { MiniBoard } from "@/components/chess/mini-board";

const SESSION_STATES: Array<"s" | "f" | "c" | ""> = [
  "s", "f", "s", "s", "s",
  "f", "s", "s", "s", "s",
  "s", "f", "s", "s", "c",
  "", "", "", "", "",
];

const THEMES = [
  ["Endgame technique", 1620],
  ["Tactical motifs", 1882],
  ["King safety", 1745],
  ["Calculation", 1701],
] as const;

export default function PuzzlesPage() {
  return (
    <div className="flex-1 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] min-h-0">
      {/* Board area */}
      <div className="flex flex-col items-center justify-center gap-5 p-10">
        <div className="flex items-center justify-between w-[540px] max-w-full">
          <div className="flex flex-col gap-1">
            <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--fg-muted)]">
              Puzzle #4,712
            </div>
            <div className="text-[20px] font-medium tracking-tight">
              Black to move · Mate in 2
            </div>
          </div>
          <span className="chip chip-green chip-dot">Streak: 7</span>
        </div>

        <MiniBoard
          fen="r4rk1/ppp2ppp/2n1bq2/3p4/3P4/2N1B3/PPP1QPPP/R4RK1"
          size={540}
          flipped
          selectedSquare="f6"
          legalMoves={["f2", "f4", "h4", "g5", "e6", "d6"]}
          captureSquares={["e3"]}
        />

        <div className="flex items-center gap-2">
          <Button variant="outline">⚡ Hint</Button>
          <Button variant="ghost">Skip</Button>
          <Button variant="ghost">View solution</Button>
        </div>
      </div>

      {/* Right rail */}
      <aside className="border-l border-[var(--border)] px-7 py-8 flex flex-col gap-7">
        <div className="flex flex-col items-center gap-3">
          <div
            className="size-[120px] rounded-full flex items-center justify-center"
            style={{
              background:
                "conic-gradient(var(--accent) calc(72 * 1%), var(--bg-elev-2) 0)",
            }}
          >
            <div className="size-[100px] rounded-full bg-[var(--bg-elev)] flex flex-col items-center justify-center">
              <div className="font-serif text-[32px] leading-none tracking-tight">
                1,847
              </div>
              <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--fg-muted)] mt-1">
                Puzzle rating
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <span className="chip chip-green">+8</span>
            <span className="chip">Top 12%</span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="text-[15px] font-medium tracking-tight">
            Themes for this puzzle
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className="chip">Pin</span>
            <span className="chip">Discovered attack</span>
            <span className="chip">Middlegame</span>
            <span className="chip">Mate in 2</span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="text-[15px] font-medium tracking-tight">Today's session</div>
            <span className="font-mono text-[12px] text-[var(--fg-muted)]">14 / 20</span>
          </div>
          <div className="flex flex-wrap gap-[3px]">
            {SESSION_STATES.map((s, i) => {
              const bg =
                s === "s"
                  ? "var(--success)"
                  : s === "f"
                    ? "var(--danger)"
                    : s === "c"
                      ? "var(--fg)"
                      : "var(--bg-elev-2)";
              return (
                <div
                  key={i}
                  className="size-[22px] rounded"
                  style={{
                    background: bg,
                    border: s === "" ? "1px solid var(--border)" : "none",
                  }}
                />
              );
            })}
          </div>
          <div className="text-[12.5px] text-[var(--fg-muted)]">
            11 solved · 3 missed · 6 left
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="text-[15px] font-medium tracking-tight">Train a theme</div>
          <div className="flex flex-col gap-1.5 mt-1">
            {THEMES.map(([t, r]) => (
              <button
                key={t}
                className="flex items-center justify-between px-3 py-2.5 rounded-md border border-[var(--border)] hover:bg-[var(--bg-elev-2)] transition-colors text-left"
              >
                <span className="text-[13.5px]">{t}</span>
                <span className="font-mono text-[12px] text-[var(--fg-muted)]">{r}</span>
              </button>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
