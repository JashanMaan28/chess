import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Zap, Users, Globe2, Activity } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="space-y-24 pb-24">
      {/* Hero */}
      <section className="relative -mt-8 pt-24 pb-16">
        <div className="absolute inset-0 grid-bg pointer-events-none" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--bg-elev)] px-3 py-1 text-xs font-mono uppercase tracking-wider">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--success)] animate-pulse" />
            <span className="text-[var(--fg-muted)]">live · server-authoritative</span>
          </div>
          <h1 className="mt-6 max-w-3xl text-5xl md:text-7xl font-semibold tracking-tight leading-[1.05]">
            Chess at the{" "}
            <span className="bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] bg-clip-text text-transparent">
              edge
            </span>
            .
          </h1>
          <p className="mt-6 max-w-xl text-lg text-[var(--fg-muted)]">
            A multiplayer chess platform with all real-time game state running on Cloudflare Durable Objects. Sub-100ms moves, hibernatable rooms, and clocks ticked by the network itself.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Button asChild size="lg" className="group">
              <Link href="/play">
                Play now <ArrowRight className="ml-1 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/play/friend">Challenge a friend</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            icon: Zap,
            title: "Edge-native clocks",
            body: "Move timing and flag-fall handled by Durable Object alarms. Zero drift, zero polling.",
          },
          {
            icon: Globe2,
            title: "Hibernatable rooms",
            body: "WebSocket sessions hibernate between moves. Long games cost pennies, not dollars.",
          },
          {
            icon: Users,
            title: "Spectator-first",
            body: "Anyone with the URL can watch live. Players, spectators, replays — same surface.",
          },
          {
            icon: Activity,
            title: "Trustless client",
            body: "Client-side chess.js draws hints only. The DO is the only source of truth.",
          },
        ].map(({ icon: Icon, title, body }) => (
          <Card key={title} className="hover:border-[var(--accent)]/50 transition-colors">
            <CardContent className="p-5">
              <Icon className="size-5 text-[var(--accent)]" />
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-[var(--fg-muted)] leading-relaxed">{body}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* Time controls strip */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-elev)] p-8">
        <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--fg-muted)]">
          Time controls
        </h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {["1+0", "2+1", "3+0", "3+2", "5+0", "5+3", "10+0", "15+10", "30+0"].map((tc) => (
            <div
              key={tc}
              className="font-mono px-3 py-1.5 rounded-md border border-[var(--border-strong)] text-sm"
            >
              {tc}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
