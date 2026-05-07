import { Button } from "@/components/ui/button";

type Match = {
  a: string;
  b: string;
  sa: string;
  sb: string;
  win?: "a" | "b";
  live?: boolean;
};

const ROUND_1: Match[] = [
  { a: "ana_z", b: "vlad_99", sa: "2", sb: "0", win: "a" },
  { a: "rohan", b: "janet", sa: "1", sb: "2", win: "b" },
  { a: "theo.k", b: "praveen", sa: "2", sb: "1", win: "a" },
  { a: "maddy", b: "sven_t", sa: "0", sb: "2", win: "b" },
];
const ROUND_2: Match[] = [
  { a: "ana_z", b: "janet", sa: "2", sb: "0", win: "a" },
  { a: "theo.k", b: "sven_t", sa: "1", sb: "2", win: "b" },
];
const ROUND_3: Match[] = [
  { a: "ana_z", b: "sven_t", sa: "1½", sb: "½", live: true },
];

const STANDINGS: Array<[number, string, number, string]> = [
  [1, "ana_z", 1893, "7.5"],
  [2, "sven_t", 1834, "7.0"],
  [3, "janet", 1788, "6.5"],
  [4, "theo.k", 1812, "6.0"],
  [5, "praveen", 1701, "5.5"],
  [6, "maddy", 1734, "5.0"],
  [7, "rohan", 1681, "4.5"],
  [8, "vlad_99", 1652, "4.0"],
];

const PRIZES = [
  ["1st", "$1,200"],
  ["2nd", "$600"],
  ["3rd", "$300"],
  ["4th", "$150"],
  ["5–8", "$150 split"],
] as const;

function MatchCard({ m }: { m: Match }) {
  return (
    <div
      className="flex flex-col rounded-md bg-[var(--bg-elev)] text-[12.5px]"
      style={{
        border: m.live ? "1px solid var(--accent)" : "1px solid var(--border)",
        boxShadow: m.live ? "var(--shadow-glow)" : "none",
        width: 200,
      }}
    >
      <div
        className={`flex items-center justify-between px-3 py-2 ${m.win === "a" ? "font-medium" : "text-[var(--fg-muted)]"}`}
      >
        <span>{m.a}</span>
        <span className="font-mono">{m.sa}</span>
      </div>
      <div className="h-px bg-[var(--border)]" />
      <div
        className={`flex items-center justify-between px-3 py-2 ${m.win === "b" ? "font-medium" : "text-[var(--fg-muted)]"}`}
      >
        <span>{m.b}</span>
        <span className="font-mono">{m.sb}</span>
      </div>
      {m.live && (
        <div
          className="px-3 py-1 border-t border-[var(--border)]"
          style={{ background: "var(--accent-soft)" }}
        >
          <span
            className="chip chip-green chip-dot"
            style={{ background: "transparent", padding: 0, fontSize: 11 }}
          >
            Live · 04:32
          </span>
        </div>
      )}
    </div>
  );
}

function PlaceholderMatch() {
  return (
    <div
      className="flex flex-col rounded-md border border-[var(--border)] bg-[var(--bg-elev)] text-[12.5px] opacity-50"
      style={{ width: 200 }}
    >
      <div className="flex items-center justify-between px-3 py-2 text-[var(--fg-muted)]">
        <span>—</span>
        <span className="font-mono">&nbsp;</span>
      </div>
      <div className="h-px bg-[var(--border)]" />
      <div className="flex items-center justify-between px-3 py-2 text-[var(--fg-muted)]">
        <span>—</span>
        <span className="font-mono">&nbsp;</span>
      </div>
    </div>
  );
}

export default function TournamentsPage() {
  return (
    <div className="px-14 pt-9 pb-12 max-w-[1280px] mx-auto w-full">
      {/* Hero */}
      <div className="flex items-end justify-between mb-6 gap-6 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-1.5">
            <span className="chip chip-green chip-dot">Live · Round 3 of 5</span>
            <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--fg-muted)]">
              Knockout · 64 players
            </span>
          </div>
          <h1 className="h-display">Spring Arena 2026</h1>
          <div className="text-[14px] text-[var(--fg-muted)] mt-1.5">
            $2,400 prize pool · 10+0 Rapid · 7 May, 18:00 UTC
          </div>
        </div>
        <div className="flex gap-3">
          <Button variant="outline">Watch</Button>
          <Button>Join next round</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">
        {/* Bracket */}
        <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-elev)] p-6 overflow-x-auto">
          <div className="flex gap-2 mb-4">
            {["R1", "R2", "R3", "SF", "F"].map((r, i) => {
              const active = i === 2;
              return (
                <div
                  key={r}
                  className="flex-1 font-mono text-[11px] uppercase tracking-[0.1em] text-center px-2 py-1.5 rounded"
                  style={{
                    background: active ? "var(--fg)" : "var(--bg-elev-2)",
                    color: active ? "var(--bg)" : "var(--fg-muted)",
                  }}
                >
                  {r}
                </div>
              );
            })}
          </div>
          <div className="flex gap-6 items-stretch">
            <div className="flex flex-col gap-2 justify-around">
              {ROUND_1.map((m, i) => (
                <MatchCard key={i} m={m} />
              ))}
            </div>
            <div className="flex flex-col gap-8 justify-around">
              {ROUND_2.map((m, i) => (
                <MatchCard key={i} m={m} />
              ))}
            </div>
            <div className="flex flex-col justify-center">
              {ROUND_3.map((m, i) => (
                <MatchCard key={i} m={m} />
              ))}
            </div>
            <div className="flex flex-col justify-center">
              <PlaceholderMatch />
            </div>
            <div className="flex flex-col justify-center">
              <PlaceholderMatch />
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-5">
          <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-elev)]">
            <div className="px-[18px] py-3.5 border-b border-[var(--border)]">
              <div className="text-[15px] font-medium tracking-tight">Standings</div>
            </div>
            <div className="p-1.5">
              {STANDINGS.map(([rank, name, rating, pts]) => (
                <div
                  key={name}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-[var(--bg-elev-2)]"
                >
                  <span className="font-mono text-[12px] text-[var(--fg-muted)] text-right w-[22px]">
                    {rank}
                  </span>
                  <div
                    aria-hidden
                    className="size-[26px] rounded-full text-[10px] font-semibold text-white flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg,#c8b896,#876f4e)" }}
                  >
                    {name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] truncate">{name}</div>
                    <div className="font-mono text-[11px] text-[var(--fg-muted)]">
                      {rating}
                    </div>
                  </div>
                  <span className="font-mono text-[13px] font-medium">{pts}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-elev)] p-5 flex flex-col gap-3">
            <div className="text-[15px] font-medium tracking-tight">Prize pool</div>
            {PRIZES.map(([p, a]) => (
              <div key={p} className="flex items-center justify-between">
                <span className="font-mono text-[12.5px] text-[var(--fg-muted)]">{p}</span>
                <span className="font-mono text-[13px] font-medium">{a}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
