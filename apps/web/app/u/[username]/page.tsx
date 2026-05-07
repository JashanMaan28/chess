import Link from "next/link";
import { notFound } from "next/navigation";
import { API_URL } from "@/lib/api";
import { Button } from "@/components/ui/button";

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
  { key: "eloBullet", label: "Bullet" },
  { key: "eloBlitz", label: "Blitz" },
  { key: "eloRapid", label: "Rapid" },
] as const;

const SPARK_PATHS: Record<string, string> = {
  Bullet:
    "M0,30 L20,28 L40,32 L60,24 L80,26 L100,20 L120,22 L140,16 L160,18 L180,12 L200,14",
  Blitz:
    "M0,28 L20,30 L40,22 L60,26 L80,18 L100,22 L120,14 L140,18 L160,10 L180,14 L200,8",
  Rapid:
    "M0,18 L20,16 L40,14 L60,18 L80,12 L100,16 L120,10 L140,14 L160,18 L180,16 L200,20",
};

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

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const data = await getProfile(username);
  if (!data) return notFound();
  const { user, record, recent } = data;

  const memberSince = new Date(user.createdAt).getFullYear();
  const initial = user.username.slice(0, 2).toUpperCase();

  return (
    <div className="px-14 pt-9 pb-12 max-w-[1280px] mx-auto w-full">
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
        <div className="flex gap-2">
          <Button variant="outline">Share</Button>
          <Link href={`/u/${user.username}/games`}>
            <Button>All games</Button>
          </Link>
        </div>
      </div>

      {/* Rating tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
        {RATING_TILES.map((t) => {
          const value = user[t.key];
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
              </div>
              <svg
                width="100%"
                height="40"
                viewBox="0 0 200 40"
                preserveAspectRatio="none"
                className="mt-3 block"
              >
                <path
                  d={SPARK_PATHS[t.label]}
                  fill="none"
                  stroke="var(--fg)"
                  strokeWidth="1.5"
                />
              </svg>
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
          {/* Activity heatmap */}
          <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-elev)] p-5">
            <div className="flex items-center justify-between mb-3.5">
              <h3 className="text-[15px] font-medium tracking-tight">Activity · 12 weeks</h3>
              <span className="font-mono text-[11px] text-[var(--fg-muted)]">
                {user.gamesPlayed} games
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
              {Array.from({ length: 84 }).map((_, i) => {
                const v = Math.floor(Math.abs(Math.sin(i * 1.3)) * 5);
                const colors = [
                  "var(--bg-elev-2)",
                  "#dde2c8",
                  "#bcc798",
                  "#94a566",
                  "#687d3a",
                ];
                return (
                  <div
                    key={i}
                    className="aspect-square rounded-[2px]"
                    style={{ background: colors[v] }}
                  />
                );
              })}
            </div>
            <div className="flex items-center justify-between font-mono text-[10px] text-[var(--fg-muted)] mt-2">
              <span>Less</span>
              <div className="flex gap-[2px]">
                {[
                  "var(--bg-elev-2)",
                  "#dde2c8",
                  "#bcc798",
                  "#94a566",
                  "#687d3a",
                ].map((c) => (
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

          {/* Repertoire */}
          <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-elev)] p-5">
            <h3 className="text-[15px] font-medium tracking-tight mb-3.5">
              Opening repertoire
            </h3>
            <div className="flex flex-col gap-3">
              {[
                { role: "As White", name: "Italian Game", wr: "58%", pct: 0.58 },
                { role: "As Black", name: "Sicilian Najdorf", wr: "49%", pct: 0.49 },
                { role: "Vs 1.d4", name: "King's Indian", wr: "52%", pct: 0.52 },
              ].map((r) => (
                <div key={r.role} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--fg-muted)]">
                        {r.role}
                      </div>
                      <div className="text-[13.5px] font-medium tracking-tight">
                        {r.name}
                      </div>
                    </div>
                    <span className="font-mono text-[13px]">{r.wr}</span>
                  </div>
                  <div className="h-1 bg-[var(--bg-elev-2)] rounded-full overflow-hidden">
                    <div
                      className="h-full"
                      style={{
                        width: `${r.pct * 100}%`,
                        background: "var(--accent)",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
