"use client";
import * as React from "react";
import dynamic from "next/dynamic";

const Chessboard = dynamic(() => import("react-chessboard").then((m) => m.Chessboard), {
  ssr: false,
});

type Props = {
  fen: string;
  orientation: "white" | "black";
  onMove: (from: string, to: string, promotion?: "q" | "r" | "b" | "n") => boolean;
  arePiecesDraggable: boolean;
  customSquareStyles?: Record<string, React.CSSProperties>;
  /** Highlight (typically the user's selected piece). */
  selectedSquare?: string | null;
  /** Squares the selected piece can quietly move to (renders a dot). */
  legalMoves?: string[];
  /** Subset of legalMoves where moving is a capture (renders a ring). */
  captureSquares?: string[];
  /** Click handler — fires for any square. */
  onSquareClick?: (square: string) => void;
  /**
   * Approximate vertical pixels reserved for sibling chrome (player rows,
   * clocks, status bar, scrubber, etc). Used to cap the board so the whole
   * layout fits on smaller screens without scrolling. Defaults to ~220px.
   */
  reservedVh?: number;
  /** Hard cap on rendered board side, defaults to 720. */
  maxSize?: number;
};

const DOT = `radial-gradient(circle at center, rgba(105,125,58,0.45) 0 22%, transparent 24%)`;
const RING = `radial-gradient(circle at center, transparent 0 56%, rgba(181,74,58,0.55) 58% 72%, transparent 74%)`;
const SELECTED_BG = `rgba(105,125,58,0.32)`;

function mergeBackground(base: React.CSSProperties | undefined, overlay: string): React.CSSProperties {
  // Layered gradients: overlay paints on top of whatever the caller asked for.
  const prev = base?.background ?? base?.backgroundColor;
  if (typeof prev === "string" && prev) {
    return { ...base, background: `${overlay}, ${prev}` };
  }
  return { ...base, background: overlay };
}

export function Board({
  fen,
  orientation,
  onMove,
  arePiecesDraggable,
  customSquareStyles,
  selectedSquare,
  legalMoves,
  captureSquares,
  onSquareClick,
  reservedVh = 220,
  maxSize = 720,
}: Props) {
  // We size the board to the smaller of: container width, viewport height
  // minus reserved chrome, and the configured cap. This makes the layout fit
  // small/short screens without overflowing — important on phones in portrait.
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [boardWidth, setBoardWidth] = React.useState<number>(0);
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (w <= 0) return;
      const vhCap =
        typeof window !== "undefined" && window.innerHeight > 0
          ? Math.max(240, window.innerHeight - reservedVh)
          : Number.POSITIVE_INFINITY;
      const next = Math.min(w, vhCap, maxSize);
      setBoardWidth(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [reservedVh, maxSize]);

  // True for the brief moment between picking a promotion piece in the
  // library's built-in dialog and the resulting onPieceDrop echo. Lets us
  // accept that echo without sending the move a second time.
  const skipNextDrop = React.useRef(false);

  // Build the merged square-style map: caller styles first, overlays last.
  const styles = React.useMemo<Record<string, React.CSSProperties>>(() => {
    const out: Record<string, React.CSSProperties> = { ...(customSquareStyles ?? {}) };
    if (selectedSquare) {
      out[selectedSquare] = mergeBackground(out[selectedSquare], `linear-gradient(${SELECTED_BG}, ${SELECTED_BG})`);
    }
    const captureSet = new Set(captureSquares ?? []);
    for (const sq of legalMoves ?? []) {
      const overlay = captureSet.has(sq) ? RING : DOT;
      out[sq] = mergeBackground(out[sq], overlay);
    }
    return out;
  }, [customSquareStyles, selectedSquare, legalMoves, captureSquares]);

  return (
    <div ref={containerRef} className="w-full flex justify-center">
      {boardWidth > 0 && (
        <div
          className="rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--bg-elev)]"
          style={{ width: boardWidth, height: boardWidth }}
        >
          <Chessboard
            position={fen}
            boardOrientation={orientation}
            boardWidth={boardWidth}
            arePiecesDraggable={arePiecesDraggable}
            animationDuration={150}
            customDarkSquareStyle={{ backgroundColor: "var(--board-dark)" }}
            customLightSquareStyle={{ backgroundColor: "var(--board-light)" }}
            customBoardStyle={{ borderRadius: 0 }}
            customSquareStyles={styles}
            onSquareClick={(square) => {
              onSquareClick?.(square);
            }}
            onPieceDrop={(from, to) => {
              if (skipNextDrop.current) {
                skipNextDrop.current = false;
                return true;
              }
              return onMove(from, to);
            }}
            onPromotionPieceSelect={(piece, from, to) => {
              if (!piece || !from || !to) return false;
              const promo = piece[1]?.toLowerCase() as "q" | "r" | "b" | "n";
              const ok = onMove(from, to, promo);
              if (ok) skipNextDrop.current = true;
              return ok;
            }}
          />
        </div>
      )}
    </div>
  );
}
