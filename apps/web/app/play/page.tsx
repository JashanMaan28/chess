"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import {
  TIME_CONTROLS,
  CUSTOM_TC_LIMITS,
  bucketFor,
  parseCustomTcId,
  resolveTimeControl,
  type TimeControlBucket,
} from "@chess/shared/time-controls";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { QueueWS } from "@/lib/ws-client";
import type { ServerMsg } from "@chess/shared/protocol";
import { toast } from "sonner";
import {
  Zap,
  Flame,
  Timer,
  BookOpen,
  Sliders,
  Plus,
  Minus,
  type LucideIcon,
} from "lucide-react";

// ---------- Icons / metadata per bucket ----------
const BUCKET_META: Record<
  TimeControlBucket | "custom",
  { Icon: LucideIcon; tagline: string; tint: string }
> = {
  bullet: {
    Icon: Zap,
    tagline: "Lightning fast — pure reflex.",
    tint: "var(--warning)",
  },
  blitz: {
    Icon: Flame,
    tagline: "Tactical sparks at speed.",
    tint: "var(--danger)",
  },
  rapid: {
    Icon: Timer,
    tagline: "Time to plan, not to ponder.",
    tint: "var(--accent)",
  },
  classical: {
    Icon: BookOpen,
    tagline: "Long thinks, deep ideas.",
    tint: "var(--ink-2)",
  },
  custom: {
    Icon: Sliders,
    tagline: "Build your own tempo.",
    tint: "var(--accent-2)",
  },
};

// Featured quick-play cards — one per bucket plus a Custom slot.
type FeatureKind = TimeControlBucket | "custom";
const FEATURED: {
  id: string;
  time: string;
  inc: string;
  label: string;
  desc: string;
  kind: FeatureKind;
}[] = [
  { id: "1+0", time: "1", inc: "+0", label: "Bullet", desc: "Lightning fast", kind: "bullet" },
  { id: "3+0", time: "3", inc: "+0", label: "Blitz", desc: "Most popular", kind: "blitz" },
  { id: "10+0", time: "10", inc: "+0", label: "Rapid", desc: "Think a bit", kind: "rapid" },
  { id: "30+20", time: "30", inc: "+20", label: "Classical", desc: "Deep games", kind: "classical" },
];

const BUCKET_ORDER: TimeControlBucket[] = ["bullet", "blitz", "rapid", "classical"];

export default function PlayPage() {
  return (
    <React.Suspense fallback={<div className="px-14 pt-9 pb-12" />}>
      <PlayPageInner />
    </React.Suspense>
  );
}

