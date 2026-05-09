"use client";
import * as React from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { TIME_CONTROLS, type TimeControlBucket } from "@chess/shared/time-controls";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { api } from "@/lib/api";
import { Loader2, Swords, X, Zap, Flame, Timer, BookOpen, type LucideIcon } from "lucide-react";

type Color = "white" | "black" | "random";

const BUCKET_ICON: Record<TimeControlBucket, LucideIcon> = {
  bullet: Zap,
  blitz: Flame,
  rapid: Timer,
  classical: BookOpen,
};

const POLL_MS = 1500;

export function ChallengeDialog({
  username,
  trigger,
  defaultTc = "5+0",
}: {
  username: string;
  trigger: React.ReactNode;
  defaultTc?: string;
}) {
  const { getToken } = useAuth();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [tcId, setTcId] = React.useState(defaultTc);
  const [color, setColor] = React.useState<Color>("random");
  const [sending, setSending] = React.useState(false);

  // After sending, we hold a `pendingId` until the recipient accepts/declines.
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [pendingExpiresAt, setPendingExpiresAt] = React.useState<number>(0);
  const [pendingStatus, setPendingStatus] = React.useState<
    "pending" | "accepted" | "declined" | "cancelled" | "expired"
  >("pending");

  const reset = () => {
    setSending(false);
    setPendingId(null);
    setPendingExpiresAt(0);
    setPendingStatus("pending");
  };

  const send = async () => {
    const token = await getToken();
    if (!token) {
      toast.error("Sign in to challenge friends.");
      return;
    }
    setSending(true);
    try {
      const res = await api<{ id: string; expiresAt: number; timeControl: string }>(
        "/challenges",
        {
          method: "POST",
          token,
          body: JSON.stringify({ toUsername: username, timeControl: tcId, color }),
        }
      );
      setPendingId(res.id);
      setPendingExpiresAt(res.expiresAt);
      setPendingStatus("pending");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not send challenge.";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  // Poll the challenge until it's accepted/declined/cancelled/expired.
  React.useEffect(() => {
    if (!pendingId || !open) return;
    let cancelled = false;
    let timer: number | null = null;

    const tick = async () => {
      if (cancelled) return;
      const token = await getToken().catch(() => null);
      if (!token) return;
      try {
        const ch = await api<{ status: string; gameId: string | null }>(
          `/challenges/${pendingId}`,
          { token }
        );
        if (cancelled) return;
        if (ch.status === "accepted" && ch.gameId) {
          setPendingStatus("accepted");
          toast.success(`${username} accepted!`, { description: "Joining the game…" });
          setOpen(false);
          router.push(`/game/${ch.gameId}`);
          return;
        }
        if (ch.status === "declined") {
          setPendingStatus("declined");
          return; // stop polling; show final state
        }
        if (ch.status === "expired") {
          setPendingStatus("expired");
          return;
        }
        if (ch.status === "cancelled") {
          setPendingStatus("cancelled");
          return;
        }
      } catch {
        // ignore — keep polling
      }
    };

    tick();
    timer = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      if (timer != null) window.clearInterval(timer);
    };
  }, [pendingId, open, getToken, router, username]);

  const cancel = async () => {
    if (!pendingId) return;
    const token = await getToken().catch(() => null);
    if (!token) return;
    try {
      await api(`/challenges/${pendingId}/cancel`, { method: "POST", token });
    } catch {
      /* ignore */
    }
    reset();
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Swords className="size-4" strokeWidth={1.75} />
            Challenge {username}
          </DialogTitle>
          <DialogDescription>
            They&apos;ll get a notification. Pending challenges expire in 10 minutes.
          </DialogDescription>
        </DialogHeader>

        {!pendingId ? (
          <div className="flex flex-col gap-5 mt-4">
            <div className="flex flex-col gap-2">
              <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--fg-muted)]">
                Time control
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 max-h-[260px] overflow-y-auto">
                {TIME_CONTROLS.map((tc) => {
                  const on = tc.id === tcId;
                  const Icon = BUCKET_ICON[tc.bucket];
                  return (
                    <button
                      key={tc.id}
                      type="button"
                      onClick={() => setTcId(tc.id)}
                      className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-md border text-[12.5px] font-mono transition-colors"
                      style={{
                        borderColor: on ? "var(--fg)" : "var(--border)",
                        background: on ? "var(--bg-elev-2)" : "transparent",
                      }}
                    >
                      <Icon className="size-3" strokeWidth={1.75} />
                      {tc.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--fg-muted)]">
                Your color
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {(["white", "random", "black"] as Color[]).map((c) => {
                  const on = c === color;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className="px-2.5 py-2 rounded-md border text-[13px] capitalize transition-colors"
                      style={{
                        borderColor: on ? "var(--fg)" : "var(--border)",
                        background: on ? "var(--bg-elev-2)" : "transparent",
                      }}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>

            <Button onClick={send} disabled={sending}>
              {sending ? "Sending…" : `Send challenge to ${username}`}
            </Button>
          </div>
        ) : (
          <PendingState
            username={username}
            tcId={tcId}
            status={pendingStatus}
            expiresAt={pendingExpiresAt}
            onCancel={cancel}
            onClose={() => {
              setOpen(false);
              reset();
            }}
            onResend={() => {
              reset();
              setPendingStatus("pending");
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PendingState({
  username,
  tcId,
  status,
  expiresAt,
  onCancel,
  onClose,
  onResend,
}: {
  username: string;
  tcId: string;
  status: "pending" | "accepted" | "declined" | "cancelled" | "expired";
  expiresAt: number;
  onCancel: () => void;
  onClose: () => void;
  onResend: () => void;
}) {
  // Live countdown to expiry.
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const remaining = Math.max(0, expiresAt - now);
  const mm = String(Math.floor(remaining / 60_000)).padStart(2, "0");
  const ss = String(Math.floor((remaining % 60_000) / 1000)).padStart(2, "0");

  if (status === "declined") {
    return (
      <div className="mt-5 flex flex-col items-center text-center gap-3">
        <div className="size-10 rounded-full bg-[var(--bg-elev-2)] flex items-center justify-center">
          <X className="size-5 text-[var(--danger)]" strokeWidth={1.75} />
        </div>
        <div className="text-[15px] font-medium tracking-tight">
          {username} declined the challenge
        </div>
        <p className="text-[13px] text-[var(--fg-muted)]">
          Maybe try a different time control?
        </p>
        <div className="flex gap-2 w-full mt-1">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Close
          </Button>
          <Button onClick={onResend} className="flex-1">
            Try again
          </Button>
        </div>
      </div>
    );
  }
  if (status === "expired") {
    return (
      <div className="mt-5 flex flex-col items-center text-center gap-3">
        <div className="text-[15px] font-medium tracking-tight">
          Challenge expired
        </div>
        <p className="text-[13px] text-[var(--fg-muted)]">
          {username} didn&apos;t respond in time.
        </p>
        <div className="flex gap-2 w-full mt-1">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Close
          </Button>
          <Button onClick={onResend} className="flex-1">
            Try again
          </Button>
        </div>
      </div>
    );
  }
  if (status === "cancelled") {
    return (
      <div className="mt-5 flex flex-col items-center text-center gap-3">
        <div className="text-[15px] font-medium tracking-tight">
          Challenge cancelled
        </div>
      </div>
    );
  }
  // status === "pending" or "accepted" (accepted is transient before redirect)
  return (
    <div className="mt-5 flex flex-col items-center text-center gap-4">
      <div className="size-12 rounded-full bg-[var(--bg-elev-2)] flex items-center justify-center">
        <Loader2 className="size-5 animate-spin text-[var(--accent)]" />
      </div>
      <div>
        <div className="text-[15px] font-medium tracking-tight">
          Waiting for {username}…
        </div>
        <p className="text-[13px] text-[var(--fg-muted)] mt-1">
          They&apos;ll see the challenge in their notifications.
          {status === "accepted" && " Joining the game…"}
        </p>
      </div>
      <div className="flex items-center gap-2 font-mono text-[12px] text-[var(--fg-muted)]">
        <span className="chip">{tcId}</span>
        <span>
          expires in{" "}
          <span className="text-[var(--fg)] tabular">
            {mm}:{ss}
          </span>
        </span>
      </div>
      <Button variant="outline" onClick={onCancel} className="w-full">
        Cancel challenge
      </Button>
    </div>
  );
}
