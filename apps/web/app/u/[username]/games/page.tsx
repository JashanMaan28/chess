import Link from "next/link";
import { notFound } from "next/navigation";
import { API_URL } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { TIME_CONTROLS } from "@chess/shared/time-controls";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Game = {
  id: string;
  whiteId: string;
  blackId: string;
  whiteUsername: string;
  blackUsername: string;
  whiteFirstName: string;
  blackFirstName: string;
  result: string;
  termination: string | null;
  timeControl: string;
  endedAt: number;
  whiteEloBefore: number | null;
  blackEloBefore: number | null;
  whiteEloAfter: number | null;
  blackEloAfter: number | null;
};

type GamesResponse = {
  page: number;
  limit: number;
  user: { username: string; firstName: string };
  games: Game[];
};

async function getGames(username: string, tc: string | undefined, page: number) {
  const params = new URLSearchParams({ page: String(page) });
  if (tc) params.set("tc", tc);
  const res = await fetch(`${API_URL}/u/${username}/games?${params}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return res.json() as Promise<GamesResponse>;
}

function shortDate(ms: number | null): string {
  if (!ms) return "—";
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });
}

function shortTime(ms: number | null): string {
  if (!ms) return "";
  const d = new Date(ms);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function resolveResult(g: Game, me: string): "W" | "L" | "D" | "·" {
  if (g.result === "*") return "·";
  if (g.result === "1/2-1/2") return "D";
  const iAmWhite = g.whiteUsername === me;
  if (g.result === "1-0") return iAmWhite ? "W" : "L";
  if (g.result === "0-1") return iAmWhite ? "L" : "W";
  return "·";
}

function eloDelta(g: Game, me: string): number | null {
  const iAmWhite = g.whiteUsername === me;
  const before = iAmWhite ? g.whiteEloBefore : g.blackEloBefore;
  const after = iAmWhite ? g.whiteEloAfter : g.blackEloAfter;
  if (before == null || after == null) return null;
  return after - before;
}

function prettyTermination(t: string | null): string {
  if (!t) return "—";
  return t.replace(/_/g, " ");
}

export default async function GameHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ tc?: string; page?: string }>;
}) {
  const { username } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page || "1"));
  const data = await getGames(username, sp.tc, page);
  if (!data) return notFound();
  const displayName = data.user.firstName || username;
  const initial = displayName.slice(0, 2).toUpperCase();
  const empty = data.games.length === 0;

  return (
    <div className="px-6 sm:px-10 lg:px-14 pt-9 pb-12 max-w-[1280px] mx-auto w-full">
      {/* Hero */}
      <div className="flex items-end gap-4 mb-7 flex-wrap">
        <div
          aria-hidden
          className="size-[64px] rounded-2xl text-[22px] font-semibold text-white flex items-center justify-center flex-shrink-0"
          style={{ background: "linear-gradient(135deg, #c8b896, #876f4e)" }}
        >
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="eyebrow mb-1">Game history</div>
          <h1 className="h-display">{displayName}</h1>
        </div>
        <Link href={`/u/${username}`}>
          <Button variant="outline">Back to profile</Button>
        </Link>
      </div>

      {/* Time-control filter */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        <FilterChip
          href={`/u/${username}/games`}
          label="All"
          active={!sp.tc}
        />
        {TIME_CONTROLS.map((tc) => (
          <FilterChip
            key={tc.id}
            href={`/u/${username}/games?tc=${encodeURIComponent(tc.id)}`}
            label={tc.label}
            active={sp.tc === tc.id}
          />
        ))}
      </div>

      {/* List */}
      {empty ? (
        <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-elev)] py-16 text-center">
          <div className="font-serif text-[28px] mb-1.5 leading-tight">No games here.</div>
          <p className="text-[14px] text-[var(--fg-muted)]">
            {sp.tc
              ? "Try a different time control, or"
              : "Start a match to fill out the archive —"}{" "}
            <Link href="/play" className="underline decoration-dotted hover:text-[var(--fg)]">
              find a match
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-elev)] overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--border)] flex items-baseline justify-between">
            <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--fg-muted)]">
              Page {data.page} · {data.games.length} games
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--fg-muted)] hidden sm:inline">
              Newest first
            </span>
          </div>
          <ul>
            {data.games.map((g, i) => {
              const res = resolveResult(g, username);
              const iAmWhite = g.whiteUsername === username;
              const opp = iAmWhite ? g.blackUsername : g.whiteUsername;
              const oppFirstName = iAmWhite ? g.blackFirstName : g.whiteFirstName;
              const oppDisplay = oppFirstName || opp;
              const myColor = iAmWhite ? "white" : "black";
              const delta = eloDelta(g, username);
              const cls =
                res === "W"
                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                  : res === "L"
                    ? "bg-[#f7e1dd] text-[var(--danger)]"
                    : res === "D"
                      ? "bg-[var(--bg-elev-2)] text-[var(--fg-muted)]"
                      : "bg-[var(--bg-elev-2)] text-[var(--fg-subtle)]";
              return (
                <li
                  key={g.id}
                  className={`flex items-center gap-4 px-5 py-3.5 ${
                    i < data.games.length - 1 ? "border-b border-[var(--border)]" : ""
                  } hover:bg-[var(--bg-elev-2)] transition-colors`}
                >
                  {/* Result pill */}
                  <div
                    className={`size-9 rounded-md text-[14px] font-semibold flex items-center justify-center flex-shrink-0 ${cls}`}
                    aria-label={`Result ${res}`}
                  >
                    {res}
                  </div>
                  {/* Opponent + meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[14.5px] font-medium tracking-tight">
                        vs{" "}
                        <Link
                          href={`/u/${opp}`}
                          className="hover:underline"
                        >
                          {oppDisplay || "—"}
                        </Link>
                      </span>
                      <span className="font-mono text-[11px] px-1.5 py-0.5 rounded border border-[var(--border)] text-[var(--fg-muted)]">
                        {g.timeControl}
                      </span>
                      <span
                        className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--fg-muted)]"
                        title={`played as ${myColor}`}
                      >
                        as {myColor}
                      </span>
                    </div>
                    <div className="text-[12px] text-[var(--fg-muted)] mt-0.5">
                      {prettyTermination(g.termination)} ·{" "}
                      {g.result === "*"
                        ? "ongoing"
                        : g.result.replace("1/2-1/2", "½–½")}{" "}
                      · {shortDate(g.endedAt)}{" "}
                      <span className="hidden sm:inline">at {shortTime(g.endedAt)}</span>
                    </div>
                  </div>
                  {/* Elo delta */}
                  {delta !== null && (
                    <div
                      className={`font-mono text-[12.5px] tabular hidden sm:block ${
                        delta > 0
                          ? "text-[var(--success)]"
                          : delta < 0
                            ? "text-[var(--danger)]"
                            : "text-[var(--fg-muted)]"
                      }`}
                    >
                      {delta > 0 ? "+" : ""}
                      {delta}
                    </div>
                  )}
                  {/* Review link */}
                  <Link
                    href={`/game/${g.id}`}
                    className="text-[12.5px] text-[var(--fg-muted)] hover:text-[var(--fg)] px-3 py-1.5 rounded-md border border-transparent hover:border-[var(--border)] transition-colors flex-shrink-0"
                  >
                    Review →
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Pagination */}
      {!empty && (
        <div className="flex items-center justify-between mt-5">
          {page > 1 ? (
            <Link
              href={`/u/${username}/games?${new URLSearchParams({
                ...(sp.tc ? { tc: sp.tc } : {}),
                page: String(page - 1),
              })}`}
              className="inline-flex items-center gap-1 text-[13px] text-[var(--fg-muted)] hover:text-[var(--fg)] px-3 py-1.5 rounded-md border border-[var(--border)] hover:border-[var(--fg)] transition-colors"
            >
              <ChevronLeft className="size-3.5" /> Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="text-[12px] font-mono text-[var(--fg-muted)]">
            Page {page}
          </span>
          {data.games.length === data.limit ? (
            <Link
              href={`/u/${username}/games?${new URLSearchParams({
                ...(sp.tc ? { tc: sp.tc } : {}),
                page: String(page + 1),
              })}`}
              className="inline-flex items-center gap-1 text-[13px] text-[var(--fg-muted)] hover:text-[var(--fg)] px-3 py-1.5 rounded-md border border-[var(--border)] hover:border-[var(--fg)] transition-colors"
            >
              Older <ChevronRight className="size-3.5" />
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`text-[12px] font-mono uppercase tracking-wider px-3 py-1.5 rounded-md border transition-colors ${
        active
          ? "border-[var(--fg)] bg-[var(--fg)] text-[var(--bg)]"
          : "border-[var(--border-strong)] text-[var(--fg-muted)] hover:text-[var(--fg)] hover:border-[var(--fg)]"
      }`}
    >
      {label}
    </Link>
  );
}