function PlayPageInner() {
  const { getToken } = useAuth();
  const router = useRouter();
  const search = useSearchParams();

  const [queueing, setQueueing] = React.useState<string | null>(null);
  const [queueSize, setQueueSize] = React.useState<number>(0);
  const [elapsed, setElapsed] = React.useState<number>(0);
  const [customOpen, setCustomOpen] = React.useState(false);
  const wsRef = React.useRef<QueueWS | null>(null);
  const startedAt = React.useRef<number>(0);

  const startQueue = React.useCallback(
    async (tcId: string) => {
      if (queueing) return;
      const token = await getToken();
      if (!token) {
        toast.error("Sign in to play ranked.");
        return;
      }
      setQueueing(tcId);
      setQueueSize(0);
      setElapsed(0);
      startedAt.current = Date.now();
      const ws = new QueueWS({
        tcId,
        getToken: () => getToken().catch(() => null),
        handlers: {
          onMessage: (msg: ServerMsg) => {
            if (msg.t === "queued") setQueueSize(msg.size);
            if (msg.t === "matched") {
              toast.success("Match found!");
              router.push(`/game/${msg.gameId}`);
            }
            if (msg.t === "error") toast.error(msg.msg);
          },
          onStatus: () => {},
        },
      });
      wsRef.current = ws;
      void ws.connect();
    },
    [getToken, queueing, router]
  );

  const cancelQueue = React.useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setQueueing(null);
  }, []);

  React.useEffect(() => {
    if (!queueing) return;
    const t = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 250);
    return () => clearInterval(t);
  }, [queueing]);

  React.useEffect(() => {
    const tc = search.get("tc");
    if (tc && resolveTimeControl(tc) && !queueing) {
      startQueue(tc);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  React.useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  if (queueing) {
    return <Searching tcId={queueing} elapsed={elapsed} queueSize={queueSize} onCancel={cancelQueue} />;
  }

  return (
    <div className="px-14 pt-9 pb-12 max-w-[1280px] mx-auto w-full">
      <div className="mb-8">
        <div className="eyebrow mb-1.5">Find a match</div>
        <h1 className="h-display">
          Pick a <em className="font-serif italic">tempo</em>.
        </h1>
        <p className="text-[var(--fg-muted)] text-[15px] mt-2 max-w-lg">
          We pair you with a similarly-rated player. Search widens every 10 seconds.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-medium tracking-tight">Quick play</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {FEATURED.map((q) => {
            const meta = BUCKET_META[q.kind];
            const Icon = meta.Icon;
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => startQueue(q.id)}
                className="qp-card group"
              >
                <div className="flex items-center justify-between">
                  <span
                    className="inline-flex items-center justify-center size-7 rounded-md border border-[var(--border)] bg-[var(--bg-elev-2)] transition-colors group-hover:border-[var(--fg)]"
                    style={{ color: meta.tint }}
                  >
                    <Icon className="size-4" strokeWidth={1.75} />
                  </span>
                  <span className="eyebrow !mt-0">{q.label}</span>
                </div>
                <div className="font-serif text-[36px] leading-none mt-3">
                  {q.time}
                  <span className="text-[var(--fg-muted)] text-[22px]">{q.inc}</span>
                </div>
                <div className="text-[12.5px] text-[var(--fg-muted)] mt-2">{q.desc}</div>
              </button>
            );
          })}

          {/* Custom card — opens dialog instead of queueing directly */}
          <button
            type="button"
            onClick={() => setCustomOpen(true)}
            className="qp-card group border-dashed"
          >
            <div className="flex items-center justify-between">
              <span
                className="inline-flex items-center justify-center size-7 rounded-md border border-[var(--border)] bg-[var(--bg-elev-2)] transition-colors group-hover:border-[var(--fg)]"
                style={{ color: BUCKET_META.custom.tint }}
              >
                <Sliders className="size-4" strokeWidth={1.75} />
              </span>
              <span className="eyebrow !mt-0">Custom</span>
            </div>
            <div className="font-serif text-[36px] leading-none mt-3">
              ?<span className="text-[var(--fg-muted)] text-[22px]">+?</span>
            </div>
            <div className="text-[12.5px] text-[var(--fg-muted)] mt-2">Set your own clock</div>
          </button>
        </div>
      </section>

      <section className="mt-12">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-medium tracking-tight">All time controls</h2>
          <span className="text-[var(--fg-muted)] text-[13px]">By bucket</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {BUCKET_ORDER.map((bucket) => {
            const items = TIME_CONTROLS.filter((t) => t.bucket === bucket);
            const meta = BUCKET_META[bucket];
            const Icon = meta.Icon;
            return (
              <div
                key={bucket}
                className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-elev)] flex flex-col"
              >
                <div className="px-5 py-3.5 border-b border-[var(--border)] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="inline-flex items-center justify-center size-7 rounded-md bg-[var(--bg-elev-2)]"
                      style={{ color: meta.tint }}
                    >
                      <Icon className="size-4" strokeWidth={1.75} />
                    </span>
                    <h3 className="font-serif text-[22px] capitalize tracking-tight truncate">
                      {bucket}
                    </h3>
                  </div>
                  <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--fg-muted)] whitespace-nowrap">
                    {items.length} {items.length === 1 ? "format" : "formats"}
                  </span>
                </div>
                <div className="px-5 pt-2.5 pb-1 text-[12.5px] text-[var(--fg-muted)] italic">
                  {meta.tagline}
                </div>
                <div className="p-2 flex-1">
                  {items.map((tc) => (
                    <button
                      key={tc.id}
                      onClick={() => startQueue(tc.id)}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-md hover:bg-[var(--bg-elev-2)] transition-colors"
                    >
                      <span className="font-mono text-[14px]">{tc.label}</span>
                      <span className="text-[12px] text-[var(--fg-muted)]">Play</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <CustomTimeControlDialog
        open={customOpen}
        onOpenChange={setCustomOpen}
        onPlay={(tcId) => {
          setCustomOpen(false);
          startQueue(tcId);
        }}
      />
    </div>
  );
}

// ---------- Custom Time Control Dialog ----------

function CustomTimeControlDialog({
  open,
  onOpenChange,
  onPlay,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPlay: (tcId: string) => void;
}) {
  const [minutes, setMinutes] = React.useState<number>(7);
  const [increment, setIncrement] = React.useState<number>(2);

  const tc = React.useMemo(() => {
    const id = `${minutes}+${increment}`;
    return parseCustomTcId(id);
  }, [minutes, increment]);

  const bucket = tc?.bucket ?? bucketFor(minutes * 60_000, increment * 1_000);
  const meta = BUCKET_META[bucket];
  const BucketIcon = meta.Icon;

  const clamp = (n: number, min: number, max: number) =>
    Math.min(max, Math.max(min, n));

  const stepMinutes = (delta: number) =>
    setMinutes((m) =>
      clamp(
        Math.round((m + delta) * 2) / 2,
        CUSTOM_TC_LIMITS.minInitialMin,
        CUSTOM_TC_LIMITS.maxInitialMin
      )
    );
  const stepIncrement = (delta: number) =>
    setIncrement((i) =>
      clamp(i + delta, CUSTOM_TC_LIMITS.minIncrementSec, CUSTOM_TC_LIMITS.maxIncrementSec)
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sliders className="size-4" strokeWidth={1.75} />
            Custom time control
          </DialogTitle>
          <DialogDescription>
            Pick any clock between {CUSTOM_TC_LIMITS.minInitialMin}–
            {CUSTOM_TC_LIMITS.maxInitialMin} min and 0–
            {CUSTOM_TC_LIMITS.maxIncrementSec}s increment.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-5">
          {/* Live preview */}
          <div
            className="rounded-md border border-[var(--border)] bg-[var(--bg-elev-2)] p-4 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <span
                className="inline-flex items-center justify-center size-9 rounded-md bg-[var(--bg-elev)] border border-[var(--border)]"
                style={{ color: meta.tint }}
              >
                <BucketIcon className="size-5" strokeWidth={1.75} />
              </span>
              <div>
                <div className="eyebrow !mt-0 capitalize">{bucket}</div>
                <div className="font-serif text-[28px] leading-none mt-1 tabular">
                  {minutes}
                  <span className="text-[var(--fg-muted)] text-[20px]">+{increment}</span>
                </div>
              </div>
            </div>
            <div className="text-right text-[12px] text-[var(--fg-muted)] max-w-[160px]">
              {meta.tagline}
            </div>
          </div>

          {/* Minutes */}
          <Stepper
            label="Initial time"
            unit="min"
            value={minutes}
            onChange={(v) =>
              setMinutes(clamp(v, CUSTOM_TC_LIMITS.minInitialMin, CUSTOM_TC_LIMITS.maxInitialMin))
            }
            onStepDown={() => stepMinutes(-1)}
            onStepUp={() => stepMinutes(+1)}
            quickValues={[1, 3, 5, 10, 15, 30, 60, 90]}
            onQuick={(v) => setMinutes(v)}
            inputStep={0.5}
            min={CUSTOM_TC_LIMITS.minInitialMin}
            max={CUSTOM_TC_LIMITS.maxInitialMin}
          />

          {/* Increment */}
          <Stepper
            label="Increment"
            unit="sec"
            value={increment}
            onChange={(v) =>
              setIncrement(
                clamp(v, CUSTOM_TC_LIMITS.minIncrementSec, CUSTOM_TC_LIMITS.maxIncrementSec)
              )
            }
            onStepDown={() => stepIncrement(-1)}
            onStepUp={() => stepIncrement(+1)}
            quickValues={[0, 1, 2, 3, 5, 10, 15, 30]}
            onQuick={(v) => setIncrement(v)}
            inputStep={1}
            min={CUSTOM_TC_LIMITS.minIncrementSec}
            max={CUSTOM_TC_LIMITS.maxIncrementSec}
          />

          <Button
            size="lg"
            className="w-full"
            disabled={!tc}
            onClick={() => tc && onPlay(tc.id)}
          >
            {tc ? `Play ${tc.label} ${bucket}` : "Out of range"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stepper({
  label,
  unit,
  value,
  onChange,
  onStepDown,
  onStepUp,
  quickValues,
  onQuick,
  inputStep,
  min,
  max,
}: {
  label: string;
  unit: string;
  value: number;
  onChange: (v: number) => void;
  onStepDown: () => void;
  onStepUp: () => void;
  quickValues: number[];
  onQuick: (v: number) => void;
  inputStep: number;
  min: number;
  max: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="eyebrow !mt-0">{label}</span>
        <span className="font-mono text-[12px] text-[var(--fg-muted)]">
          {value} {unit}
        </span>
      </div>
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={onStepDown}
          className="size-10 inline-flex items-center justify-center rounded-md border border-[var(--border-strong)] hover:border-[var(--fg)] transition-colors"
        >
          <Minus className="size-4" strokeWidth={1.75} />
        </button>
        <input
          type="number"
          inputMode="decimal"
          step={inputStep}
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onChange(v);
          }}
          className="flex-1 h-10 rounded-md border border-[var(--border-strong)] bg-[var(--bg-elev)] text-center font-mono text-[14px] focus:outline-none focus:border-[var(--accent)]"
        />
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={onStepUp}
          className="size-10 inline-flex items-center justify-center rounded-md border border-[var(--border-strong)] hover:border-[var(--fg)] transition-colors"
        >
          <Plus className="size-4" strokeWidth={1.75} />
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {quickValues.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onQuick(v)}
            className={`font-mono text-[11px] px-2 py-1 rounded border transition-colors ${
              value === v
                ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                : "border-[var(--border)] hover:border-[var(--border-strong)] text-[var(--fg-muted)]"
            }`}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

function Searching({
  tcId,
  elapsed,
  queueSize,
  onCancel,
}: {
  tcId: string;
  elapsed: number;
  queueSize: number;
  onCancel: () => void;
}) {
  const tc = resolveTimeControl(tcId);
  const meta = tc ? BUCKET_META[tc.bucket] : BUCKET_META.rapid;
  const Icon = meta.Icon;
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  const widening = elapsed >= 10;

  return (
    <div className="flex-1 flex items-center justify-center p-10">
      <div className="flex flex-col items-center gap-8 text-center max-w-[520px]">
        <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--fg-muted)] inline-flex items-center gap-2">
          <Icon className="size-3.5" strokeWidth={1.75} style={{ color: meta.tint }} />
          Searching · {tc?.label} {tc?.bucket} · Rated
        </div>

        <div className="relative w-[220px] h-[220px]">
          <svg width="220" height="220" viewBox="0 0 220 220" className="absolute inset-0">
            <circle cx="110" cy="110" r="100" stroke="var(--border)" strokeWidth="1.5" fill="none" />
            <circle
              cx="110"
              cy="110"
              r="100"
              stroke="var(--fg)"
              strokeWidth="1.5"
              fill="none"
              strokeDasharray="628"
              strokeDashoffset="280"
              transform="rotate(-90 110 110)"
              strokeLinecap="round"
            >
              <animate
                attributeName="stroke-dashoffset"
                from="628"
                to="0"
                dur="3s"
                repeatCount="indefinite"
              />
            </circle>
            <circle
              cx="110"
              cy="110"
              r="78"
              stroke="var(--border)"
              strokeWidth="1"
              fill="none"
              strokeDasharray="2 4"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="font-serif text-[64px] leading-none">{"♞"}</div>
            <div className="font-mono text-[12px] text-[var(--fg-muted)] mt-1 tabular">
              {mm}:{ss}
            </div>
          </div>
        </div>

        <div>
          <h1 className="text-[28px] font-medium tracking-tight mb-2">
            Finding a fair opponent…
          </h1>
          <p className="text-[var(--fg-muted)] text-[14px]">
            Looking within ±100 of your rating. Widening every 10 seconds.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 justify-center">
          <span className="chip">Rating range ±100{widening ? " → ±150" : ""}</span>
          <span className="chip">Same region preferred</span>
          <span className="chip chip-green chip-dot">{queueSize} candidates seen</span>
        </div>

        <Button variant="outline" onClick={onCancel}>
          Cancel search
        </Button>
      </div>
    </div>
  );
}
