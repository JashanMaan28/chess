import * as React from "react";

const PIECE_GLYPH: Record<string, string> = {
  K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙",
  k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟",
};

function fenToBoard(fen: string): (string | null)[][] {
  const placement = fen.split(" ")[0] ?? "";
  const rows = placement.split("/");
  return rows.map((row) => {
    const out: (string | null)[] = [];
    for (const ch of row) {
      if (/\d/.test(ch)) for (let i = 0; i < +ch; i++) out.push(null);
      else out.push(ch);
    }
    return out;
  });
}

type Props = {
  fen?: string;
  size?: number;
  flipped?: boolean;
  altPalette?: boolean;
  fromSq?: string;
  toSq?: string;
  showCoords?: boolean;
  selectedSquare?: string;
  legalMoves?: string[];
  captureSquares?: string[];
  flat?: boolean;
};

export function MiniBoard({
  fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR",
  size = 240,
  flipped = false,
  altPalette = false,
  fromSq,
  toSq,
  showCoords = false,
  selectedSquare,
  legalMoves = [],
  captureSquares = [],
  flat = false,
}: Props) {
  const board = fenToBoard(fen);
  const files = flipped
    ? ["h", "g", "f", "e", "d", "c", "b", "a"]
    : ["a", "b", "c", "d", "e", "f", "g", "h"];
  const ranks = flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];

  const cells: React.ReactNode[] = [];
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const rank = ranks[r] ?? 1;
      const file = files[f] ?? "a";
      const sq = `${file}${rank}`;
      const fenRow = 8 - rank;
      const fenCol = file.charCodeAt(0) - 97;
      const piece = board[fenRow]?.[fenCol] ?? null;
      const isLight = (fenRow + fenCol) % 2 === 0;

      const lightVar = altPalette ? "var(--board-light-alt, var(--board-light))" : "var(--board-light)";
      const darkVar = altPalette ? "var(--board-dark-alt, var(--board-dark))" : "var(--board-dark)";

      const baseBg = isLight ? lightVar : darkVar;
      const isFromTo = sq === fromSq || sq === toSq || sq === selectedSquare;
      const bg = isFromTo
        ? `linear-gradient(var(--board-highlight), var(--board-highlight)), ${baseBg}`
        : baseBg;

      const isLegal = legalMoves.includes(sq);
      const isCapture = captureSquares.includes(sq);

      cells.push(
        <div
          key={sq}
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: bg,
            userSelect: "none",
          }}
        >
          {showCoords && f === 0 && (
            <span
              className="font-mono"
              style={{
                position: "absolute",
                left: 3,
                top: 1,
                fontSize: 9,
                opacity: 0.5,
                color: isLight ? "var(--board-dark)" : "var(--board-light)",
                fontWeight: 500,
                pointerEvents: "none",
              }}
            >
              {rank}
            </span>
          )}
          {showCoords && r === 7 && (
            <span
              className="font-mono"
              style={{
                position: "absolute",
                right: 3,
                bottom: 1,
                fontSize: 9,
                opacity: 0.5,
                color: isLight ? "var(--board-dark)" : "var(--board-light)",
                fontWeight: 500,
                pointerEvents: "none",
              }}
            >
              {file}
            </span>
          )}
          {isLegal && !piece && (
            <span
              style={{
                width: "26%",
                aspectRatio: "1",
                borderRadius: "50%",
                background: "rgba(105,125,58,0.32)",
              }}
            />
          )}
          {isCapture && (
            <span
              style={{
                position: "absolute",
                inset: "6%",
                borderRadius: "50%",
                border: "4px solid rgba(181,74,58,0.45)",
                boxSizing: "border-box",
              }}
            />
          )}
          {piece && (
            <span
              style={{
                fontSize: `${(size / 8) * 0.78}px`,
                lineHeight: 1,
                color: piece === piece.toUpperCase() ? "#fafafa" : "#1a1815",
                textShadow:
                  piece === piece.toUpperCase()
                    ? "0 0 1px #2a2520, 0 0 1px #2a2520, 0 1px 0 #2a2520"
                    : "none",
                filter: flat ? "none" : "drop-shadow(0 1px 1px rgba(0,0,0,0.18))",
                fontFamily: "'Segoe UI Symbol', 'Apple Color Emoji', sans-serif",
              }}
            >
              {PIECE_GLYPH[piece]}
            </span>
          )}
        </div>
      );
    }
  }

  return (
    <div
      style={{
        width: size,
        padding: flat ? 0 : 10,
        background: flat ? "transparent" : "var(--bg-elev)",
        borderRadius: flat ? 0 : 8,
        boxShadow: flat ? "none" : "var(--shadow-sm)",
        border: flat ? "none" : "1px solid var(--border)",
        display: "inline-block",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(8, 1fr)",
          gridTemplateRows: "repeat(8, 1fr)",
          width: "100%",
          aspectRatio: "1 / 1",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        {cells}
      </div>
    </div>
  );
}
