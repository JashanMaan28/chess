export type TimeControlBucket = "bullet" | "blitz" | "rapid";

export type TimeControl = {
  id: string;
  bucket: TimeControlBucket;
  label: string;
  initialMs: number;
  incrementMs: number;
};

const m = (mins: number) => mins * 60_000;
const s = (secs: number) => secs * 1_000;

export const TIME_CONTROLS: TimeControl[] = [
  { id: "1+0", bucket: "bullet", label: "1 + 0", initialMs: m(1), incrementMs: 0 },
  { id: "2+1", bucket: "bullet", label: "2 + 1", initialMs: m(2), incrementMs: s(1) },
  { id: "3+0", bucket: "blitz", label: "3 + 0", initialMs: m(3), incrementMs: 0 },
  { id: "3+2", bucket: "blitz", label: "3 + 2", initialMs: m(3), incrementMs: s(2) },
  { id: "5+0", bucket: "blitz", label: "5 + 0", initialMs: m(5), incrementMs: 0 },
  { id: "5+3", bucket: "blitz", label: "5 + 3", initialMs: m(5), incrementMs: s(3) },
  { id: "10+0", bucket: "rapid", label: "10 + 0", initialMs: m(10), incrementMs: 0 },
  { id: "15+10", bucket: "rapid", label: "15 + 10", initialMs: m(15), incrementMs: s(10) },
  { id: "30+0", bucket: "rapid", label: "30 + 0", initialMs: m(30), incrementMs: 0 },
];

export const TIME_CONTROL_BY_ID = Object.fromEntries(
  TIME_CONTROLS.map((tc) => [tc.id, tc])
) as Record<string, TimeControl>;

export function bucketFor(initialMs: number, incrementMs: number): TimeControlBucket {
  // Estimated game length = initial + 40 * increment (FIDE-ish)
  const est = initialMs + 40 * incrementMs;
  if (est < m(3)) return "bullet";
  if (est < m(10)) return "blitz";
  return "rapid";
}

export function disconnectGraceMs(bucket: TimeControlBucket): number {
  return bucket === "rapid" ? 60_000 : 30_000;
}
