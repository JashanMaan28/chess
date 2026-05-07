"use client";
import * as React from "react";
import Link from "next/link";
import { useAuth, SignedIn, SignedOut } from "@clerk/nextjs";
import { TIME_CONTROLS } from "@chess/shared/time-controls";
import { Button } from "@/components/ui/button";
import { MiniBoard } from "@/components/chess/mini-board";
import { ChallengeDialog } from "@/components/challenge-dialog";
import { api } from "@/lib/api";

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

type RecentGame = {
  id: string;
  whiteId: string;
  blackId: string;
  whiteUsername: string;
  blackUsername: string;
  result: string;
  timeControl: string;
  endedAt: number;
  pgn: string;
};

type Follow = {
  clerkId: string;
  username: string;
  eloBlitz: number;
  eloBullet: number;
  eloRapid: number;
  mutual: boolean;
  lastSeenAt: number | null;
};

type Opponent = {
  clerkId: string;
  username: string;
  eloBlitz: number;
};

// Lichess-style "online-ish" heuristic: had a finished game in the last 10 min.
const ONLINE_WINDOW_MS = 10 * 60 * 1000;

function lastSeenLabel(ms: number | null): string {
  if (!ms) return "Idle";
  const diff = Date.now() - ms;
  if (diff < ONLINE_WINDOW_MS) return "Just played";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return "Long ago";
}

function endFenFromPgn(pgn: string): string {
  // Very lightweight: replay would need chess.js. We render the start FEN and
  // overlay the last move text instead — keeping the home page snappy.
  return "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";
}

function lastMoveOf(pgn: string): { san: string; ply: number } {
  const trimmed = pgn.replace(/\{[^}]*\}/g, "").trim();
  const tokens = trimmed.split(/\s+/).filter((t) => !/^\d+\.+$/.test(t));
  // Drop trailing result token if present.
  const last = tokens[tokens.length - 1];
  const validResult = last && ["1-0", "0-1", "1/2-1/2", "*"].includes(last);
  const moves = validResult ? tokens.slice(0, -1) : tokens;
  return {
    san: moves[moves.length - 1] || "—",
    ply: moves.length,
  };
}

export default function LandingLobbyPage() {
  return (
    <>
      <SignedOut>
        <SignedOutLanding />
      </SignedOut>
      <SignedIn>
        <SignedInLobby />
      </SignedIn>
    </>
  );
}

