export type TimeControlBucket = "bullet" | "blitz" | "rapid" | "classical";

export type TimeControl = {
  id: string;
  bucket: TimeControlBucket;
  label: string;
  initialMs: number;
  incrementMs: number;
  /** True for time controls generated on the fly (custom). */
  custom?: boolean;
};

const m = (mins: number) => mins * 60_000;
const s = (secs: number) => secs * 1_000;

export const TIME_CONTROLS: TimeControl[] = [
  // Bullet — < 3 min estimated
  { id: "1+0", bucket: "bullet", label: "1 + 0", initialMs: m(1), incrementMs: 0 },
  { id: "1+1", bucket: "bullet", label: "1 + 1", initialMs: m(1), incrementMs: s(1) },
  { id: "2+1", bucket: "bullet", label: "2 + 1", initialMs: m(2), incrementMs: s(1) },
  // Blitz — 3 to 10 min estimated
  { id: "3+0", bucket: "blitz", label: "3 + 0", initialMs: m(3), incrementMs: 0 },
  { id: "3+2", bucket: "blitz", label: "3 + 2", initialMs: m(3), incrementMs: s(2) },
  { id: "5+0", bucket: "blitz", label: "5 + 0", initialMs: m(5), incrementMs: 0 },
  { id: "5+3", bucket: "blitz", label: "5 + 3", initialMs: m(5), incrementMs: s(3) },
  // Rapid — 10 to 30 min estimated
  { id: "10+0", bucket: "rapid", label: "10 + 0", initialMs: m(10), incrementMs: 0 },
  { id: "10+5", bucket: "rapid", label: "10 + 5", initialMs: m(10), incrementMs: s(5) },
  { id: "15+10", bucket: "rapid", label: "15 + 10", initialMs: m(15), incrementMs: s(10) },
  { id: "20+0", bucket: "rapid", label: "20 + 0", initialMs: m(20), incrementMs: 0 },
  // Classical — 30 min estimated and up
  { id: "30+0", bucket: "classical", label: "30 + 0", initialMs: m(30), incrementMs: 0 },
  { id: "30+20", bucket: "classical", label: "30 + 20", initialMs: m(30), incrementMs: s(20) },
  { id: "45+15", bucket: "classical", label: "45 + 15", initialMs: m(45), incrementMs: s(15) },
  { id: "60+0", bucket: "classical", label: "60 + 0", initialMs: m(60), incrementMs: 0 },
  { id: "90+30", bucket: "classical", label: "90 + 30", initialMs: m(90), incrementMs: s(30) },
];

export const TIME_CONTROL_BY_ID = Object.fromEntries(
  TIME_CONTROLS.map((tc) => [tc.id, tc])
) as Record<string, TimeControl>;

/** Classify the bucket by estimated game length (FIDE-ish: initial + 40 * inc). */
export function bucketFor(initialMs: number, incrementMs: number): TimeControlBucket {
  const est = initialMs + 40 * incrementMs;
  if (est < m(3)) return "bullet";
  if (est < m(10)) return "blitz";
  if (est < m(30)) return "rapid";
  return "classical";
}

/** Custom time control bounds — kept liberal but bounded for sanity. */
export const CUSTOM_TC_LIMITS = {
  minInitialMin: 0.5,
  maxInitialMin: 180,
  minIncrementSec: 0,
  maxIncrementSec: 60,
};

/** Parse a custom time-control id like "X+Y" (X minutes, Y second increment). */
export function parseCustomTcId(id: string): TimeControl | null {
  const match = /^(\d+(?:\.\d+)?)\+(\d+)$/.exec(id);
  if (!match) return null;
  const initialMin = Number(match[1]);
  const incSec = Number(match[2]);
  if (!Number.isFinite(initialMin) || !Number.isFinite(incSec)) return null;
  if (
    initialMin < CUSTOM_TC_LIMITS.minInitialMin ||
    initialMin > CUSTOM_TC_LIMITS.maxInitialMin ||
    incSec < CUSTOM_TC_LIMITS.minIncrementSec ||
    incSec > CUSTOM_TC_LIMITS.maxIncrementSec
  ) {
    return null;
  }
  const initialMs = Math.round(initialMin * 60_000);
  const incrementMs = Math.round(incSec * 1_000);
  return {
    id,
    bucket: bucketFor(initialMs, incrementMs),
    label: `${initialMin} + ${incSec}`,
    initialMs,
    incrementMs,
    custom: true,
  };
}

/**
 * Resolve a time-control id to a TimeControl. Falls back to parsing the id as
 * a custom "X+Y" pattern if it's not in the predefined map.
 */
export function resolveTimeControl(id: string): TimeControl | null {
  const known = TIME_CONTROL_BY_ID[id];
  if (known) return known;
  return parseCustomTcId(id);
}

export function disconnectGraceMs(bucket: TimeControlBucket): number {
  if (bucket === "classical") return 120_000;
  if (bucket === "rapid") return 60_000;
  return 30_000;
}
