"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { TIME_CONTROLS, TIME_CONTROL_BY_ID } from "@chess/shared/time-controls";
import { Button } from "@/components/ui/button";
import { QueueWS } from "@/lib/ws-client";
import type { ServerMsg } from "@chess/shared/protocol";
import { toast } from "sonner";

const FEATURED: { id: string; time: string; inc: string; label: string; desc: string }[] = [
  { id: "1+0", time: "1", inc: "+0", label: "Bullet", desc: "Lightning fast" },
  { id: "3+0", time: "3", inc: "+0", label: "Blitz", desc: "Most popular" },
  { id: "5+3", time: "5", inc: "+3", label: "Blitz", desc: "With increment" },
  { id: "10+0", time: "10", inc: "+0", label: "Rapid", desc: "Think a bit" },
  { id: "15+10", time: "15", inc: "+10", label: "Rapid", desc: "For deep games" },
];

export default function PlayPage() {
  const { getToken } = useAuth();
  const router = useRouter();
  const search = useSearchParams();

  const [queueing, setQueueing] = React.useState<string | null>(null);
  const [queueSize, setQueueSize] = React.useState<number>(0);
  const [elapsed, setElapsed] = React.useState<number>(0);
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
        token,
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
      ws.connect();
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
    if (tc && TIME_CONTROL_BY_ID[tc] && !queueing) {
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
          {FEATURED.map((q) => (
            <button
              key={q.id}
              type="button"
              onClick={() => startQueue(q.id)}
              className="qp-card"
            >
              <div className="font-serif text-[36px] leading-none">
                {q.time}
                <span className="text-[var(--fg-muted)] text-[22px]">{q.inc}</span>
              </div>
              <div className="eyebrow !mt-1">{q.label}</div>
              <div className="text-[12.5px] text-[var(--fg-muted)] mt-2">{q.desc}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-medium tracking-tight">All time controls</h2>
          <span className="text-[var(--fg-muted)] text-[13px]">By bucket</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {(["bullet", "blitz", "rapid"] as const).map((bucket) => {
            const items = TIME_CONTROLS.filter((t) => t.bucket === bucket);
            return (
              <div
                key={bucket}
                className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-elev)]"
              >
                <div className="px-5 py-3.5 border-b border-[var(--border)] flex items-baseline justify-between">
                  <h3 className="font-serif text-[22px] capitalize tracking-tight">{bucket}</h3>
                  <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--fg-muted)]">
                    {items.length} formats
                  </span>
                </div>
                <div className="p-2">
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
  const tc = TIME_CONTROL_BY_ID[tcId];
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  const widening = elapsed >= 10;

  return (
    <div className="flex-1 flex items-center justify-center p-10">
      <div className="flex flex-col items-center gap-8 text-center max-w-[520px]">
        <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--fg-muted)]">
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
