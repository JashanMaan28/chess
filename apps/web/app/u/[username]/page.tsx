import Link from "next/link";
import { notFound } from "next/navigation";
import { API_URL } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

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
  recent: any[];
};

async function getProfile(username: string): Promise<Profile | null> {
  const res = await fetch(`${API_URL}/u/${username}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return res.json();
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

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] font-mono text-[var(--fg-muted)]">
            Profile
          </p>
          <h1 className="text-4xl font-semibold tracking-tight">{user.username}</h1>
          <p className="mt-1 text-sm text-[var(--fg-muted)]">
            Joined {formatDate(user.createdAt)} · {user.gamesPlayed} games
          </p>
        </div>
        <Link
          href={`/u/${user.username}/games`}
          className="text-sm text-[var(--accent)] hover:underline"
        >
          All games →
        </Link>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: "Bullet", val: user.eloBullet },
          { label: "Blitz", val: user.eloBlitz },
          { label: "Rapid", val: user.eloRapid },
        ].map((r) => (
          <Card key={r.label}>
            <CardHeader>
              <CardDescription className="uppercase tracking-wider text-xs font-mono">
                {r.label}
              </CardDescription>
              <CardTitle className="font-mono text-3xl">{r.val}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="flex gap-2 text-sm font-mono">
        <Badge variant="success">{record.wins}W</Badge>
        <Badge variant="secondary">{record.draws}D</Badge>
        <Badge variant="danger">{record.losses}L</Badge>
        <span className="text-[var(--fg-muted)]">last 10</span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent games</CardTitle>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-[var(--fg-muted)]">No games yet.</p>
          ) : (
            <table className="w-full text-sm font-mono">
              <thead className="text-xs uppercase tracking-wider text-[var(--fg-muted)]">
                <tr>
                  <th className="text-left py-2">Date</th>
                  <th className="text-left">TC</th>
                  <th className="text-left">White</th>
                  <th className="text-left">Black</th>
                  <th className="text-left">Result</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recent.map((g) => (
                  <tr key={g.id} className="border-t border-[var(--border)]/50">
                    <td className="py-2 text-[var(--fg-muted)]">{formatDate(g.endedAt)}</td>
                    <td>{g.timeControl}</td>
                    <td>{g.whiteUsername}</td>
                    <td>{g.blackUsername}</td>
                    <td>{g.result}</td>
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
