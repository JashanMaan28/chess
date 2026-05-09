"use client";
import * as React from "react";

type PieceKey = "p" | "n" | "b" | "r" | "q";

const PIECE_VALUE: Record<PieceKey, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const PIECE_GLYPH: Record<PieceKey, string> = {
  p: "♟",
  n: "♞",
  b: "♝",
  r: "♜",
  q: "♛",
};
const RENDER_ORDER: PieceKey[] = ["p", "n", "b", "r", "q"];

export type CaptureCounts = Record<PieceKey, number>;

const EMPTY_COUNTS: CaptureCounts = { p: 0, n: 0, b: 0, r: 0, q: 0 };

export function captureSummary(fen: string): {
  capturedByWhite: CaptureCounts;
  capturedByBlack: CaptureCounts;
  whiteAdvantage: number;
} {
  const start: CaptureCounts = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  const live = {
    w: { ...EMPTY_COUNTS },
    b: { ...EMPTY_COUNTS },
  };
  const board = fen.split(" ")[0] ?? "";
  for (const ch of board) {
    if (ch === "/" || /\d/.test(ch)) continue;
    const lower = ch.toLowerCase();
    if (lower === "k") continue;
    if (lower !== "p" && lower !== "n" && lower !== "b" && lower !== "r" && lower !== "q") {
      continue;
    }
    const side: "w" | "b" = ch === ch.toUpperCase() ? "w" : "b";
    live[side][lower as PieceKey] += 1;
  }
  const capturedByWhite: CaptureCounts = {
    p: start.p - live.b.p,
    n: start.n - live.b.n,
    b: start.b - live.b.b,
    r: start.r - live.b.r,
    q: start.q - live.b.q,
  };
  const capturedByBlack: CaptureCounts = {
    p: start.p - live.w.p,
    n: start.n - live.w.n,
    b: start.b - live.w.b,
    r: start.r - live.w.r,
    q: start.q - live.w.q,
  };
  const whiteMaterial = RENDER_ORDER.reduce((s, k) => s + live.w[k] * PIECE_VALUE[k], 0);
  const blackMaterial = RENDER_ORDER.reduce((s, k) => s + live.b[k] * PIECE_VALUE[k], 0);
  return {
    capturedByWhite,
    capturedByBlack,
    whiteAdvantage: whiteMaterial - blackMaterial,
  };
}

export function CapturedPieces({
  pieces,
  advantage,
  className,
}: {
  pieces: CaptureCounts;
  advantage: number;
  className?: string;
}) {
  const totalCaptured = RENDER_ORDER.reduce((s, k) => s + pieces[k], 0);
  if (totalCaptured === 0 && advantage <= 0) return null;
  return (
    <div
      className={
        "flex items-center gap-1.5 leading-none select-none " + (className ?? "")
      }
      aria-label={`Captured pieces${advantage > 0 ? `, +${advantage} material` : ""}`}
    >
      {RENDER_ORDER.map((k) => {
        const n = pieces[k];
        if (n === 0) return null;
        return (
          <span key={k} className="inline-flex items-center text-[var(--fg-muted)]">
            {Array.from({ length: n }).map((_, i) => (
              <span
                key={i}
                aria-hidden
                className="text-[14px] leading-none"
                style={{ marginLeft: i === 0 ? 0 : "-5px" }}
              >
                {PIECE_GLYPH[k]}
              </span>
            ))}
          </span>
        );
      })}
      {advantage > 0 && (
        <span className="font-mono text-[10.5px] text-[var(--fg-muted)] ml-0.5">
          +{advantage}
        </span>
      )}
    </div>
  );
}
