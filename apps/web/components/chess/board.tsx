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
}: Props) {
  // Track container width so the chessboard scales to its parent rather than
  // the default ~560px. We update on window resize.
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [boardWidth, setBoardWidth] = React.useState<number>(0);
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setBoardWidth(w);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
    <div
      ref={containerRef}
      className="rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--bg-elev)] w-full"
    >
      {boardWidth > 0 && (
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
          onPieceDrop={(from, to, piece) => {
            const isPawn = piece[1]?.toUpperCase() === "P";
            const target = to[1];
            if (isPawn && (target === "8" || target === "1")) {
              return onMove(from, to, "q");
            }
            return onMove(from, to);
          }}
        />
      )}
    </div>
  );
}
