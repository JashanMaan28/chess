"use client";
import * as React from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { Chess } from "chess.js";
import { Board } from "@/components/chess/board";
import { Clock } from "@/components/chess/clock";
import { MoveList } from "@/components/chess/move-list";
import { ChatPanel } from "@/components/chess/chat-panel";
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
import { Download, Flag, Handshake, Loader2, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type GameState = Omit<StateMsg, "t"> & { you: ColorOrSpectator };

export default function GamePage() {
  const { id } = useParams<{ id: string }>();
  const { getToken, isLoaded } = useAuth();

  const [state, setState] = React.useState<GameState | null>(null);
  const [status, setStatus] = React.useState<"connecting" | "open" | "closed">("connecting");
  const [selectedPly, setSelectedPly] = React.useState<number>(-2); // -2 = follow live
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
    let cancelled = false;
    (async () => {
      const token = await getToken().catch(() => null);
      if (cancelled) return;
      // Persist active game id for reconnection UX
      try {
        localStorage.setItem("activeGameId", id);
      } catch {
        // ignore
      }
      const ws = new GameWS({
        gameId: id,
        token,
        handlers: {
          onStatus: setStatus,
          onMessage: (msg: ServerMsg) => handleServerMsg(msg),
        },
      });
      wsRef.current = ws;
      ws.connect();
    })();
    return () => {
      cancelled = true;
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

  // Highlight last move squares
  const lastMove = state && state.moves.length > 0 ? state.moves[state.moves.length - 1] : null;
  const squareStyles: Record<string, React.CSSProperties> = {};
  if (lastMove) {
    squareStyles[lastMove.from] = { background: "var(--board-last-move)" };
    squareStyles[lastMove.to] = { background: "var(--board-last-move)" };
  }

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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6 lg:gap-8">
      {/* Board column */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <PlayerCard player={topPlayer} color={topColor} active={state.turn === topColor} />
          <Clock
            ms={clocks[topColor]}
            active={state.turn === topColor && state.result === "*"}
            low={clocks[topColor] < 20_000}
          />
        </div>
        <Board
          fen={renderFen}
          orientation={orientation}
          arePiecesDraggable={draggable}
          onMove={tryMove}
          customSquareStyles={squareStyles}
        />
        <div className="flex items-center justify-between gap-3">
          <PlayerCard
            player={bottomPlayer}
            color={bottomColor}
            active={state.turn === bottomColor}
          />
          <Clock
            ms={clocks[bottomColor]}
            active={state.turn === bottomColor && state.result === "*"}
            low={clocks[bottomColor] < 20_000}
          />
        </div>

        {/* Status bar */}
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

        {isPlayer && state.result === "*" && (
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

        {state.result !== "*" && (
          <Card>
            <div className="p-3">
              <Button onClick={downloadPgn} variant="outline" className="w-full">
                <Download className="size-3.5" /> Download PGN
              </Button>
            </div>
          </Card>
        )}

        <Card className="flex-1 flex flex-col min-h-[200px] overflow-hidden">
          <ChatPanel
            messages={state.chat as ChatMsg[]}
            canSend={isPlayer}
            onSend={sendChat}
          />
        </Card>
      </div>

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

function PlayerCard({
  player,
  color,
  active,
}: {
  player: { username: string; elo: number; connected: boolean } | null;
  color: Color;
  active: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`h-8 w-8 rounded-md border-2 ${
          color === "w" ? "bg-white border-white/30" : "bg-black border-white/20"
        } ${active ? "ring-2 ring-[var(--accent)]" : ""}`}
      />
      <div>
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
        <div className="text-xs text-[var(--fg-muted)] font-mono">
          {player?.elo ?? "—"}
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
