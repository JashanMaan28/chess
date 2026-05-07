"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { Dialog, DialogContent } from "./ui/dialog";
import { api } from "@/lib/api";

type UserHit = { username: string; eloBlitz: number };
type OpeningHit = { id: string; eco: string; name: string; family: string };
type ThemeHit = { id: string; label: string; count: number };

type OpeningsCache = OpeningHit[] | null;
type ThemesCache = ThemeHit[] | null;

const THEME_LABEL: Record<string, string> = {
  mate: "Mate",
  mateIn1: "Mate in 1",
  mateIn2: "Mate in 2",
  mateIn3: "Mate in 3",
  fork: "Fork",
  pin: "Pin",
  skewer: "Skewer",
  crushing: "Crushing",
  middlegame: "Middlegame",
  endgame: "Endgame",
  opening: "Opening",
  hangingPiece: "Hanging piece",
  defensiveMove: "Defensive",
  discoveredAttack: "Discovered attack",
  doubleAttack: "Double attack",
  trappedPiece: "Trapped piece",
  sacrifice: "Sacrifice",
  intermezzo: "Zwischenzug",
  zugzwang: "Zugzwang",
  promotion: "Promotion",
  underPromotion: "Underpromotion",
  smotheredMate: "Smothered mate",
  backRankMate: "Back rank mate",
  enPassant: "En passant",
  exposedKing: "Exposed king",
  kingsideAttack: "Kingside attack",
  queensideAttack: "Queenside attack",
  capturingDefender: "Removing defender",
  deflection: "Deflection",
  attraction: "Attraction",
  interference: "Interference",
  xRayAttack: "X-ray attack",
  oneMove: "One-move",
};

function humanTheme(id: string): string {
  return THEME_LABEL[id] ?? id;
}

