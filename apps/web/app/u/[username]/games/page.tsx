import Link from "next/link";
import { notFound } from "next/navigation";
import { API_URL } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { TIME_CONTROLS } from "@chess/shared/time-controls";

async function getGames(username: string, tc: string | undefined, page: number) {
  const params = new URLSearchParams({ page: String(page) });
  if (tc) params.set("tc", tc);
  const res = await fetch(`${API_URL}/u/${username}/games?${params}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return res.json();
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

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] font-mono text-[var(--fg-muted)]">
          Game history
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">{username}</h1>
      </header>

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/u/${username}/games`}
          className={`text-xs font-mono uppercase tracking-wider px-3 py-1.5 rounded-md border ${
            !sp.tc
              ? "border-[var(--accent)] text-[var(--accent)]"
              : "border-[var(--border-strong)] text-[var(--fg-muted)] hover:text-[var(--fg)]"
          }`}
        >
          all
        </Link>
        {TIME_CONTROLS.map((tc) => (
          <Link
            key={tc.id}
            href={`/u/${username}/games?tc=${tc.id}`}
            className={`text-xs font-mono uppercase tracking-wider px-3 py-1.5 rounded-md border ${
              sp.tc === tc.id
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-[var(--border-strong)] text-[var(--fg-muted)] hover:text-[var(--fg)]"
            }`}
          >
            {tc.label}
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Page {data.page} · {data.games.length} games
          </CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm font-mono">
            <thead className="text-xs uppercase tracking-wider text-[var(--fg-muted)]">
              <tr>
                <th className="text-left py-2">Date</th>
                <th className="text-left">TC</th>
                <th className="text-left">White</th>
                <th className="text-left">Black</th>
                <th className="text-left">Result</th>
                <th className="text-left">End</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.games.map((g: any) => (
                <tr key={g.id} className="border-t border-[var(--border)]/50">
                  <td className="py-2 text-[var(--fg-muted)]">{formatDate(g.endedAt)}</td>
                  <td>{g.timeControl}</td>
                  <td>{g.whiteUsername}</td>
                  <td>{g.blackUsername}</td>
                  <td>{g.result}</td>
                  <td className="text-[var(--fg-muted)]">{g.termination || "—"}</td>
                  <td>
                    <Link
                      href={`/game/${g.id}`}
                      className="text-[var(--accent)] hover:underline"
                    >
                      view
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="flex justify-between text-sm">
        {page > 1 ? (
          <Link
            href={`/u/${username}/games?${new URLSearchParams({
              ...(sp.tc ? { tc: sp.tc } : {}),
              page: String(page - 1),
            })}`}
            className="text-[var(--accent)] hover:underline"
          >
            ← prev
          </Link>
        ) : (
          <span />
        )}
        {data.games.length === 20 && (
          <Link
            href={`/u/${username}/games?${new URLSearchParams({
              ...(sp.tc ? { tc: sp.tc } : {}),
              page: String(page + 1),
            })}`}
            className="text-[var(--accent)] hover:underline"
          >
            next →
          </Link>
        )}
      </div>
    </div>
  );
}
