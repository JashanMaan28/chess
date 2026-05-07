"use client";
import * as React from "react";
import dynamic from "next/dynamic";

const Chessboard = dynamic(() => import("react-chessboard").then((m) => m.Chessboard), {
  ssr: false,
});

export function Board({
  fen,
  orientation,
  onMove,
  arePiecesDraggable,
  customSquareStyles,
}: {
  fen: string;
  orientation: "white" | "black";
  onMove: (from: string, to: string, promotion?: "q" | "r" | "b" | "n") => boolean;
  arePiecesDraggable: boolean;
  customSquareStyles?: Record<string, React.CSSProperties>;
}) {
  return (
    <div className="rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--bg-elev)]">
      <Chessboard
        position={fen}
        boardOrientation={orientation}
        arePiecesDraggable={arePiecesDraggable}
        animationDuration={150}
        customDarkSquareStyle={{ backgroundColor: "var(--board-dark)" }}
        customLightSquareStyle={{ backgroundColor: "var(--board-light)" }}
        customSquareStyles={customSquareStyles}
        onPieceDrop={(from, to, piece) => {
          // piece is like 'wP', 'bQ' etc. Promotion square: 8/1 with pawn.
          const isPawn = piece[1]?.toUpperCase() === "P";
          const target = to[1];
          if (isPawn && (target === "8" || target === "1")) {
            return onMove(from, to, "q");
          }
          return onMove(from, to);
        }}
      />
    </div>
  );
}