function SignedOutLanding() {
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return (
    <div className="px-14 pt-9 pb-12 max-w-[1280px] mx-auto w-full">
      <div className="flex items-end justify-between mb-7 gap-6 flex-wrap">
        <div>
          <div className="eyebrow mb-1.5">{today}</div>
          <h1 className="h-display">
            Quiet, modern <em className="font-serif italic">chess</em>.
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" asChild>
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild>
            <Link href="/sign-up">Create account</Link>
          </Button>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-medium tracking-tight">Quick play</h2>
          <Link
            href="/play"
            className="text-[var(--fg-muted)] text-[13px] hover:text-[var(--fg)]"
          >
            All time controls →
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {QUICK_PLAY.map((q) => (
            <Link
              key={q.id}
              href={`/play?tc=${encodeURIComponent(q.id)}`}
              className="qp-card"
            >
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

function SignedInLobby() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [me, setMe] = React.useState<{ username: string; onboardedAt: number | null } | null>(null);
  const [recent, setRecent] = React.useState<RecentGame[] | null>(null);
  const [follows, setFollows] = React.useState<Follow[] | null>(null);
  const [opponents, setOpponents] = React.useState<Opponent[] | null>(null);

  React.useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    (async () => {
      const token = await getToken();
      if (!token) return;
      try {
        const [meRes, gamesRes, followsRes, opponentsRes] = await Promise.all([
          api<{ username: string; onboardedAt: number | null }>("/me", { token }),
          api<{ games: RecentGame[] }>("/me/recent-games", { token }),
          api<{ follows: Follow[] }>("/me/follows", { token }),
          api<{ opponents: Opponent[] }>("/me/recent-opponents", { token }),
        ]);
        if (cancelled) return;
        setMe(meRes);
        setRecent(gamesRes.games);
        setFollows(followsRes.follows);
        setOpponents(opponentsRes.opponents);
      } catch {
        /* worker may be down — keep skeleton */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, getToken]);

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const hour = new Date().getHours();
  const greeting =
    hour < 5 ? "Up late" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const mutualFriendsOnline = (follows ?? []).filter(
    (f) => f.mutual && f.lastSeenAt && Date.now() - f.lastSeenAt < ONLINE_WINDOW_MS
  ).length;

  return (
    <div className="px-14 pt-9 pb-12 max-w-[1280px] mx-auto w-full">
      <div className="flex items-end justify-between mb-7 gap-6 flex-wrap">
        <div>
          <div className="eyebrow mb-1.5">{today}</div>
          <h1 className="h-display">
            {greeting},{" "}
            <em className="font-serif italic">
              {me?.username ?? "friend"}
            </em>
            .
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {follows !== null && (
            <span className="chip chip-green chip-dot">
              {mutualFriendsOnline} friend{mutualFriendsOnline === 1 ? "" : "s"} active
            </span>
          )}
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
          <Link
            href="/play"
            className="text-[var(--fg-muted)] text-[13px] hover:text-[var(--fg)]"
          >
            All time controls →
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {QUICK_PLAY.map((q) => (
            <Link
              key={q.id}
              href={`/play?tc=${encodeURIComponent(q.id)}`}
              className="qp-card"
            >
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

      {/* Two-up: Recent + Friends */}
      <section className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6 mt-9">
        <RecentGamesCard games={recent} username={me?.username} />
        <div className="flex flex-col gap-6">
          <DailyPuzzleCard />
          <FriendsCard follows={follows} />
        </div>
      </section>

      {/* Recent opponents — only shown if any exist */}
      {opponents && opponents.length > 0 && (
        <section className="mt-9">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-medium tracking-tight">Recent opponents</h2>
            <span className="text-[var(--fg-muted)] text-[13px]">
              {opponents.length} most recent
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {opponents.map((o) => (
              <div
                key={o.clerkId}
                className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-elev)] p-4 flex items-center gap-3"
              >
                <div
                  aria-hidden
                  className="size-9 rounded-full text-[12px] font-semibold text-white flex items-center justify-center flex-shrink-0"
                  style={{ background: "linear-gradient(135deg, #c8b896, #876f4e)" }}
                >
                  {o.username[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/u/${o.username}`}
                    className="text-[14px] font-medium tracking-tight truncate block hover:underline"
                  >
                    {o.username}
                  </Link>
                  <div className="font-mono text-[11px] text-[var(--fg-muted)]">
                    Blitz {o.eloBlitz}
                  </div>
                </div>
                <ChallengeDialog
                  username={o.username}
                  trigger={
                    <Button size="sm" variant="outline" className="h-7 px-2.5 text-[12px]">
                      Rematch
                    </Button>
                  }
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* All time controls */}
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

function RecentGamesCard({
  games,
  username,
}: {
  games: RecentGame[] | null;
  username?: string;
}) {
  return (
    <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-elev)]">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
        <h3 className="text-xl font-medium tracking-tight">Continue</h3>
        {username && (
          <Link
            href={`/u/${username}/games`}
            className="text-[var(--fg-muted)] text-[13px] hover:text-[var(--fg)]"
          >
            Archive →
          </Link>
        )}
      </div>
      <div className="p-3 flex flex-col">
        {games === null ? (
          <div className="px-3 py-8 text-[13px] text-[var(--fg-muted)]">Loading…</div>
        ) : games.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <div className="text-[14px] mb-3">No games yet — play your first.</div>
            <Button asChild>
              <Link href="/play">Find a match</Link>
            </Button>
          </div>
        ) : (
          games.slice(0, 4).map((g) => {
            const iAmWhite = g.whiteUsername === username;
            const opp = iAmWhite ? g.blackUsername : g.whiteUsername;
            const myColor = iAmWhite ? "white" : "black";
            const result =
              g.result === "1/2-1/2"
                ? "Draw"
                : (g.result === "1-0" && iAmWhite) || (g.result === "0-1" && !iAmWhite)
                  ? "Won"
                  : "Lost";
            const last = lastMoveOf(g.pgn);
            return (
              <Link
                key={g.id}
                href={`/game/${g.id}`}
                className="flex items-center gap-4 p-3 rounded-lg hover:bg-[var(--bg-elev-2)] transition-colors"
              >
                <MiniBoard fen={endFenFromPgn(g.pgn)} size={68} flat />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-[15px] font-medium tracking-tight truncate">
                      vs {opp}
                    </div>
                    <span className="font-mono text-[11px] text-[var(--fg-muted)]">
                      {g.timeControl}
                    </span>
                  </div>
                  <div className="text-[12.5px] text-[var(--fg-muted)] mt-0.5">
                    Move {Math.ceil(last.ply / 2)} · last {last.san} · played {myColor}
                  </div>
                </div>
                <div
                  className={`font-mono text-[12px] font-medium whitespace-nowrap ${
                    result === "Won"
                      ? "text-[var(--accent)]"
                      : result === "Lost"
                        ? "text-[var(--danger)]"
                        : "text-[var(--fg-muted)]"
                  }`}
                >
                  {result}
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}

function DailyPuzzleCard() {
  // Picks a deterministic puzzle for "today" so it's the same for every visitor.
  const [puzzle, setPuzzle] = React.useState<{
    id: string;
    fen: string;
    rating: number;
  } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/data/puzzles.json", { cache: "force-cache" });
        if (!res.ok) return;
        const json = (await res.json()) as {
          puzzles: { id: string; fen: string; rating: number }[];
        };
        if (cancelled) return;
        const today = new Date();
        const seed =
          today.getUTCFullYear() * 10000 +
          (today.getUTCMonth() + 1) * 100 +
          today.getUTCDate();
        const idx = seed % json.puzzles.length;
        setPuzzle(json.puzzles[idx] ?? null);
      } catch {
        /* leave null */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-elev)] p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[15px] font-medium tracking-tight">Daily puzzle</h3>
        {puzzle && <span className="chip">~{puzzle.rating}</span>}
      </div>
      <div className="flex justify-center">
        <Link href={puzzle ? `/puzzles?p=${puzzle.id}` : "/puzzles"} className="block">
          <MiniBoard
            fen={puzzle?.fen ?? "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"}
            size={240}
            flat
          />
        </Link>
      </div>
      <p className="text-[13px] text-[var(--fg-muted)] mt-3">
        <strong className="text-[var(--fg)]">Find the best move.</strong>{" "}
        <Link href="/puzzles" className="underline decoration-dotted hover:text-[var(--fg)]">
          Open puzzle trainer →
        </Link>
      </p>
    </div>
  );
}

function FriendsCard({ follows }: { follows: Follow[] | null }) {
  const sorted = React.useMemo(() => {
    if (!follows) return null;
    // Mutual + recently active first.
    return [...follows].sort((a, b) => {
      if (a.mutual !== b.mutual) return a.mutual ? -1 : 1;
      return (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0);
    });
  }, [follows]);

  return (
    <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-elev)]">
      <div className="flex items-center justify-between px-[18px] py-3.5 border-b border-[var(--border)]">
        <h3 className="text-[15px] font-medium tracking-tight">Friends</h3>
        {sorted && (
          <span className="text-[var(--fg-muted)] text-[12px]">
            {sorted.length} following
          </span>
        )}
      </div>
      <div className="p-2">
        {sorted === null ? (
          <div className="p-3 text-[13px] text-[var(--fg-muted)]">Loading…</div>
        ) : sorted.length === 0 ? (
          <div className="p-3 text-[13px] text-[var(--fg-muted)]">
            Follow players from their profile to see them here.
          </div>
        ) : (
          sorted.slice(0, 6).map((f) => (
            <div key={f.clerkId} className="flex items-center gap-3 px-2.5 py-2">
              <div
                aria-hidden
                className="size-7 rounded-full text-[11px] font-semibold text-white flex items-center justify-center flex-shrink-0 relative"
                style={{ background: "linear-gradient(135deg, #c8b896, #876f4e)" }}
              >
                {f.username[0]?.toUpperCase()}
                {f.lastSeenAt &&
                  Date.now() - f.lastSeenAt < ONLINE_WINDOW_MS && (
                    <span
                      className="absolute -right-0.5 -bottom-0.5 size-2 rounded-full"
                      style={{
                        background: "var(--accent)",
                        boxShadow: "0 0 0 1.5px var(--bg-elev)",
                      }}
                      aria-label="active"
                    />
                  )}
              </div>
              <div className="flex-1 min-w-0">
                <Link
                  href={`/u/${f.username}`}
                  className="text-[13.5px] font-medium tracking-tight truncate block hover:underline"
                >
                  {f.username}
                  {f.mutual && (
                    <span className="ml-1.5 text-[10px] font-mono text-[var(--accent)] uppercase tracking-[0.08em]">
                      mutual
                    </span>
                  )}
                </Link>
                <div className="text-[11.5px] text-[var(--fg-muted)]">
                  {f.eloBlitz} · {lastSeenLabel(f.lastSeenAt)}
                </div>
              </div>
              <ChallengeDialog
                username={f.username}
                trigger={
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2.5 text-[12px]"
                  >
                    Challenge
                  </Button>
                }
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