export function SearchDialog() {
  const router = useRouter();
  const { getToken, isSignedIn } = useAuth();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [users, setUsers] = React.useState<UserHit[]>([]);
  const [openings, setOpenings] = React.useState<OpeningHit[]>([]);
  const [themes, setThemes] = React.useState<ThemeHit[]>([]);
  const [active, setActive] = React.useState(0);

  const openingsCacheRef = React.useRef<OpeningsCache>(null);
  const themesCacheRef = React.useRef<ThemesCache>(null);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastQueriedUserQ = React.useRef<string>("");

  // Cmd-K / Ctrl-K shortcut.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Lazy-load openings + themes once when first opened.
  const ensureLoaded = React.useCallback(async () => {
    if (!openingsCacheRef.current) {
      try {
        const res = await fetch("/data/openings.json", { cache: "force-cache" });
        const json = (await res.json()) as {
          openings: { id: string; eco: string; name: string; family: string; ply: number }[];
        };
        // Pre-flatten to head-only entries to keep the search tight.
        openingsCacheRef.current = json.openings.map((o) => ({
          id: o.id,
          eco: o.eco,
          name: o.name,
          family: o.family,
        }));
      } catch {
        openingsCacheRef.current = [];
      }
    }
    if (!themesCacheRef.current) {
      try {
        const res = await fetch("/data/puzzles.json", { cache: "force-cache" });
        const json = (await res.json()) as { themes: { id: string; count: number }[] };
        themesCacheRef.current = json.themes.map((t) => ({
          id: t.id,
          label: humanTheme(t.id),
          count: t.count,
        }));
      } catch {
        themesCacheRef.current = [];
      }
    }
  }, []);

  React.useEffect(() => {
    if (open) ensureLoaded();
  }, [open, ensureLoaded]);

  // Local filtering (openings + themes) is instant; user search is debounced.
  React.useEffect(() => {
    const trimmed = q.trim();
    const lower = trimmed.toLowerCase();
    setActive(0);

    if (!trimmed) {
      setUsers([]);
      setOpenings([]);
      setThemes([]);
      return;
    }

    const ops = openingsCacheRef.current ?? [];
    setOpenings(
      ops
        .filter(
          (o) =>
            o.name.toLowerCase().includes(lower) ||
            o.eco.toLowerCase() === lower ||
            o.eco.toLowerCase().startsWith(lower)
        )
        .slice(0, 6)
    );

    const ts = themesCacheRef.current ?? [];
    setThemes(
      ts
        .filter(
          (t) =>
            t.label.toLowerCase().includes(lower) ||
            t.id.toLowerCase().includes(lower)
        )
        .slice(0, 5)
    );

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      lastQueriedUserQ.current = trimmed;
      try {
        const token = isSignedIn ? await getToken() : null;
        const res = await api<{ users: UserHit[] }>(
          `/users/search?q=${encodeURIComponent(trimmed)}`,
          token ? { token } : {}
        );
        // Make sure the result still matches the active query.
        if (lastQueriedUserQ.current === trimmed) setUsers(res.users);
      } catch {
        if (lastQueriedUserQ.current === trimmed) setUsers([]);
      }
    }, 180);
  }, [q, isSignedIn, getToken]);

  const flatList: Array<{ kind: "user" | "opening" | "theme"; key: string; el: React.ReactNode; go: () => void }> =
    React.useMemo(() => {
      const list: typeof flatList = [];
      for (const u of users) {
        list.push({
          kind: "user",
          key: `u:${u.username}`,
          go: () => router.push(`/u/${u.username}`),
          el: (
            <div className="flex items-center gap-3 min-w-0">
              <div
                aria-hidden
                className="size-7 rounded-full text-[11px] font-semibold text-white flex items-center justify-center flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #c8b896, #876f4e)" }}
              >
                {u.username[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] truncate">{u.username}</div>
                <div className="font-mono text-[11px] text-[var(--fg-muted)]">
                  Blitz {u.eloBlitz}
                </div>
              </div>
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--fg-muted)]">
                Player
              </span>
            </div>
          ),
        });
      }
      for (const o of openings) {
        list.push({
          kind: "opening",
          key: `o:${o.id}`,
          go: () => router.push(`/learn?o=${encodeURIComponent(o.id)}`),
          el: (
            <div className="flex items-center gap-3 min-w-0">
              <span className="font-mono text-[11px] text-[var(--fg-muted)] w-[34px] flex-shrink-0">
                {o.eco}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] truncate">{o.name}</div>
                <div className="text-[11.5px] text-[var(--fg-muted)] truncate">
                  {o.family}
                </div>
              </div>
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--fg-muted)]">
                Opening
              </span>
            </div>
          ),
        });
      }
      for (const t of themes) {
        list.push({
          kind: "theme",
          key: `t:${t.id}`,
          go: () => router.push(`/puzzles?theme=${encodeURIComponent(t.id)}`),
          el: (
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-[13.5px]">{t.label}</span>
              <span className="font-mono text-[11px] text-[var(--fg-muted)]">
                {t.count}
              </span>
              <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--fg-muted)]">
                Puzzles theme
              </span>
            </div>
          ),
        });
      }
      return list;
    }, [users, openings, themes, router]);

  // Section label boundaries
  const sections = React.useMemo(() => {
    const out: Array<{ label: string; start: number; end: number }> = [];
    if (users.length) out.push({ label: "Players", start: 0, end: users.length });
    if (openings.length)
      out.push({
        label: "Openings",
        start: users.length,
        end: users.length + openings.length,
      });
    if (themes.length)
      out.push({
        label: "Puzzles by theme",
        start: users.length + openings.length,
        end: users.length + openings.length + themes.length,
      });
    return out;
  }, [users.length, openings.length, themes.length]);

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(flatList.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = flatList[active];
      if (item) {
        item.go();
        setOpen(false);
        setQ("");
      }
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQ("");
      }}
    >
      <DialogContent className="p-0 max-w-[640px] overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)]">
          <span aria-hidden className="text-[15px] text-[var(--fg-muted)]">
            {"⌕"}
          </span>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Players, openings, puzzle themes…"
            className="flex-1 bg-transparent outline-none text-[14px]"
          />
          <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-elev-2)] text-[var(--fg-muted)]">
            Esc
          </kbd>
        </div>

        <div className="max-h-[420px] overflow-y-auto">
          {q.trim() === "" ? (
            <div className="p-5 text-[13px] text-[var(--fg-muted)]">
              Search for players, openings (by name or ECO), or puzzle themes.
            </div>
          ) : flatList.length === 0 ? (
            <div className="p-5 text-[13px] text-[var(--fg-muted)]">
              No matches.
            </div>
          ) : (
            sections.map((sec) => (
              <div key={sec.label} className="py-1">
                <div className="px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--fg-muted)]">
                  {sec.label}
                </div>
                {flatList.slice(sec.start, sec.end).map((item, i) => {
                  const idx = sec.start + i;
                  const on = idx === active;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => {
                        item.go();
                        setOpen(false);
                        setQ("");
                      }}
                      className="w-full text-left px-4 py-2"
                      style={{ background: on ? "var(--bg-elev-2)" : "transparent" }}
                    >
                      {item.el}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-2 border-t border-[var(--border)] font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--fg-muted)]">
          <span>↑↓ navigate · ↵ open</span>
          <span>⌘K to reopen</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Small button component used in the header to open the dialog.
export function SearchTrigger() {
  const [hint, setHint] = React.useState("⌘K");
  React.useEffect(() => {
    setHint(navigator.platform.toLowerCase().includes("mac") ? "⌘K" : "Ctrl+K");
  }, []);
  return (
    <button
      type="button"
      onClick={() => {
        // Synthesise the Cmd+K keydown so the global listener opens the dialog.
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: "k", metaKey: true })
        );
      }}
      className="hidden lg:flex items-center gap-2 px-3 py-1.5 border border-[var(--border)] rounded-md bg-[var(--bg-elev)] text-[12.5px] text-[var(--fg-muted)] w-[220px] hover:border-[var(--border-strong)] transition-colors"
    >
      <span aria-hidden className="text-[13px]">
        {"⌕"}
      </span>
      <span className="truncate">Search players, openings…</span>
      <kbd className="ml-auto font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-elev-2)] text-[var(--fg-muted)]">
        {hint}
      </kbd>
    </button>
  );
}
