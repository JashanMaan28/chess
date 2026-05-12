"use client";
import * as React from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { Chess } from "chess.js";
import { Board } from "@/components/chess/board";
import { Clock } from "@/components/chess/clock";
import { MoveList } from "@/components/chess/move-list";
import { ChatPanel } from "@/components/chess/chat-panel";
import { CapturedPieces, captureSummary } from "@/components/chess/captured-pieces";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GameWS } from "@/lib/ws-client";
import type {
  ServerMsg,
  StateMsg,
  Color,
  ColorOrSpectator,
  ChatMsg,
} from "@chess/shared/protocol";
import { Download, Flag, Handshake, Loader2, Wifi, WifiOff, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type GameState = Omit<StateMsg, "t"> & { you: ColorOrSpectator };

export default function GamePage() {
  const { id } = useParams<{ id: string }>();
  const { getToken, isLoaded } = useAuth();

  const [state, setState] = React.useState<GameState | null>(null);
  const [status, setStatus] = React.useState<"connecting" | "open" | "closed">("connecting");
  const [selectedPly, setSelectedPly] = React.useState<number>(-2); // -2 = follow live
  const [selectedSquare, setSelectedSquare] = React.useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = React.useState<{ from: string; to: string } | null>(null);
  const [endDialogOpen, setEndDialogOpen] = React.useState(false);
  const [endInfo, setEndInfo] = React.useState<{
    result: string;
    termination: string;
    elo?: { w: { before: number; after: number }; b: { before: number; after: number } };
  } | null>(null);

  // Local clock ticking
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 100);
    return () => clearInterval(i);
  }, []);

  const wsRef = React.useRef<GameWS | null>(null);

  React.useEffect(() => {
    if (!isLoaded) return;
    // Persist active game id for reconnection UX
    try {
      localStorage.setItem("activeGameId", id);
    } catch {
      // ignore
    }
    // Pass getToken through so the WS layer can fetch a fresh JWT on every
    // (re)connect — Clerk handles caching/refresh internally, so a stale token
    // never demotes a player to spectator mid-game.
    const ws = new GameWS({
      gameId: id,
      getToken: () => getToken().catch(() => null),
      handlers: {
        onStatus: setStatus,
        onMessage: (msg: ServerMsg) => handleServerMsg(msg),
      },
    });
    wsRef.current = ws;
    void ws.connect();
    return () => {
      wsRef.current?.close();
    };
  }, [id, isLoaded, getToken]);

  const handleServerMsg = (msg: ServerMsg) => {
    if (msg.t === "state") {
      const rest = { ...msg } as Omit<typeof msg, "t"> & { t?: string };
      delete rest.t;
      setState({ ...(rest as Omit<StateMsg, "t">), you: msg.you ?? "spectator" } as GameState);
      // Reset clock anchor: server already deducted current side's clock.
      anchorClocks(rest.fen, rest.clocks, rest.turn);
    } else if (msg.t === "move") {
      setState((prev) => {
        if (!prev) return prev;
        const moves = [...prev.moves, { san: msg.san, from: msg.from, to: msg.to, promo: msg.promo }];
        return { ...prev, fen: msg.fen, clocks: msg.clocks, turn: msg.turn, moves };
      });
      anchorClocks(msg.fen, msg.clocks, msg.turn);
      // Auto-follow live unless user is scrubbing
      setSelectedPly((p) => (p === -2 ? -2 : p));
    } else if (msg.t === "chat") {
      setState((prev) =>
        prev
          ? { ...prev, chat: [...prev.chat, { from: msg.from, text: msg.text, at: msg.at }] }
          : prev
      );
    } else if (msg.t === "draw_offer") {
      setState((prev) => (prev ? { ...prev, drawOfferFrom: msg.from } : prev));
      if (state?.you === "w" && msg.from === "b") toast("Black offered a draw");
      if (state?.you === "b" && msg.from === "w") toast("White offered a draw");
    } else if (msg.t === "draw_decline") {
      setState((prev) => (prev ? { ...prev, drawOfferFrom: null } : prev));
    } else if (msg.t === "presence") {
      setState((prev) =>
        prev
          ? {
              ...prev,
              players: {
                white: prev.players.white && { ...prev.players.white, connected: msg.white },
                black: prev.players.black && { ...prev.players.black, connected: msg.black },
              },
            }
          : prev
      );
    } else if (msg.t === "end") {
      setEndInfo({ result: msg.result, termination: msg.termination, elo: msg.elo });
      setEndDialogOpen(true);
      try {
        localStorage.removeItem("activeGameId");
      } catch {
        // ignore
      }
    } else if (msg.t === "error") {
      toast.error(msg.msg);
    }
  };

  // ----- Local clock interpolation -----
  const clockAnchor = React.useRef<{
    serverClocks: { w: number; b: number };
    turn: Color;
    at: number;
  } | null>(null);
  const anchorClocks = (_fen: string, clocks: { w: number; b: number }, turn: Color) => {
    clockAnchor.current = { serverClocks: { ...clocks }, turn, at: Date.now() };
  };
  const liveClocks = (): { w: number; b: number } => {
    const a = clockAnchor.current;
    if (!a || state?.result !== "*") return state?.clocks || { w: 0, b: 0 };
    // Pregame: clocks are frozen on the server until both players have moved
    // (moves.length >= 2). Mirror that here so the displayed clock doesn't
    // tick visibly while no time is actually being deducted.
    const pregame = (state?.moves.length ?? 0) < 2;
    if (pregame) return a.serverClocks;
    const elapsed = Date.now() - a.at;
    return {
      w: a.turn === "w" ? Math.max(0, a.serverClocks.w - elapsed) : a.serverClocks.w,
      b: a.turn === "b" ? Math.max(0, a.serverClocks.b - elapsed) : a.serverClocks.b,
    };
  };

  // ----- Move attempt -----
  const tryMove = (from: string, to: string, promo?: "q" | "r" | "b" | "n"): boolean => {
    if (!state) return false;
    if (state.you !== "w" && state.you !== "b") return false;
    if (state.turn !== state.you) return false;
    if (state.result && state.result !== "*") return false;
    // Local validation for snappy UX
    const tmp = new Chess();
    try {
      const c = new Chess();
      c.loadPgn(buildPgn(state.moves));
      const m = c.move({ from, to, promotion: promo });
      if (!m) return false;
      void tmp;
    } catch {
      return false;
    }
    wsRef.current?.send({ t: "move", from, to, promo });
    return true;
  };

  // ----- Scrub: which FEN to render -----
  const liveFen = state?.fen ?? "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const renderFen = React.useMemo(() => {
    if (!state) return liveFen;
    if (selectedPly === -2 || selectedPly === state.moves.length - 1) return state.fen;
    if (selectedPly === -1) return "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    try {
      const c = new Chess();
      for (let i = 0; i <= selectedPly; i++) {
        const m = state.moves[i]!;
        c.move({ from: m.from, to: m.to, promotion: m.promo });
      }
      return c.fen();
    } catch {
      return state.fen;
    }
  }, [state, selectedPly, liveFen]);

  const orientation: "white" | "black" = state?.you === "b" ? "black" : "white";
  const draggable =
    state?.you === state?.turn && (state?.you === "w" || state?.you === "b") && state?.result === "*"
      && (selectedPly === -2 || selectedPly === (state?.moves.length ?? 0) - 1);

  const clocks = state ? liveClocks() : { w: 0, b: 0 };

  // ----- Actions -----
  const sendChat = (text: string) => wsRef.current?.send({ t: "chat", text });
  const resign = () => {
    if (!confirm("Resign this game?")) return;
    wsRef.current?.send({ t: "resign" });
  };
  const offerDraw = () => wsRef.current?.send({ t: "draw_offer" });
  const acceptDraw = () => wsRef.current?.send({ t: "draw_accept" });
  const declineDraw = () => wsRef.current?.send({ t: "draw_decline" });

  const downloadPgn = () => {
    if (!state) return;
    const pgn = buildPgn(state.moves);
    const blob = new Blob([pgn || "*"], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${id}.pgn`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ----- Highlight last move squares -----
  const lastMove = state && state.moves.length > 0 ? state.moves[state.moves.length - 1] : null;
  // When scrubbing, "last move" is the move at selectedPly (if any).
  const scrubbedLastMove = React.useMemo(() => {
    if (!state) return null;
    if (selectedPly === -2 || selectedPly === state.moves.length - 1) return lastMove;
    if (selectedPly < 0) return null;
    return state.moves[selectedPly] ?? null;
  }, [state, selectedPly, lastMove]);
  const squareStyles: Record<string, React.CSSProperties> = {};
  if (scrubbedLastMove) {
    squareStyles[scrubbedLastMove.from] = { background: "var(--board-last-move)" };
    squareStyles[scrubbedLastMove.to] = { background: "var(--board-last-move)" };
  }

  // ----- Legal-move overlay for the currently selected piece -----
  const { legalMoves, captureMoves } = React.useMemo(() => {
    if (!selectedSquare || !state) return { legalMoves: [] as string[], captureMoves: [] as string[] };
    try {
      const c = new Chess(state.fen);
      // Use renderFen so review-mode highlights match the displayed position.
      const fen = (() => {
        if (selectedPly === -2 || selectedPly === state.moves.length - 1) return state.fen;
        if (selectedPly === -1) return new Chess().fen();
        const cc = new Chess();
        for (let i = 0; i <= selectedPly; i++) {
          const m = state.moves[i]!;
          cc.move({ from: m.from, to: m.to, promotion: m.promo });
        }
        return cc.fen();
      })();
      const cc = new Chess(fen);
      const moves = cc.moves({ square: selectedSquare as never, verbose: true }) as Array<{
        to: string;
        flags: string;
      }>;
      const targets = moves.map((m) => m.to);
      const captures = moves.filter((m) => /[ce]/.test(m.flags)).map((m) => m.to);
      void c;
      return { legalMoves: targets, captureMoves: captures };
    } catch {
      return { legalMoves: [], captureMoves: [] };
    }
  }, [selectedSquare, state, selectedPly]);

  // ----- Click-to-move handler -----
  const onSquareClick = React.useCallback(
    (sq: string) => {
      if (!state) return;
      // If we're scrubbing in review mode, just preview legal moves at that ply.
      const reviewing = state.result !== "*" || !draggable;
      const c = new Chess(renderFen);
      const piece = c.get(sq as never) as { color: "w" | "b"; type: string } | null;

      // Click-on-target → submit move (only when it's the user's turn).
      if (selectedSquare && legalMoves.includes(sq) && !reviewing) {
        const mover = c.get(selectedSquare as never) as { color: "w" | "b"; type: string } | null;
        if (mover?.type === "p" && (sq[1] === "8" || sq[1] === "1")) {
          setPendingPromotion({ from: selectedSquare, to: sq });
          setSelectedSquare(null);
          return;
        }
        const ok = tryMove(selectedSquare, sq);
        setSelectedSquare(null);
        if (!ok) return;
        return;
      }
      // Click-on-own-piece (live) or any piece (reviewing) → highlight.
      if (piece) {
        if (reviewing || piece.color === state.you) {
          setSelectedSquare((cur) => (cur === sq ? null : sq));
          return;
        }
      }
      // Empty square or opponent piece → clear.
      setSelectedSquare(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, selectedSquare, legalMoves, renderFen]
  );

  // Clear selection if the displayed position changes (e.g. opponent moved).
  React.useEffect(() => {
    setSelectedSquare(null);
    setPendingPromotion(null);
  }, [renderFen]);

  // Keyboard scrubbing in review mode.
  React.useEffect(() => {
    if (!state || state.result === "*") return;
    const total = state.moves.length;
    if (total === 0) return;
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA")) return;
      const cur = selectedPly === -2 ? total - 1 : selectedPly;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setSelectedPly(Math.max(-1, cur - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setSelectedPly(Math.min(total - 1, cur + 1));
      } else if (e.key === "Home") {
        e.preventDefault();
        setSelectedPly(-1);
      } else if (e.key === "End") {
        e.preventDefault();
        setSelectedPly(-2);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, selectedPly]);

  if (!state) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  const isPlayer = state.you === "w" || state.you === "b";
  const opponentColor: Color = state.you === "w" ? "b" : "w";
  const drawOfferFromOpponent =
    isPlayer && state.drawOfferFrom && state.drawOfferFrom === opponentColor;

  const topColor: Color = state.you === "b" ? "w" : "b";
  const bottomColor: Color = state.you === "b" ? "b" : "w";
  const topPlayer = topColor === "w" ? state.players.white : state.players.black;
  const bottomPlayer = bottomColor === "w" ? state.players.white : state.players.black;
  const isOver = state.result !== "*";

  const { capturedByWhite, capturedByBlack, whiteAdvantage } = captureSummary(renderFen);
  const advantageByColor: Record<Color, number> = {
    w: Math.max(0, whiteAdvantage),
    b: Math.max(0, -whiteAdvantage),
  };

  // ----- Review scrub controls -----
  const totalPly = state.moves.length;
  const currentPly = selectedPly === -2 ? totalPly - 1 : selectedPly;
  const goToPly = (p: number) => setSelectedPly(Math.max(-1, Math.min(totalPly - 1, p)));
  const onPrev = () => goToPly(currentPly - 1);
  const onNext = () => goToPly(currentPly + 1);
  const onStart = () => goToPly(-1);
  const onEnd = () => setSelectedPly(-2);

  return (
    <div className="px-3 sm:px-6 lg:px-10 py-4 sm:py-6 lg:py-8 max-w-[1280px] mx-auto w-full">
      {isOver && state.result && (
        <ResultBanner
          result={state.result}
          termination={state.termination}
          you={state.you}
          white={state.players.white?.username ?? "white"}
          black={state.players.black?.username ?? "black"}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6 lg:gap-8">
        {/* Board column */}
        <div className="flex flex-col gap-3 w-full max-w-full lg:max-w-[720px] mx-auto lg:mx-0 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <PlayerCard
              player={topPlayer}
              color={topColor}
              active={state.turn === topColor && !isOver}
              captured={topColor === "w" ? capturedByWhite : capturedByBlack}
              advantage={advantageByColor[topColor]}
            />
            {!isOver && (
              <Clock
                ms={clocks[topColor]}
                active={state.turn === topColor && state.result === "*"}
                low={clocks[topColor] < 20_000}
              />
            )}
          </div>
          <Board
            fen={renderFen}
            orientation={orientation}
            arePiecesDraggable={draggable}
            onMove={tryMove}
            customSquareStyles={squareStyles}
            selectedSquare={selectedSquare}
            legalMoves={legalMoves}
            captureSquares={captureMoves}
            onSquareClick={onSquareClick}
          />
          <div className="flex items-center justify-between gap-3">
            <PlayerCard
              player={bottomPlayer}
              color={bottomColor}
              active={state.turn === bottomColor && !isOver}
              captured={bottomColor === "w" ? capturedByWhite : capturedByBlack}
              advantage={advantageByColor[bottomColor]}
            />
            {!isOver && (
              <Clock
                ms={clocks[bottomColor]}
                active={state.turn === bottomColor && state.result === "*"}
                low={clocks[bottomColor] < 20_000}
              />
            )}
          </div>

          {/* Review scrubber for ended games */}
          {isOver && totalPly > 0 && (
            <div className="flex items-center justify-between gap-2 mt-1 px-3 py-2 rounded-md border border-[var(--border)] bg-[var(--bg-elev)]">
              <div className="font-mono text-[11px] text-[var(--fg-muted)] uppercase tracking-[0.1em]">
                Move {Math.floor((currentPly + 2) / 2) || 0} of {Math.ceil(totalPly / 2)}
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={onStart} title="Start" className="h-8 w-8 p-0">
                  <ChevronsLeft className="size-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={onPrev} title="Prev" className="h-8 w-8 p-0">
                  <ChevronLeft className="size-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={onNext} title="Next" className="h-8 w-8 p-0">
                  <ChevronRight className="size-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={onEnd} title="End" className="h-8 w-8 p-0">
                  <ChevronsRight className="size-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Status bar — only meaningful while live */}
          {!isOver && (
            <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-[var(--fg-muted)] pt-2">
              <div className="flex items-center gap-2">
                {status === "open" ? (
                  <>
                    <Wifi className="size-3.5 text-[var(--success)]" /> connected
                  </>
                ) : status === "connecting" ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" /> connecting
                  </>
                ) : (
                  <>
                    <WifiOff className="size-3.5 text-[var(--danger)]" /> reconnecting
                  </>
                )}
              </div>
              <div>
                {state.you === "w" ? "you · white" : state.you === "b" ? "you · black" : "spectating"}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-4 lg:max-h-[calc(100vh-7rem)]">
          <Card className="flex-1 flex flex-col min-h-[260px] overflow-hidden">
            <MoveList
              moves={state.moves}
              selectedPly={
                selectedPly === -2 ? state.moves.length - 1 : selectedPly
              }
              onSelect={(p) => setSelectedPly(p)}
            />
          </Card>

          {isPlayer && !isOver && (
            <Card>
              <div className="p-3 flex flex-wrap gap-2">
                {drawOfferFromOpponent ? (
                  <>
                    <Badge variant="default">Draw offered</Badge>
                    <Button size="sm" variant="default" onClick={acceptDraw}>
                      Accept
                    </Button>
                    <Button size="sm" variant="ghost" onClick={declineDraw}>
                      Decline
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" variant="outline" onClick={offerDraw}>
                      <Handshake className="size-3.5" /> Offer draw
                    </Button>
                    <Button size="sm" variant="destructive" onClick={resign}>
                      <Flag className="size-3.5" /> Resign
                    </Button>
                  </>
                )}
              </div>
            </Card>
          )}

          {isOver && (
            <Card>
              <div className="p-3">
                <Button onClick={downloadPgn} variant="outline" className="w-full">
                  <Download className="size-3.5" /> Download PGN
                </Button>
              </div>
            </Card>
          )}

          {!isOver && (
            <Card className="flex-1 flex flex-col min-h-[200px] overflow-hidden">
              <ChatPanel
                messages={state.chat as ChatMsg[]}
                canSend={isPlayer}
                onSend={sendChat}
              />
            </Card>
          )}
        </div>
      </div>

      <PromotionDialog
        pending={pendingPromotion}
        color={state.you === "w" || state.you === "b" ? state.you : "w"}
        onPick={(promo) => {
          if (!pendingPromotion) return;
          tryMove(pendingPromotion.from, pendingPromotion.to, promo);
          setPendingPromotion(null);
        }}
        onCancel={() => setPendingPromotion(null)}
      />

      <Dialog open={endDialogOpen} onOpenChange={setEndDialogOpen}>
        <DialogContent>
          <DialogTitle>
            {endInfo?.result === "1-0"
              ? "White wins"
              : endInfo?.result === "0-1"
                ? "Black wins"
                : "Draw"}
          </DialogTitle>
          <DialogDescription>
            By {endInfo?.termination?.replace("_", " ")}
          </DialogDescription>
          {endInfo?.elo && (
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm font-mono">
              <div>
                <div className="text-xs uppercase text-[var(--fg-muted)]">White</div>
                <div className="mt-1">
                  {endInfo.elo.w.before} → {endInfo.elo.w.after}{" "}
                  <span
                    className={
                      endInfo.elo.w.after >= endInfo.elo.w.before
                        ? "text-[var(--success)]"
                        : "text-[var(--danger)]"
                    }
                  >
                    ({endInfo.elo.w.after - endInfo.elo.w.before > 0 ? "+" : ""}
                    {endInfo.elo.w.after - endInfo.elo.w.before})
                  </span>
                </div>
              </div>
              <div>
                <div className="text-xs uppercase text-[var(--fg-muted)]">Black</div>
                <div className="mt-1">
                  {endInfo.elo.b.before} → {endInfo.elo.b.after}{" "}
                  <span
                    className={
                      endInfo.elo.b.after >= endInfo.elo.b.before
                        ? "text-[var(--success)]"
                        : "text-[var(--danger)]"
                    }
                  >
                    ({endInfo.elo.b.after - endInfo.elo.b.before > 0 ? "+" : ""}
                    {endInfo.elo.b.after - endInfo.elo.b.before})
                  </span>
                </div>
              </div>
            </div>
          )}
          <div className="mt-6">
            <Button onClick={downloadPgn} variant="outline" className="w-full">
              <Download className="size-3.5" /> Download PGN
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PromotionDialog({
  pending,
  color,
  onPick,
  onCancel,
}: {
  pending: { from: string; to: string } | null;
  color: Color;
  onPick: (promo: "q" | "r" | "b" | "n") => void;
  onCancel: () => void;
}) {
  const glyphs: Record<"q" | "r" | "b" | "n", { w: string; b: string; label: string }> = {
    q: { w: "♕", b: "♛", label: "Queen" },
    r: { w: "♖", b: "♜", label: "Rook" },
    b: { w: "♗", b: "♝", label: "Bishop" },
    n: { w: "♘", b: "♞", label: "Knight" },
  };
  return (
    <Dialog
      open={!!pending}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogTitle>Choose promotion</DialogTitle>
        <DialogDescription>Pick a piece to promote your pawn to.</DialogDescription>
        <div className="mt-4 grid grid-cols-4 gap-2">
          {(["q", "r", "b", "n"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPick(p)}
              aria-label={glyphs[p].label}
              className="aspect-square rounded-md border border-[var(--border)] bg-[var(--bg-elev-2)] hover:bg-[var(--bg-elev)] hover:border-[var(--accent)] transition-[background-color,border-color,transform] active:scale-95 flex items-center justify-center text-4xl leading-none"
            >
              <span>{glyphs[p][color]}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ResultBanner({
  result,
  termination,
  you,
  white,
  black,
}: {
  result: string;
  termination: string | null | undefined;
  you: ColorOrSpectator;
  white: string;
  black: string;
}) {
  const isDraw = result === "1/2-1/2";
  const winnerColor: Color | null = result === "1-0" ? "w" : result === "0-1" ? "b" : null;
  const winnerName = winnerColor === "w" ? white : winnerColor === "b" ? black : null;
  const loserName = winnerColor === "w" ? black : winnerColor === "b" ? white : null;
  let myOutcome: "won" | "lost" | "draw" | null = null;
  if (you === "w" || you === "b") {
    if (isDraw) myOutcome = "draw";
    else if (winnerColor === you) myOutcome = "won";
    else myOutcome = "lost";
  }
  const headline = isDraw
    ? "Draw"
    : myOutcome === "won"
      ? "You won"
      : myOutcome === "lost"
        ? "You lost"
        : `${winnerName} won`;
  const sub =
    termination
      ? `By ${termination.replace(/_/g, " ")}`
      : winnerColor
        ? `${winnerName} defeated ${loserName}`
        : "Game complete";

  const accent =
    myOutcome === "won"
      ? "var(--accent)"
      : myOutcome === "lost"
        ? "var(--danger)"
        : "var(--fg-muted)";

  return (
    <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-elev)] px-5 py-4 mb-5 flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-4 min-w-0">
        <div
          aria-hidden
          className="flex-shrink-0 size-10 rounded-md flex items-center justify-center"
          style={{
            background: "var(--bg-elev-2)",
            border: `1px solid ${accent}`,
            color: accent,
          }}
        >
          <span className="font-serif text-[22px] leading-none">
            {isDraw ? "½" : winnerColor === "w" ? "♔" : "♚"}
          </span>
        </div>
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--fg-muted)]">
            Game review
          </div>
          <div className="text-[20px] font-medium tracking-tight" style={{ color: accent }}>
            {headline}
          </div>
          <div className="text-[12.5px] text-[var(--fg-muted)] truncate">{sub}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 font-mono text-[12px] text-[var(--fg-muted)]">
        <span>{white}</span>
        <span className="text-[var(--fg)] font-medium">
          {result.replace("1/2-1/2", "½-½")}
        </span>
        <span>{black}</span>
      </div>
    </div>
  );
}

function PlayerCard({
  player,
  color,
  active,
  captured,
  advantage,
}: {
  player: { username: string; elo: number; connected: boolean } | null;
  color: Color;
  active: boolean;
  captured?: { p: number; n: number; b: number; r: number; q: number };
  advantage?: number;
}) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div
        className={`h-8 w-8 flex-shrink-0 rounded-md border-2 ${
          color === "w" ? "bg-white border-white/30" : "bg-black border-white/20"
        } ${active ? "ring-2 ring-[var(--accent)]" : ""}`}
      />
      <div className="min-w-0">
        <div className="text-sm font-medium flex items-center gap-2">
          {player?.username || "—"}
          {player && (
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                player.connected ? "bg-[var(--success)]" : "bg-[var(--fg-subtle)]"
              }`}
              title={player.connected ? "online" : "disconnected"}
            />
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-[var(--fg-muted)] font-mono">
            {player?.elo ?? "—"}
          </span>
          {captured && (
            <CapturedPieces pieces={captured} advantage={advantage ?? 0} />
          )}
        </div>
      </div>
    </div>
  );
}

function buildPgn(
  moves: { san: string; from: string; to: string; promo?: "q" | "r" | "b" | "n" }[]
): string {
  // Reconstruct PGN from move list using chess.js
  const c = new Chess();
  for (const m of moves) {
    try {
      c.move({ from: m.from, to: m.to, promotion: m.promo });
    } catch {
      break;
    }
  }
  return c.pgn();
}
