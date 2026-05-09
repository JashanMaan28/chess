"use client";
import * as React from "react";
import { useAuth } from "@clerk/nextjs";
import {
  TIME_CONTROLS,
  CUSTOM_TC_LIMITS,
  bucketFor,
  parseCustomTcId,
  type TimeControlBucket,
} from "@chess/shared/time-controls";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Copy,
  Check,
  Crown,
  Zap,
  Flame,
  Timer,
  BookOpen,
  Sliders,
  Plus,
  Minus,
  type LucideIcon,
} from "lucide-react";

const BUCKET_META: Record<
  TimeControlBucket | "custom",
  { Icon: LucideIcon; tint: string; label: string }
> = {
  bullet: { Icon: Zap, tint: "var(--warning)", label: "Bullet" },
  blitz: { Icon: Flame, tint: "var(--danger)", label: "Blitz" },
  rapid: { Icon: Timer, tint: "var(--accent)", label: "Rapid" },
  classical: { Icon: BookOpen, tint: "var(--ink-2)", label: "Classical" },
  custom: { Icon: Sliders, tint: "var(--accent-2)", label: "Custom" },
};

const BUCKET_ORDER: TimeControlBucket[] = ["bullet", "blitz", "rapid", "classical"];

type Tab = TimeControlBucket | "custom";

