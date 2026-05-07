"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { formatClock } from "@/lib/utils";

export function Clock({
  ms,
  active,
  low,
}: {
  ms: number;
  active: boolean;
  low?: boolean;
}) {
  return (
    <div
      className={cn(
        "font-mono text-3xl md:text-4xl tabular-nums px-4 py-2 rounded-md border tracking-tight transition-all",
        active
          ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--fg)] shadow-[0_0_24px_-8px_var(--accent)]"
          : "border-[var(--border)] bg-[var(--bg-elev)] text-[var(--fg-muted)]",
        low && active && "border-[var(--danger)] text-[var(--danger)] bg-[var(--danger)]/10 shadow-[0_0_24px_-8px_var(--danger)]"
      )}
    >
      {formatClock(ms)}
    </div>
  );
}
