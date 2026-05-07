"use client";
import * as React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export type MoveListItem = { san: string };

export function MoveList({
  moves,
  selectedPly,
  onSelect,
}: {
  moves: MoveListItem[];
  selectedPly: number; // -1 = start, otherwise index into moves
  onSelect: (ply: number) => void;
}) {
  // Pair moves into rows
  const rows: { num: number; w?: MoveListItem; b?: MoveListItem; wIdx?: number; bIdx?: number }[] =
    [];
  for (let i = 0; i < moves.length; i += 2) {
    rows.push({
      num: i / 2 + 1,
      w: moves[i],
      wIdx: i,
      b: moves[i + 1],
      bIdx: moves[i + 1] ? i + 1 : undefined,
    });
  }

  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [moves.length]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between text-xs uppercase tracking-wider px-3 py-2 border-b border-[var(--border)] text-[var(--fg-muted)] font-mono">
        <span>Moves</span>
        <span>{moves.length} ply</span>
      </div>
      <div ref={ref} className="overflow-y-auto flex-1">
        <table className="w-full text-sm font-mono">
          <tbody>
            <tr>
              <td colSpan={3}>
                <button
                  onClick={() => onSelect(-1)}
                  className={cn(
                    "w-full text-left text-xs px-3 py-1.5 hover:bg-[var(--bg-elev-2)]",
                    selectedPly === -1 && "bg-[var(--bg-elev-2)] text-[var(--accent)]"
                  )}
                >
                  start
                </button>
              </td>
            </tr>
            {rows.map((row) => (
              <tr key={row.num} className="border-t border-[var(--border)]/50">
                <td className="w-10 px-3 py-1 text-[var(--fg-subtle)] text-xs">{row.num}.</td>
                <td className="px-1 py-1">
                  {row.w && row.wIdx !== undefined && (
                    <button
                      onClick={() => onSelect(row.wIdx!)}
                      className={cn(
                        "w-full text-left px-2 py-0.5 rounded hover:bg-[var(--bg-elev-2)]",
                        selectedPly === row.wIdx && "bg-[var(--bg-elev-2)] text-[var(--accent)]"
                      )}
                    >
                      {row.w.san}
                    </button>
                  )}
                </td>
                <td className="px-1 py-1">
                  {row.b && row.bIdx !== undefined && (
                    <button
                      onClick={() => onSelect(row.bIdx!)}
                      className={cn(
                        "w-full text-left px-2 py-0.5 rounded hover:bg-[var(--bg-elev-2)]",
                        selectedPly === row.bIdx && "bg-[var(--bg-elev-2)] text-[var(--accent)]"
                      )}
                    >
                      {row.b.san}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