export default function FriendInvitePage() {
  const { getToken } = useAuth();

  // Selected time-control id (may be a known id or a custom "X+Y").
  const [tcId, setTcId] = React.useState("5+0");
  const [tab, setTab] = React.useState<Tab>("blitz");

  // Custom builder state.
  const [customMinutes, setCustomMinutes] = React.useState<number>(7);
  const [customIncrement, setCustomIncrement] = React.useState<number>(2);

  const [color, setColor] = React.useState<"white" | "black" | "random">("random");
  const [code, setCode] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const customTc = React.useMemo(
    () => parseCustomTcId(`${customMinutes}+${customIncrement}`),
    [customMinutes, customIncrement]
  );
  const customBucket =
    customTc?.bucket ?? bucketFor(customMinutes * 60_000, customIncrement * 1_000);

  // When the user picks the Custom tab, sync tcId to the custom value.
  React.useEffect(() => {
    if (tab === "custom" && customTc) setTcId(customTc.id);
  }, [tab, customTc]);

  const create = async () => {
    setCreating(true);
    try {
      const token = await getToken();
      const res = await api<{ code: string; expiresAt: number }>("/friend/invite", {
        method: "POST",
        token,
        body: JSON.stringify({ timeControl: tcId, color }),
      });
      setCode(res.code);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCreating(false);
    }
  };

  const link = code ? `${window.location.origin}/g/${code}` : "";
  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="mx-auto max-w-2xl px-4 pt-10 lg:pt-14 pb-12 space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Challenge a friend</h1>
        <p className="mt-1 text-[var(--fg-muted)]">
          Generate a one-time invite link. The first authenticated visitor joins as your opponent.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>Invite expires in 24 hours.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label>Time control</Label>

            {/* Bucket tabs with icons */}
            <div className="flex flex-wrap gap-1.5">
              {([...BUCKET_ORDER, "custom"] as Tab[]).map((b) => {
                const meta = BUCKET_META[b];
                const Icon = meta.Icon;
                const active = tab === b;
                return (
                  <button
                    key={b}
                    type="button"
                    onClick={() => {
                      setTab(b);
                      if (b !== "custom") {
                        const first = TIME_CONTROLS.find((t) => t.bucket === b);
                        if (first) setTcId(first.id);
                      } else if (customTc) {
                        setTcId(customTc.id);
                      }
                    }}
                    className={`inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md border text-[12.5px] font-medium transition-colors ${
                      active
                        ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                        : "border-[var(--border-strong)] text-[var(--fg-muted)] hover:border-[var(--fg)] hover:text-[var(--fg)]"
                    }`}
                  >
                    <Icon
                      className="size-3.5"
                      strokeWidth={1.75}
                      style={{ color: active ? "var(--accent)" : meta.tint }}
                    />
                    {meta.label}
                  </button>
                );
              })}
            </div>

            {tab !== "custom" ? (
              <div className="grid grid-cols-3 gap-2">
                {TIME_CONTROLS.filter((t) => t.bucket === tab).map((tc) => (
                  <button
                    key={tc.id}
                    onClick={() => setTcId(tc.id)}
                    className={`font-mono text-sm h-10 rounded-md border transition-colors ${
                      tcId === tc.id
                        ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                        : "border-[var(--border-strong)] hover:border-[var(--accent)]/50"
                    }`}
                  >
                    {tc.label}
                  </button>
                ))}
              </div>
            ) : (
              <CustomBuilder
                minutes={customMinutes}
                increment={customIncrement}
                onMinutes={setCustomMinutes}
                onIncrement={setCustomIncrement}
                bucket={customBucket}
                valid={!!customTc}
              />
            )}
          </div>

          <div className="space-y-2">
            <Label>Your color</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["white", "random", "black"] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`h-10 rounded-md border text-sm capitalize flex items-center justify-center gap-2 transition-colors ${
                    color === c
                      ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                      : "border-[var(--border-strong)] hover:border-[var(--accent)]/50"
                  }`}
                >
                  <Crown className="size-3.5" /> {c}
                </button>
              ))}
            </div>
          </div>
          <Button
            onClick={create}
            disabled={creating || (tab === "custom" && !customTc)}
            size="lg"
            className="w-full"
          >
            {creating ? "Generating…" : "Generate invite link"}
          </Button>
        </CardContent>
      </Card>

      {code && (
        <Card className="neon-glow border-[var(--accent)]">
          <CardHeader>
            <CardTitle>Share this link</CardTitle>
            <CardDescription>One use, valid for 24 hours.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input readOnly value={link} className="font-mono text-xs" />
              <Button onClick={copy} variant="outline" size="icon">
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CustomBuilder({
  minutes,
  increment,
  onMinutes,
  onIncrement,
  bucket,
  valid,
}: {
  minutes: number;
  increment: number;
  onMinutes: (v: number) => void;
  onIncrement: (v: number) => void;
  bucket: TimeControlBucket;
  valid: boolean;
}) {
  const meta = BUCKET_META[bucket];
  const BucketIcon = meta.Icon;
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elev-2)] p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span
            className="inline-flex items-center justify-center size-8 rounded-md bg-[var(--bg-elev)] border border-[var(--border)]"
            style={{ color: meta.tint }}
          >
            <BucketIcon className="size-4" strokeWidth={1.75} />
          </span>
          <div className="font-serif text-[24px] leading-none tabular">
            {minutes}
            <span className="text-[var(--fg-muted)] text-[18px]">+{increment}</span>
          </div>
        </div>
        <span className="eyebrow !mt-0 capitalize">
          {valid ? bucket : "Out of range"}
        </span>
      </div>

      <Stepper
        label="Initial time"
        unit="min"
        value={minutes}
        onChange={(v) =>
          onMinutes(clamp(v, CUSTOM_TC_LIMITS.minInitialMin, CUSTOM_TC_LIMITS.maxInitialMin))
        }
        onStepDown={() =>
          onMinutes(
            clamp(
              Math.round((minutes - 1) * 2) / 2,
              CUSTOM_TC_LIMITS.minInitialMin,
              CUSTOM_TC_LIMITS.maxInitialMin
            )
          )
        }
        onStepUp={() =>
          onMinutes(
            clamp(
              Math.round((minutes + 1) * 2) / 2,
              CUSTOM_TC_LIMITS.minInitialMin,
              CUSTOM_TC_LIMITS.maxInitialMin
            )
          )
        }
        quickValues={[1, 3, 5, 10, 15, 30, 60, 90]}
        onQuick={onMinutes}
        inputStep={0.5}
        min={CUSTOM_TC_LIMITS.minInitialMin}
        max={CUSTOM_TC_LIMITS.maxInitialMin}
      />

      <Stepper
        label="Increment"
        unit="sec"
        value={increment}
        onChange={(v) =>
          onIncrement(clamp(v, CUSTOM_TC_LIMITS.minIncrementSec, CUSTOM_TC_LIMITS.maxIncrementSec))
        }
        onStepDown={() =>
          onIncrement(clamp(increment - 1, CUSTOM_TC_LIMITS.minIncrementSec, CUSTOM_TC_LIMITS.maxIncrementSec))
        }
        onStepUp={() =>
          onIncrement(clamp(increment + 1, CUSTOM_TC_LIMITS.minIncrementSec, CUSTOM_TC_LIMITS.maxIncrementSec))
        }
        quickValues={[0, 1, 2, 3, 5, 10, 15, 30]}
        onQuick={onIncrement}
        inputStep={1}
        min={CUSTOM_TC_LIMITS.minIncrementSec}
        max={CUSTOM_TC_LIMITS.maxIncrementSec}
      />
    </div>
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
      <div className="flex items-center justify-between mb-1.5">
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
          className="size-9 inline-flex items-center justify-center rounded-md border border-[var(--border-strong)] hover:border-[var(--fg)] transition-colors"
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
          className="flex-1 h-9 rounded-md border border-[var(--border-strong)] bg-[var(--bg-elev)] text-center font-mono text-[14px] focus:outline-none focus:border-[var(--accent)]"
        />
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={onStepUp}
          className="size-9 inline-flex items-center justify-center rounded-md border border-[var(--border-strong)] hover:border-[var(--fg)] transition-colors"
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
