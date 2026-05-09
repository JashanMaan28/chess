"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { Bell, Check, Swords, UserPlus, X } from "lucide-react";
import { api } from "@/lib/api";
import { useNotifications } from "@/lib/notifications";
import { toast } from "sonner";
import type { Notification } from "@chess/shared/notifications";

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function NotificationBell() {
  const { isSignedIn, getToken } = useAuth();
  const { items, unread, markAllRead, markRead, refresh } = useNotifications();
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Click-outside to close.
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Esc closes.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!isSignedIn) return null;

  const accept = async (n: Notification) => {
    const challengeId = (n.payload as { challengeId?: string }).challengeId;
    if (!challengeId) return;
    const token = await getToken().catch(() => null);
    if (!token) return;
    try {
      const res = await api<{ gameId: string }>(`/challenges/${challengeId}/accept`, {
        method: "POST",
        token,
      });
      await markRead(n.id);
      setOpen(false);
      router.push(`/game/${res.gameId}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not accept";
      toast.error(msg);
    }
  };

  const decline = async (n: Notification) => {
    const challengeId = (n.payload as { challengeId?: string }).challengeId;
    if (!challengeId) return;
    const token = await getToken().catch(() => null);
    if (!token) return;
    try {
      await api(`/challenges/${challengeId}/decline`, {
        method: "POST",
        token,
      });
      await markRead(n.id);
      await refresh();
    } catch {
      toast.error("Could not decline");
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => setOpen((o) => !o)}
        className="relative inline-flex size-8 items-center justify-center rounded-md text-[var(--ink-2)] hover:bg-[var(--bg-elev-2)] transition-colors"
      >
        <Bell className="size-4" strokeWidth={1.75} />
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-mono font-medium flex items-center justify-center"
            style={{
              background: "var(--accent)",
              color: "var(--accent-fg)",
            }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-[340px] sm:w-[380px] rounded-[10px] border border-[var(--border)] bg-[var(--bg-elev)] shadow-[var(--shadow-lg)] z-50 overflow-hidden"
          role="dialog"
          aria-label="Notifications"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
            <div className="flex items-baseline gap-2">
              <h3 className="text-[14px] font-medium tracking-tight">Notifications</h3>
              {unread > 0 && (
                <span className="font-mono text-[11px] text-[var(--accent)]">
                  {unread} new
                </span>
              )}
            </div>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-[12px] text-[var(--fg-muted)] hover:text-[var(--fg)]"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center text-[13px] text-[var(--fg-muted)]">
                You&apos;re caught up.
              </div>
            ) : (
              items.map((n) => (
                <NotificationRow
                  key={n.id}
                  n={n}
                  onMarkRead={() => markRead(n.id)}
                  onAccept={() => accept(n)}
                  onDecline={() => decline(n)}
                  closeMenu={() => setOpen(false)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationRow({
  n,
  onMarkRead,
  onAccept,
  onDecline,
  closeMenu,
}: {
  n: Notification;
  onMarkRead: () => void;
  onAccept: () => void;
  onDecline: () => void;
  closeMenu: () => void;
}) {
  const unread = n.readAt === null;
  const p = n.payload as {
    fromUsername?: string;
    toUsername?: string;
    timeControl?: string;
    gameId?: string | null;
    challengeId?: string;
  };

  let icon: React.ReactNode = null;
  let title: React.ReactNode = null;
  let body: React.ReactNode = null;
  let actions: React.ReactNode = null;

  switch (n.kind) {
    case "challenge_received":
      icon = <Swords className="size-4" strokeWidth={1.75} style={{ color: "var(--danger)" }} />;
      title = (
        <>
          <Link
            href={`/u/${p.fromUsername}`}
            onClick={closeMenu}
            className="font-medium hover:underline"
          >
            {p.fromUsername}
          </Link>{" "}
          <span className="text-[var(--fg-muted)]">challenged you</span>
        </>
      );
      body = <span className="font-mono text-[11.5px]">{p.timeControl}</span>;
      actions = (
        <div className="flex gap-1.5 mt-2">
          <button
            type="button"
            onClick={onAccept}
            className="px-2.5 h-7 inline-flex items-center gap-1 rounded-md text-[12px] font-medium bg-[var(--fg)] text-[var(--bg)] hover:opacity-90 transition-opacity"
          >
            <Check className="size-3.5" /> Accept
          </button>
          <button
            type="button"
            onClick={onDecline}
            className="px-2.5 h-7 inline-flex items-center gap-1 rounded-md text-[12px] border border-[var(--border-strong)] hover:border-[var(--fg)] transition-colors"
          >
            <X className="size-3.5" /> Decline
          </button>
        </div>
      );
      break;

    case "challenge_accepted":
      icon = <Swords className="size-4" strokeWidth={1.75} style={{ color: "var(--accent)" }} />;
      title = (
        <>
          <Link
            href={`/u/${p.toUsername}`}
            onClick={closeMenu}
            className="font-medium hover:underline"
          >
            {p.toUsername}
          </Link>{" "}
          <span className="text-[var(--fg-muted)]">accepted your challenge</span>
        </>
      );
      body = (
        <Link
          href={p.gameId ? `/game/${p.gameId}` : "#"}
          onClick={closeMenu}
          className="font-mono text-[11.5px] text-[var(--accent)] hover:underline"
        >
          Open game →
        </Link>
      );
      break;

    case "challenge_declined":
      icon = <X className="size-4" strokeWidth={1.75} style={{ color: "var(--fg-muted)" }} />;
      title = (
        <>
          <span className="font-medium">{p.toUsername}</span>{" "}
          <span className="text-[var(--fg-muted)]">declined your challenge</span>
        </>
      );
      body = <span className="font-mono text-[11.5px]">{p.timeControl}</span>;
      break;

    case "challenge_cancelled":
      icon = <X className="size-4" strokeWidth={1.75} style={{ color: "var(--fg-muted)" }} />;
      title = (
        <>
          <span className="font-medium">{p.fromUsername}</span>{" "}
          <span className="text-[var(--fg-muted)]">cancelled their challenge</span>
        </>
      );
      break;

    case "new_follower":
      icon = <UserPlus className="size-4" strokeWidth={1.75} style={{ color: "var(--accent)" }} />;
      title = (
        <>
          <Link
            href={`/u/${p.fromUsername}`}
            onClick={closeMenu}
            className="font-medium hover:underline"
          >
            {p.fromUsername}
          </Link>{" "}
          <span className="text-[var(--fg-muted)]">followed you</span>
        </>
      );
      break;
  }

  return (
    <div
      onClick={() => unread && onMarkRead()}
      className={`relative flex gap-3 px-4 py-3 border-b border-[var(--border)] last:border-b-0 cursor-pointer hover:bg-[var(--bg-elev-2)] transition-colors ${
        unread ? "bg-[var(--accent-soft)]/30" : ""
      }`}
    >
      <div className="flex-shrink-0 mt-0.5">
        <div className="size-7 rounded-md border border-[var(--border)] bg-[var(--bg-elev-2)] flex items-center justify-center">
          {icon}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] leading-snug">{title}</div>
        {body && <div className="mt-0.5">{body}</div>}
        {actions}
        <div className="text-[11px] font-mono text-[var(--fg-muted)] mt-1.5">
          {relativeTime(n.createdAt)}
        </div>
      </div>
      {unread && (
        <span
          className="absolute right-3 top-3 size-1.5 rounded-full"
          style={{ background: "var(--accent)" }}
          aria-label="unread"
        />
      )}
    </div>
  );
}
