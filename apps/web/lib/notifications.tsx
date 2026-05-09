"use client";
import * as React from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { api } from "./api";
import { toast } from "sonner";
import type { Notification, NotificationKind } from "@chess/shared/notifications";

type RawNotification = {
  id: string;
  kind: NotificationKind;
  payload: Record<string, unknown>;
  readAt: number | null;
  createdAt: number;
};

type Ctx = {
  items: Notification[];
  unread: number;
  markAllRead: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const NotificationsContext = React.createContext<Ctx | null>(null);

const POLL_INTERVAL_MS = 5_000;
const MAX_HISTORY = 30;

/**
 * Fetches /me/notifications every ~5s while the page is visible. Pauses when
 * the tab is hidden so we don't burn worker invocations on background tabs.
 * Surfaces toasts for new challenge_received / challenge_accepted events.
 */
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, getToken, userId } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const [items, setItems] = React.useState<Notification[]>([]);
  const [unread, setUnread] = React.useState(0);
  const seenIdsRef = React.useRef<Set<string>>(new Set());
  const sinceRef = React.useRef<number>(0);

  const fetchNotifications = React.useCallback(
    async (since?: number): Promise<{ items: Notification[]; unread: number } | null> => {
      const token = await getToken().catch(() => null);
      if (!token) return null;
      const path =
        since && since > 0
          ? `/me/notifications?since=${since}&limit=20`
          : `/me/notifications?limit=20`;
      try {
        const res = await api<{ items: RawNotification[]; unread: number }>(path, {
          token,
        });
        return {
          items: res.items as Notification[],
          unread: res.unread,
        };
      } catch {
        return null;
      }
    },
    [getToken]
  );

  // Toast + side-effect handler for new notifications. Runs once per id.
  const handleIncoming = React.useCallback(
    (n: Notification) => {
      if (seenIdsRef.current.has(n.id)) return;
      seenIdsRef.current.add(n.id);
      // Don't toast on initial hydration — sinceRef is 0 only on first fetch.
      if (sinceRef.current === 0) return;

      switch (n.kind) {
        case "challenge_received": {
          const p = n.payload as { fromUsername: string; timeControl: string };
          toast(`${p.fromUsername} challenged you`, {
            description: `${p.timeControl} · click to view`,
            action: {
              label: "Open",
              onClick: () => {
                /* dropdown opens from the bell — clicking takes user there. */
              },
            },
          });
          break;
        }
        case "challenge_accepted": {
          const p = n.payload as {
            toUsername: string;
            gameId?: string | null;
          };
          toast.success(`${p.toUsername} accepted your challenge`, {
            description: "Joining the game…",
          });
          if (p.gameId) router.push(`/game/${p.gameId}`);
          break;
        }
        case "challenge_declined": {
          const p = n.payload as { toUsername: string };
          toast(`${p.toUsername} declined your challenge`);
          break;
        }
        case "challenge_cancelled": {
          // Sender pulled it back — silently update inboxes.
          break;
        }
        case "new_follower": {
          const p = n.payload as { fromUsername: string };
          toast(`${p.fromUsername} followed you`);
          break;
        }
      }
    },
    [router]
  );

  const refresh = React.useCallback(async () => {
    if (!isSignedIn || !userId) return;
    const since = sinceRef.current;
    const res = await fetchNotifications(since);
    if (!res) return;

    if (since === 0) {
      // Initial hydrate: seed the seen-set so we don't toast existing items.
      for (const n of res.items) seenIdsRef.current.add(n.id);
      setItems(res.items);
      setUnread(res.unread);
      // Use the newest item's createdAt (or now if list is empty) as our high
      // watermark so subsequent polls only fetch deltas.
      sinceRef.current = res.items[0]?.createdAt ?? Date.now();
      return;
    }

    if (res.items.length > 0) {
      // Process new arrivals oldest → newest so toasts pop in order.
      const fresh = [...res.items].reverse();
      for (const n of fresh) handleIncoming(n);
      setItems((prev) => {
        // Prepend new + de-dupe by id.
        const byId = new Map<string, Notification>();
        for (const n of res.items) byId.set(n.id, n);
        for (const n of prev) if (!byId.has(n.id)) byId.set(n.id, n);
        const merged = Array.from(byId.values()).sort(
          (a, b) => b.createdAt - a.createdAt
        );
        return merged.slice(0, MAX_HISTORY);
      });
      sinceRef.current = res.items[0]!.createdAt;
    }
    // Always refresh unread from server (handles read events from elsewhere).
    setUnread(res.unread);
  }, [isSignedIn, userId, fetchNotifications, handleIncoming]);

  // Reset state when user changes / signs out.
  React.useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      seenIdsRef.current.clear();
      sinceRef.current = 0;
      setItems([]);
      setUnread(0);
    }
  }, [isLoaded, isSignedIn, userId]);

  // Initial fetch + interval polling. Pauses while document hidden.
  React.useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) return;
    let cancelled = false;
    let timer: number | null = null;

    const tick = async () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.hidden) return;
      await refresh();
    };

    // First fetch ASAP, then interval.
    tick();
    timer = window.setInterval(tick, POLL_INTERVAL_MS);

    const onVisibility = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (timer != null) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [isLoaded, isSignedIn, userId, refresh]);

  // Note: Clerk's `user` lifecycle is handled by useAuth in the same hook tree.
  void user;

  const markRead = React.useCallback(
    async (id: string) => {
      const token = await getToken().catch(() => null);
      if (!token) return;
      // Optimistic.
      setItems((prev) =>
        prev.map((n) => (n.id === id && n.readAt === null ? { ...n, readAt: Date.now() } : n))
      );
      setUnread((u) => Math.max(0, u - 1));
      try {
        await api(`/me/notifications/${id}/read`, { method: "POST", token });
      } catch {
        // Re-poll on failure to resync.
        await refresh();
      }
    },
    [getToken, refresh]
  );

  const markAllRead = React.useCallback(async () => {
    const token = await getToken().catch(() => null);
    if (!token) return;
    const now = Date.now();
    setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })));
    setUnread(0);
    try {
      await api(`/me/notifications/read-all`, { method: "POST", token });
    } catch {
      await refresh();
    }
  }, [getToken, refresh]);

  const value = React.useMemo<Ctx>(
    () => ({ items, unread, markAllRead, markRead, refresh }),
    [items, unread, markAllRead, markRead, refresh]
  );

  return (
    <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
  );
}

export function useNotifications(): Ctx {
  const ctx = React.useContext(NotificationsContext);
  if (!ctx) {
    // Outside provider — return a no-op shim so call sites are safe.
    return {
      items: [],
      unread: 0,
      markAllRead: async () => {},
      markRead: async () => {},
      refresh: async () => {},
    };
  }
  return ctx;
}
