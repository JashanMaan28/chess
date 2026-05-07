"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { TIME_CONTROLS } from "@chess/shared/time-controls";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QueueWS } from "@/lib/ws-client";
import type { ServerMsg } from "@chess/shared/protocol";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";

export default function PlayPage() {
  const { getToken } = useAuth();
  const router = useRouter();
  const [bucket, setBucket] = React.useState<"bullet" | "blitz" | "rapid">("blitz");
  const [queueing, setQueueing] = React.useState<string | null>(null);
  const [queueSize, setQueueSize] = React.useState<number>(0);
  const wsRef = React.useRef<QueueWS | null>(null);

  const startQueue = async (tcId: string) => {
    if (queueing) return;
    const token = await getToken();
    if (!token) return;
    setQueueing(tcId);
    setQueueSize(0);
    const ws = new QueueWS({
      tcId,
      token,
      handlers: {
        onMessage: (msg: ServerMsg) => {
          if (msg.t === "queued") setQueueSize(msg.size);
          if (msg.t === "matched") {
            toast.success("Match found!");
            router.push(`/game/${msg.gameId}`);
          }
          if (msg.t === "error") toast.error(msg.msg);
        },
        onStatus: (s) => {
          if (s === "closed" && queueing) {
            // server-side close happens after match; harmless on success
          }
        },
      },
    });
    wsRef.current = ws;
    ws.connect();
  };

  const cancelQueue = () => {
    wsRef.current?.close();
    wsRef.current = null;
    setQueueing(null);
  };

  React.useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  const filtered = TIME_CONTROLS.filter((t) => t.bucket === bucket);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Quick match</h1>
        <p className="mt-1 text-[var(--fg-muted)]">
          Pair with a similarly-rated player. Search widens every few seconds.
        </p>
      </div>

      <Tabs value={bucket} onValueChange={(v) => setBucket(v as any)}>
        <TabsList>
          <TabsTrigger value="bullet">Bullet</TabsTrigger>
          <TabsTrigger value="blitz">Blitz</TabsTrigger>
          <TabsTrigger value="rapid">Rapid</TabsTrigger>
        </TabsList>
        {(["bullet", "blitz", "rapid"] as const).map((b) => (
          <TabsContent key={b} value={b}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {TIME_CONTROLS.filter((t) => t.bucket === b).map((tc) => {
                const active = queueing === tc.id;
                return (
                  <Card
                    key={tc.id}
                    className={`relative transition-all ${active ? "neon-glow border-[var(--accent)]" : "hover:border-[var(--accent)]/40"}`}
                  >
                    <CardHeader>
                      <CardTitle className="font-mono text-2xl">{tc.label}</CardTitle>
                      <CardDescription className="uppercase tracking-wider text-xs">
                        {tc.bucket}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {active ? (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-[var(--fg-muted)] flex items-center gap-2">
                            <Loader2 className="size-4 animate-spin text-[var(--accent)]" />
                            Searching… ({queueSize} in queue)
                          </span>
                          <Button size="sm" variant="ghost" onClick={cancelQueue}>
                            <X className="size-4" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          className="w-full"
                          variant="outline"
                          disabled={!!queueing}
                          onClick={() => startQueue(tc.id)}
                        >
                          Find match
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>
        ))}
      </Tabs>
      {filtered.length === 0 && (
        <p className="text-[var(--fg-muted)]">No formats configured for this bucket.</p>
      )}
    </div>
  );
}
