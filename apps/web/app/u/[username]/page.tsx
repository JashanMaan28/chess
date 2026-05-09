import Link from "next/link";
import { notFound } from "next/navigation";
import { API_URL } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ProfileActions } from "@/components/profile-actions";

type ColorRecord = { wins: number; draws: number; losses: number; games: number };

type Profile = {
  user: {
    username: string;
    eloBullet: number;
    eloBlitz: number;
    eloRapid: number;
    gamesPlayed: number;
    createdAt: number;
  };
  record: { wins: number; losses: number; draws: number };
  byColor: { white: ColorRecord; black: ColorRecord };
  activity: { days: number; oldestDay: number; counts: number[] };
  sparklines: { bullet: number[]; blitz: number[]; rapid: number[] };
  recent: Array<{
    id: string;
    timeControl: string;
    whiteUsername: string;
    blackUsername: string;
    result: string;
    endedAt: number;
  }>;
};

async function getProfile(username: string): Promise<Profile | null> {
  const res = await fetch(`${API_URL}/u/${username}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return res.json();
}

const RATING_TILES = [
  { key: "eloBullet", label: "Bullet", spark: "bullet" },
  { key: "eloBlitz", label: "Blitz", spark: "blitz" },
  { key: "eloRapid", label: "Rapid", spark: "rapid" },
] as const;

function shortMonthDay(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function resultFor(g: Profile["recent"][number], me: string): "W" | "L" | "D" {
  if (g.result === "1/2-1/2") return "D";
  const iAmWhite = g.whiteUsername === me;
  const whiteWon = g.result === "1-0";
  if (whiteWon) return iAmWhite ? "W" : "L";
  if (g.result === "0-1") return iAmWhite ? "L" : "W";
  return "D";
}

/**
 * Build an SVG path from a series of rating values, normalized to the SVG box.
 * Returns null when the series is too short to plot.
 */
function sparklinePath(values: number[], w = 200, h = 40, pad = 2): string | null {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = (w - pad * 2) / (values.length - 1);
  const points = values.map((v, i) => {
    const x = pad + stepX * i;
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return "M" + points.join(" L");
}

function colorRecordPercent(r: ColorRecord): { winPct: number; drawPct: number; lossPct: number } {
  const total = Math.max(1, r.games);
  return {
    winPct: (r.wins / total) * 100,
    drawPct: (r.draws / total) * 100,
    lossPct: (r.losses / total) * 100,
  };
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const data = await getProfile(username);
  if (!data) return notFound();
  const { user, record, byColor, activity, sparklines, recent } = data;

  const memberSince = new Date(user.createdAt).getFullYear();
  const initial = user.username.slice(0, 2).toUpperCase();

  // Activity heatmap layout.
  const heatMax = Math.max(0, ...activity.counts);
  const colorForCount = (n: number): string => {
    if (n === 0) return "var(--bg-elev-2)";
    if (heatMax <= 1) return "#94a566";
    const t = n / heatMax;
    if (t < 0.25) return "#dde2c8";
    if (t < 0.5) return "#bcc798";
    if (t < 0.75) return "#94a566";
    return "#687d3a";
  };
  const totalGamesIn12w = activity.counts.reduce((a, b) => a + b, 0);

  return (
    <div className="px-6 sm:px-10 lg:px-14 pt-9 pb-12 max-w-[1280px] mx-auto w-full">
      {/* Hero */}
      <div className="flex items-end gap-6 mb-8 flex-wrap">
        <div
          aria-hidden
          className="size-[88px] rounded-2xl text-[32px] font-semibold text-white flex items-center justify-center flex-shrink-0"
          style={{ background: "linear-gradient(135deg, #c8b896, #876f4e)" }}
        >
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="eyebrow mb-1">
            Member since {memberSince} · {user.gamesPlayed} games
          </div>
          <h1 className="h-display">{user.username}</h1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="chip">
              {record.wins}W · {record.draws}D · {record.losses}L
            </span>
            <span className="chip chip-green">Blitz {user.eloBlitz}</span>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ProfileActions username={user.username} />
          <Link href={`/u/${user.username}/games`}>
            <Button variant="outline">All games</Button>
          </Link>
        </div>
      </div>

      {/* Rating tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {RATING_TILES.map((t) => {
          const value = user[t.key];
          const series = sparklines[t.spark];
          const path = sparklinePath(series);
          const trend =
            series.length >= 2 ? series[series.length - 1]! - series[0]! : 0;
          return (
            <div
              key={t.key}
              className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-elev)] p-5"
            >
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="font-serif text-[38px] leading-none tracking-tight">
                    {value}
                  </div>
                  <div className="eyebrow mt-1.5">{t.label}</div>
                </div>
                <div
                  className={`font-mono text-[12px] ${
                    trend > 0
                      ? "text-[var(--success)]"
                      : trend < 0
                        ? "text-[var(--danger)]"
                        : "text-[var(--fg-muted)]"
                  }`}
                >
                  {series.length < 2
                    ? "—"
                    : `${trend > 0 ? "+" : ""}${trend} · ${series.length}g`}
                </div>
              </div>
              {path ? (
                <svg
                  width="100%"
                  height="40"
                  viewBox="0 0 200 40"
                  preserveAspectRatio="none"
                  className="mt-3 block"
                >
                  <path d={path} fill="none" stroke="var(--fg)" strokeWidth="1.5" />
                </svg>
              ) : (
                <div className="mt-3 h-[40px] flex items-center text-[12px] text-[var(--fg-muted)] font-mono">
                  Play a few games to see your trend.
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Two-up: Recent games + Activity heatmap */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-8">
        <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-elev)]">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
            <h3 className="text-[15px] font-medium tracking-tight">Recent games</h3>
            <Link
              href={`/u/${user.username}/games`}
              className="text-[var(--fg-muted)] text-[13px] hover:text-[var(--fg)]"
            >
              All →
            </Link>
          </div>

          {recent.length === 0 ? (
            <p className="px-5 py-8 text-[13px] text-[var(--fg-muted)]">No games yet.</p>
          ) : (
            <div>
              {recent.slice(0, 8).map((g, i) => {
                const res = resultFor(g, user.username);
                const opp =
                  g.whiteUsername === user.username ? g.blackUsername : g.whiteUsername;
                const cls =
                  res === "W"
                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                    : res === "L"
                      ? "bg-[#f7e1dd] text-[var(--danger)]"
                      : "bg-[var(--bg-elev-2)] text-[var(--fg-muted)]";
                return (
                  <div
                    key={g.id}
                    className={`flex items-center gap-3 px-5 py-3 ${i < 7 ? "border-b border-[var(--border)]" : ""}`}
                  >
                    <div
                      className={`size-[26px] rounded text-[12px] font-semibold flex items-center justify-center ${cls}`}
                    >
                      {res}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13.5px] font-medium tracking-tight truncate">
                        vs {opp}
                      </div>
                      <div className="text-[12px] text-[var(--fg-muted)]">
                        {g.timeControl} · {shortMonthDay(g.endedAt)}
                      </div>
                    </div>
                    <Link
                      href={`/game/${g.id}`}
                      className="text-[12px] text-[var(--fg-muted)] hover:text-[var(--fg)] px-2 py-1 rounded hover:bg-[var(--bg-elev-2)]"
                    >
                      Review →
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-5">
          {/* Activity heatmap (real data) */}
          <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-elev)] p-5">
            <div className="flex items-center justify-between mb-3.5">
              <h3 className="text-[15px] font-medium tracking-tight">Activity · 12 weeks</h3>
              <span className="font-mono text-[11px] text-[var(--fg-muted)]">
                {totalGamesIn12w} games
              </span>
            </div>
            <div
              className="grid gap-[3px]"
              style={{
                gridTemplateColumns: "repeat(12, 1fr)",
                gridTemplateRows: "repeat(7, 1fr)",
                gridAutoFlow: "column",
              }}
            >
              {activity.counts.map((n, i) => (
                <div
                  key={i}
                  className="aspect-square rounded-[2px]"
                  style={{ background: colorForCount(n) }}
                  title={`${n} game${n === 1 ? "" : "s"}`}
                />
              ))}
            </div>
            <div className="flex items-center justify-between font-mono text-[10px] text-[var(--fg-muted)] mt-2">
              <span>Less</span>
              <div className="flex gap-[2px]">
                {["var(--bg-elev-2)", "#dde2c8", "#bcc798", "#94a566", "#687d3a"].map((c) => (
                  <div
                    key={c}
                    style={{ background: c }}
                    className="size-2.5 rounded-[2px]"
                  />
                ))}
              </div>
              <span>More</span>
            </div>
          </div>

          {/* Performance by color (real data) */}
          <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-elev)] p-5">
            <h3 className="text-[15px] font-medium tracking-tight mb-3.5">
              Performance by color
            </h3>
            {byColor.white.games + byColor.black.games === 0 ? (
              <p className="text-[13px] text-[var(--fg-muted)]">
                No finished games yet — play a few to see your record.
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {(["white", "black"] as const).map((side) => {
                  const r = byColor[side];
                  const pct = colorRecordPercent(r);
                  return (
                    <div key={side} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            aria-hidden
                            className={`size-3 rounded-sm border ${
                              side === "white"
                                ? "bg-white border-[var(--border-strong)]"
                                : "bg-[var(--fg)] border-transparent"
                            }`}
                          />
                          <div>
                            <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--fg-muted)]">
                              As {side}
                            </div>
                            <div className="text-[13.5px] font-medium tracking-tight">
                              {r.wins}W · {r.draws}D · {r.losses}L
                            </div>
                          </div>
                        </div>
                        <span className="font-mono text-[13px]">
                          {r.games > 0
                            ? `${Math.round((r.wins / r.games) * 100)}%`
                            : "—"}
                        </span>
                      </div>
                      <div className="h-1.5 bg-[var(--bg-elev-2)] rounded-full overflow-hidden flex">
                        <div
                          className="h-full"
                          style={{
                            width: `${pct.winPct}%`,
                            background: "var(--accent)",
                          }}
                        />
                        <div
                          className="h-full"
                          style={{
                            width: `${pct.drawPct}%`,
                            background: "var(--fg-subtle)",
                          }}
                        />
                        <div
                          className="h-full"
                          style={{
                            width: `${pct.lossPct}%`,
                            background: "var(--danger)",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
