import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 100)); // tenths of seconds
  const mins = Math.floor(total / 600);
  const secs = Math.floor((total % 600) / 10);
  const tenths = total % 10;
  if (mins >= 1) {
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }
  return `0:${secs.toString().padStart(2, "0")}.${tenths}`;
}

export function formatDate(ms: number | null | undefined): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString();
}
