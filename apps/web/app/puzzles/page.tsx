"use client";
import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { Chess } from "chess.js";
import { Board } from "@/components/chess/board";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { toast } from "sonner";

type Puzzle = {
  id: string;
  fen: string;
  moves: string[]; // UCI; first is opponent's setup move
  rating: number;
  themes: string[];
  popularity: number;
  nbPlays: number;
};

type PuzzleData = {
  count: number;
  themes: { id: string; count: number }[];
  puzzles: Puzzle[];
};

type Session = {
  solved: number;
  failed: number;
  total: number;
  delta: number;
  puzzleRating: number;
};

const MAX_HISTORY = 20;
const RATING_WINDOW = 150; // ±150

// Theme labels (humanised) for the side panel.
const THEME_LABEL: Record<string, string> = {
  mate: "Mate",
  mateIn1: "Mate in 1",
  mateIn2: "Mate in 2",
  mateIn3: "Mate in 3",
  mateIn4: "Mate in 4+",
  fork: "Fork",
  pin: "Pin",
  skewer: "Skewer",
  crushing: "Crushing",
  advantage: "Advantage",
  equality: "Equality",
  middlegame: "Middlegame",
  endgame: "Endgame",
  opening: "Opening",
  short: "Short",
  long: "Long",
  hangingPiece: "Hanging piece",
  defensiveMove: "Defensive",
  attackingF2F7: "f2/f7 attack",
  discoveredAttack: "Discovered attack",
  doubleAttack: "Double attack",
  trappedPiece: "Trapped piece",
  sacrifice: "Sacrifice",
  intermezzo: "Zwischenzug",
  zugzwang: "Zugzwang",
  promotion: "Promotion",
  underPromotion: "Underpromotion",
  smotheredMate: "Smothered mate",
  backRankMate: "Back rank mate",
  enPassant: "En passant",
  castling: "Castling",
  exposedKing: "Exposed king",
  kingsideAttack: "Kingside attack",
  queensideAttack: "Queenside attack",
  capturingDefender: "Removing defender",
  deflection: "Deflection",
  attraction: "Attraction",
  interference: "Interference",
  xRayAttack: "X-ray attack",
  oneMove: "One-move",
  master: "Master games",
  superGM: "Super-GM",
};

function uciToObj(uci: string) {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci[4] as "q" | "r" | "b" | "n" | undefined,
  };
}

export default function PuzzlesPage() {
  return (
    <React.Suspense fallback={<div className="px-14 pt-9 pb-12" />}>
      <PuzzlesInner />
    </React.Suspense>
  );
}

