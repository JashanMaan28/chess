import Link from "next/link";
import { TIME_CONTROLS } from "@chess/shared/time-controls";
import { Button } from "@/components/ui/button";
import { MiniBoard } from "@/components/chess/mini-board";

const QUICK_PLAY: Array<{
  id: string;
  time: string;
  inc: string;
  label: string;
  desc: string;
}> = [
  { id: "1+0", time: "1", inc: "+0", label: "Bullet", desc: "Lightning fast" },
  { id: "3+0", time: "3", inc: "+0", label: "Blitz", desc: "Most popular" },
  { id: "5+3", time: "5", inc: "+3", label: "Blitz", desc: "With increment" },
  { id: "10+0", time: "10", inc: "+0", label: "Rapid", desc: "Think a bit" },
  { id: "15+10", time: "15", inc: "+10", label: "Rapid", desc: "For deep games" },
];

const CONTINUE_GAMES = [
  {
    opp: "jules_88",
    rating: 1432,
    color: "white",
    last: "Nf3",
    moves: 14,
    status: "Your move",
    live: true,
    fen: "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R",
  },
  {
    opp: "praveen_k",
    rating: 1567,
    color: "black",
    last: "Bxc5",
    moves: 22,
    status: "Their move",
    live: false,
    fen: "r1bqr1k1/ppp2ppp/2np1n2/2bN4/2B1P3/3P1N2/PPP2PPP/R1BQ1RK1",
  },
  {
    opp: "oliviarn",
    rating: 1389,
    color: "white",
    last: "O-O",
    moves: 8,
    status: "Your move · 2 days",
    live: false,
    fen: "rnbq1rk1/pppp1ppp/4pn2/8/2PP4/2N2N2/PP2PPPP/R1BQKB1R",
  },
];

const FRIENDS = [
  { name: "ana_z", rating: 1623, status: "Bullet", live: true },
  { name: "heinz", rating: 1488, status: "Idle", live: false },
  { name: "maddy_w", rating: 1701, status: "Blitz", live: true },
  { name: "rohan", rating: 1342, status: "Rapid", live: true },
];

export default function LandingLobbyPage() {
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const hour = new Date().getHours();
  const greeting = hour < 5 ? "Up late" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="px-14 pt-9 pb-12 max-w-[1280px] mx-auto w-full">
      {/* Hero / greeting */}
      <div className="flex items-end justify-between mb-7 gap-6 flex-wrap">
        <div>
          <div className="eyebrow mb-1.5">{today}</div>
          <h1 className="h-display">
            {greeting}, <em className="font-serif italic">friend</em>.
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="chip chip-green chip-dot">Online · 14,238</span>
          <Button variant="outline" asChild>
            <Link href="/play/friend">Custom game</Link>
          </Button>
          <Button asChild>
            <Link href="/play">Play now</Link>
          </Button>
        </div>
      </div>

      {/* Quick play */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-medium tracking-tight">Quick play</h2>
          <Link href="/play" className="text-[var(--fg-muted)] text-[13px] hover:text-[var(--fg)]">
            All time controls →
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {QUICK_PLAY.map((q) => (
            <Link key={q.id} href={`/play?tc=${encodeURIComponent(q.id)}`} className="qp-card">
              <div className="font-serif text-[36px] leading-none">
                {q.time}
                <span className="text-[var(--fg-muted)] text-[22px]">{q.inc}</span>
              </div>
              <div className="eyebrow !mt-1">{q.label}</div>
              <div className="text-[12.5px] text-[var(--fg-muted)] mt-2">{q.desc}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* Two-up: Continue + Daily puzzle / Friends */}
      <section className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6 mt-9">
        {/* Continue */}
        <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-elev)]">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
            <h3 className="text-xl font-medium tracking-tight">Continue</h3>
            <Link href="/play" className="text-[var(--fg-muted)] text-[13px] hover:text-[var(--fg)]">
              Archive →
            </Link>
          </div>
          <div className="p-3 flex flex-col">
            {CONTINUE_GAMES.map((g) => (
              <div
                key={g.opp}
                className="flex items-center gap-4 p-3 rounded-lg hover:bg-[var(--bg-elev-2)] transition-colors cursor-pointer"
              >
                <MiniBoard fen={g.fen} size={68} flat />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-[15px] font-medium tracking-tight truncate">
                      vs {g.opp}{" "}
                      <span className="font-mono text-[11px] font-normal text-[var(--fg-muted)]">
                        {g.rating}
                      </span>
                    </div>
                    {g.live && <span className="chip chip-green chip-dot">Live</span>}
                  </div>
                  <div className="text-[12.5px] text-[var(--fg-muted)] mt-0.5">
                    Move {g.moves} · last played {g.last} · playing {g.color}
                  </div>
                </div>
                <div
                  className={`font-mono text-[12px] font-medium whitespace-nowrap ${g.live ? "text-[var(--accent)]" : "text-[var(--fg-muted)]"}`}
                >
                  {g.status}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Daily puzzle + Friends */}
        <div className="flex flex-col gap-6">
          <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-elev)] p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[15px] font-medium tracking-tight">Daily puzzle</h3>
              <span className="chip">#1,847</span>
            </div>
            <div className="flex justify-center">
              <MiniBoard
                fen="r4rk1/ppp2ppp/2n1bq2/3p4/3P4/2N1B3/PPP1QPPP/R4RK1"
                size={240}
                fromSq="e6"
                captureSquares={["e3"]}
                flat
              />
            </div>
            <p className="text-[13px] text-[var(--fg-muted)] mt-3">
              <strong className="text-[var(--fg)]">Black to move.</strong> Find the winning combination.
            </p>
          </div>

          <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-elev)]">
            <div className="flex items-center justify-between px-[18px] py-3.5 border-b border-[var(--border)]">
              <h3 className="text-[15px] font-medium tracking-tight">Friends online</h3>
              <span className="text-[var(--fg-muted)] text-[12px]">4 of 12</span>
            </div>
            <div className="p-2">
              {FRIENDS.map((f) => (
                <div key={f.name} className="flex items-center gap-3 px-2.5 py-2">
                  <div
                    aria-hidden
                    className="size-7 rounded-full text-[11px] font-semibold text-white flex items-center justify-center flex-shrink-0"
                    style={{ background: "linear-gradient(135deg, #c8b896, #876f4e)" }}
                  >
                    {f.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-medium tracking-tight truncate">{f.name}</div>
                    <div className="text-[11.5px] text-[var(--fg-muted)]">
                      {f.rating} · {f.status}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" className="h-7 px-2.5 text-[12px]">
                    Challenge
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* All time controls strip — uses real shared TIME_CONTROLS */}
      <section className="mt-12 rounded-[10px] border border-[var(--border)] bg-[var(--bg-elev)] p-7">
        <div className="eyebrow">All time controls</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {TIME_CONTROLS.map((tc) => (
            <Link
              key={tc.id}
              href={`/play?tc=${encodeURIComponent(tc.id)}`}
              className="font-mono text-[13px] px-3 py-1.5 rounded-md border border-[var(--border-strong)] hover:border-[var(--fg)] hover:bg-[var(--bg-elev-2)] transition-colors"
            >
              {tc.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