function PuzzlesInner() {
  const search = useSearchParams();
  const router = useRouter();
  const { getToken, isLoaded, isSignedIn } = useAuth();

  const [data, setData] = React.useState<PuzzleData | null>(null);
  const [puzzle, setPuzzle] = React.useState<Puzzle | null>(null);
  const [game, setGame] = React.useState<Chess | null>(null);
  const [moveIdx, setMoveIdx] = React.useState(0); // index into puzzle.moves; opponent moves at even idx
  const [orientation, setOrientation] = React.useState<"white" | "black">("white");
  const [status, setStatus] = React.useState<
    "loading" | "ready" | "playing" | "solved" | "failed"
  >("loading");
  const [hintSquare, setHintSquare] = React.useState<string | null>(null);
  const [streak, setStreak] = React.useState(0);
  const [session, setSession] = React.useState<Session | null>(null);
  const [puzzleRating, setPuzzleRating] = React.useState(1200);
  const [delta, setDelta] = React.useState<number | null>(null);
  const [themeFilter, setThemeFilter] = React.useState<string | null>(
    () => search.get("theme")
  );

  const recordedRef = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/data/puzzles.json", { cache: "force-cache" });
      const json = (await res.json()) as PuzzleData;
      if (!cancelled) setData(json);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshSession = React.useCallback(async () => {
    if (!isSignedIn) return;
    const token = await getToken();
    if (!token) return;
    try {
      const s = await api<Session>("/me/puzzle-session", { token });
      setSession(s);
      setPuzzleRating(s.puzzleRating);
    } catch {
      /* ignore */
    }
  }, [getToken, isSignedIn]);

  React.useEffect(() => {
    if (isLoaded) refreshSession();
  }, [isLoaded, refreshSession]);

  // Load a specific puzzle.
  const loadPuzzle = React.useCallback(
    (p: Puzzle) => {
      const c = new Chess(p.fen);
      // The starting position is BEFORE the opponent's setup move. The user's
      // perspective is the side to move *after* that first move.
      const sideToMoveBefore = c.turn(); // 'w' | 'b'
      // After applying the setup move, it becomes the user's turn.
      setOrientation(sideToMoveBefore === "w" ? "black" : "white");
      setPuzzle(p);
      setGame(c);
      setMoveIdx(0);
      setHintSquare(null);
      setStatus("ready");
      setDelta(null);
      // Auto-play the setup move after a short pause.
      setTimeout(() => {
        try {
          const m = uciToObj(p.moves[0]!);
          c.move({ from: m.from, to: m.to, promotion: m.promotion ?? "q" });
          setGame(new Chess(c.fen()));
          setMoveIdx(1);
          setStatus("playing");
        } catch {
          toast.error("Could not load puzzle.");
        }
      }, 600);
    },
    []
  );

  // Decide which puzzle to load (URL param > themed pool > rating-banded pool).
  const pickAndLoad = React.useCallback(async () => {
    if (!data) return;
    const fromUrl = search.get("p");
    if (fromUrl) {
      const found = data.puzzles.find((p) => p.id === fromUrl);
      if (found) {
        loadPuzzle(found);
        return;
      }
    }
    let pool = data.puzzles.filter(
      (p) =>
        Math.abs(p.rating - puzzleRating) <= RATING_WINDOW &&
        (!themeFilter || p.themes.includes(themeFilter))
    );
    if (pool.length < 5) {
      // Widen.
      pool = data.puzzles.filter(
        (p) =>
          Math.abs(p.rating - puzzleRating) <= RATING_WINDOW * 2 &&
          (!themeFilter || p.themes.includes(themeFilter))
      );
    }
    if (pool.length === 0) pool = themeFilter
      ? data.puzzles.filter((p) => p.themes.includes(themeFilter))
      : data.puzzles;
    if (pool.length === 0) return;

    // Authenticated users: ask the worker which one is freshest.
    if (isSignedIn) {
      const token = await getToken();
      if (token) {
        try {
          const candidateIds = pool.slice(0, 80).map((p) => p.id);
          const res = await api<{ id: string; puzzleRating: number }>(
            "/puzzles/next",
            {
              method: "POST",
              token,
              body: JSON.stringify({ candidateIds }),
            }
          );
          setPuzzleRating(res.puzzleRating);
          const found = data.puzzles.find((p) => p.id === res.id);
          if (found) {
            loadPuzzle(found);
            return;
          }
        } catch {
          /* fallthrough to local pick */
        }
      }
    }
    const pick = pool[Math.floor(Math.random() * pool.length)]!;
    loadPuzzle(pick);
  }, [data, search, puzzleRating, themeFilter, isSignedIn, getToken, loadPuzzle]);

  React.useEffect(() => {
    if (data) pickAndLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const recordAttempt = React.useCallback(
    async (solved: boolean) => {
      if (!puzzle) return;
      if (recordedRef.current.has(puzzle.id)) return;
      recordedRef.current.add(puzzle.id);
      if (!isSignedIn) return;
      const token = await getToken();
      if (!token) return;
      try {
        const res = await api<{
          ratingBefore: number;
          ratingAfter: number;
        }>("/puzzles/attempt", {
          method: "POST",
          token,
          body: JSON.stringify({
            puzzleId: puzzle.id,
            puzzleRating: puzzle.rating,
            solved,
          }),
        });
        setPuzzleRating(res.ratingAfter);
        setDelta(res.ratingAfter - res.ratingBefore);
        refreshSession();
      } catch {
        /* ignore */
      }
    },
    [puzzle, isSignedIn, getToken, refreshSession]
  );

  const onMove = React.useCallback(
    (from: string, to: string, promotion?: "q" | "r" | "b" | "n"): boolean => {
      if (!puzzle || !game || status !== "playing") return false;
      const expected = puzzle.moves[moveIdx];
      if (!expected) return false;
      const actualUci = `${from}${to}${promotion ?? ""}`;
      const expectedNoPromo = expected.slice(0, 4);
      const expectedPromo = expected[4];

      // Validate that the move is legal in the position regardless.
      const candidate = new Chess(game.fen());
      let legalMove;
      try {
        legalMove = candidate.move({ from, to, promotion: promotion ?? "q" });
      } catch {
        return false;
      }
      if (!legalMove) return false;

      if (
        from + to === expectedNoPromo &&
        (!expectedPromo || expectedPromo === (promotion ?? legalMove.promotion))
      ) {
        // Correct move.
        const next = new Chess(candidate.fen());
        setGame(next);
        const newIdx = moveIdx + 1;
        setMoveIdx(newIdx);
        setHintSquare(null);
        if (newIdx >= puzzle.moves.length) {
          setStatus("solved");
          setStreak((s) => s + 1);
          recordAttempt(true);
          return true;
        }
        // Play opponent's response after a brief delay.
        setTimeout(() => {
          try {
            const opp = uciToObj(puzzle.moves[newIdx]!);
            const after = new Chess(next.fen());
            after.move({
              from: opp.from,
              to: opp.to,
              promotion: opp.promotion ?? "q",
            });
            setGame(after);
            setMoveIdx(newIdx + 1);
            if (newIdx + 1 >= puzzle.moves.length) {
              setStatus("solved");
              setStreak((s) => s + 1);
              recordAttempt(true);
            }
          } catch {
            /* shouldn't happen */
          }
        }, 350);
        return true;
      } else {
        // Wrong move — let the board snap back, mark fail.
        setStatus("failed");
        setStreak(0);
        recordAttempt(false);
        toast.error("Not the right move.");
        return false;
      }
    },
    [puzzle, game, status, moveIdx, recordAttempt]
  );

  const showHint = React.useCallback(() => {
    if (!puzzle || status !== "playing") return;
    const expected = puzzle.moves[moveIdx];
    if (!expected) return;
    setHintSquare(expected.slice(0, 2));
  }, [puzzle, status, moveIdx]);

  const skip = React.useCallback(() => {
    if (status === "solved" || status === "failed" || !puzzle) return;
    setStatus("failed");
    setStreak(0);
    recordAttempt(false);
  }, [puzzle, status, recordAttempt]);

  const next = React.useCallback(() => {
    setHintSquare(null);
    setDelta(null);
    router.replace("/puzzles");
    pickAndLoad();
  }, [router, pickAndLoad]);

  const customSquareStyles = React.useMemo<Record<string, React.CSSProperties>>(
    () =>
      hintSquare
        ? {
            [hintSquare]: {
              boxShadow: "inset 0 0 0 4px rgba(105,125,58,0.6)",
              borderRadius: 4,
            },
          }
        : {},
    [hintSquare]
  );

  // Stats / side panel widgets
  const streakDisplay = streak;
  const ratingForRing = Math.max(600, Math.min(2400, puzzleRating));
  const ringPct = Math.round(((ratingForRing - 600) / (2400 - 600)) * 100);

  return (
    <div className="flex-1 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] min-h-0">
      <div className="flex flex-col items-center justify-center gap-5 p-10">
        <div className="flex items-center justify-between w-[540px] max-w-full">
          <div className="flex flex-col gap-1">
            <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--fg-muted)]">
              Puzzle {puzzle ? `#${puzzle.id}` : "…"}
            </div>
            <div className="text-[20px] font-medium tracking-tight">
              {puzzle
                ? `${orientation === "white" ? "White" : "Black"} to move${
                    puzzle.themes.includes("mateIn1")
                      ? " · Mate in 1"
                      : puzzle.themes.includes("mateIn2")
                        ? " · Mate in 2"
                        : puzzle.themes.includes("mateIn3")
                          ? " · Mate in 3"
                          : ""
                  }`
                : "Loading…"}
            </div>
          </div>
          <span
            className="chip chip-green chip-dot"
            style={{ visibility: streakDisplay > 0 ? "visible" : "hidden" }}
          >
            Streak: {streakDisplay}
          </span>
        </div>

        {game ? (
          <div style={{ width: 540 }}>
            <Board
              fen={game.fen()}
              orientation={orientation}
              onMove={onMove}
              arePiecesDraggable={status === "playing"}
              customSquareStyles={customSquareStyles}
            />
          </div>
        ) : (
          <div
            className="rounded-lg border border-[var(--border)] bg-[var(--bg-elev)]"
            style={{ width: 540, aspectRatio: "1" }}
          />
        )}

        <div className="flex items-center gap-2 min-h-[40px]">
          {status === "playing" && (
            <>
              <Button variant="outline" onClick={showHint}>
                ⚡ Hint
              </Button>
              <Button variant="ghost" onClick={skip}>
                Skip
              </Button>
            </>
          )}
          {status === "solved" && (
            <>
              <span className="chip chip-green">
                Solved{delta !== null && delta !== 0 ? ` · ${delta > 0 ? "+" : ""}${delta}` : ""}
              </span>
              <Button onClick={next}>Next puzzle →</Button>
            </>
          )}
          {status === "failed" && (
            <>
              <span className="chip chip-red">
                Missed{delta !== null && delta !== 0 ? ` · ${delta}` : ""}
              </span>
              <Button onClick={next}>Try another →</Button>
            </>
          )}
        </div>
      </div>

      <aside className="border-l border-[var(--border)] px-7 py-8 flex flex-col gap-7 overflow-y-auto">
        <div className="flex flex-col items-center gap-3">
          <div
            className="size-[120px] rounded-full flex items-center justify-center"
            style={{
              background: `conic-gradient(var(--accent) ${ringPct}%, var(--bg-elev-2) 0)`,
            }}
          >
            <div className="size-[100px] rounded-full bg-[var(--bg-elev)] flex flex-col items-center justify-center">
              <div className="font-serif text-[32px] leading-none tracking-tight">
                {puzzleRating.toLocaleString()}
              </div>
              <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--fg-muted)] mt-1">
                Puzzle rating
              </div>
            </div>
          </div>
          {session && (
            <div className="flex gap-2">
              {session.delta !== 0 && (
                <span className={session.delta > 0 ? "chip chip-green" : "chip chip-red"}>
                  {session.delta > 0 ? "+" : ""}
                  {session.delta} today
                </span>
              )}
              <span className="chip">{session.solved + session.failed} attempts today</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="text-[15px] font-medium tracking-tight">
            Themes for this puzzle
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(puzzle?.themes ?? []).map((t) => (
              <span key={t} className="chip">
                {THEME_LABEL[t] ?? t}
              </span>
            ))}
            {!puzzle && <span className="chip">…</span>}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="text-[15px] font-medium tracking-tight">Today's session</div>
            {session && (
              <span className="font-mono text-[12px] text-[var(--fg-muted)]">
                {session.solved + session.failed} attempts
              </span>
            )}
          </div>
          {session ? (
            <div className="text-[12.5px] text-[var(--fg-muted)]">
              {session.solved} solved · {session.failed} missed
              {session.delta !== 0 ? ` · ${session.delta > 0 ? "+" : ""}${session.delta} rating` : ""}
            </div>
          ) : (
            <div className="text-[12.5px] text-[var(--fg-muted)]">
              {isSignedIn ? "Loading…" : "Sign in to track progress"}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="text-[15px] font-medium tracking-tight">Train a theme</div>
            {themeFilter && (
              <button
                type="button"
                onClick={() => {
                  setThemeFilter(null);
                  setTimeout(pickAndLoad, 0);
                }}
                className="text-[11px] text-[var(--fg-muted)] hover:text-[var(--fg)]"
              >
                Clear
              </button>
            )}
          </div>
          <div className="flex flex-col gap-1.5 mt-1 max-h-[260px] overflow-y-auto pr-1">
            {(data?.themes ?? []).slice(0, 16).map((t) => {
              const on = themeFilter === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    setThemeFilter(on ? null : t.id);
                    setTimeout(pickAndLoad, 0);
                  }}
                  className="flex items-center justify-between px-3 py-2 rounded-md border transition-colors text-left"
                  style={{
                    borderColor: on ? "var(--fg)" : "var(--border)",
                    background: on ? "var(--bg-elev-2)" : "transparent",
                  }}
                >
                  <span className="text-[13.5px]">{THEME_LABEL[t.id] ?? t.id}</span>
                  <span className="font-mono text-[11px] text-[var(--fg-muted)]">
                    {t.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </aside>
    </div>
  );
}
