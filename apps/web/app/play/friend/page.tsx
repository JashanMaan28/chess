"use client";
import * as React from "react";
import { useAuth } from "@clerk/nextjs";
import { TIME_CONTROLS } from "@chess/shared/time-controls";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Copy, Check, Crown } from "lucide-react";

export default function FriendInvitePage() {
  const { getToken } = useAuth();
  const [tcId, setTcId] = React.useState("5+0");
  const [color, setColor] = React.useState<"white" | "black" | "random">("random");
  const [code, setCode] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const create = async () => {
    setCreating(true);
    try {
      const token = await getToken();
      const res = await api<{ code: string; expiresAt: number }>("/friend/invite", {
        method: "POST",
        token,
        body: JSON.stringify({ timeControl: tcId, color }),
      });
      setCode(res.code);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCreating(false);
    }
  };

  const link = code ? `${window.location.origin}/g/${code}` : "";
  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Challenge a friend</h1>
        <p className="mt-1 text-[var(--fg-muted)]">
          Generate a one-time invite link. The first authenticated visitor joins as your opponent.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>Invite expires in 24 hours.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Time control</Label>
            <div className="grid grid-cols-3 gap-2">
              {TIME_CONTROLS.map((tc) => (
                <button
                  key={tc.id}
                  onClick={() => setTcId(tc.id)}
                  className={`font-mono text-sm h-10 rounded-md border transition-colors ${
                    tcId === tc.id
                      ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                      : "border-[var(--border-strong)] hover:border-[var(--accent)]/50"
                  }`}
                >
                  {tc.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Your color</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["white", "random", "black"] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`h-10 rounded-md border text-sm capitalize flex items-center justify-center gap-2 transition-colors ${
                    color === c
                      ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                      : "border-[var(--border-strong)] hover:border-[var(--accent)]/50"
                  }`}
                >
                  <Crown className="size-3.5" /> {c}
                </button>
              ))}
            </div>
          </div>
          <Button onClick={create} disabled={creating} size="lg" className="w-full">
            {creating ? "Generating…" : "Generate invite link"}
          </Button>
        </CardContent>
      </Card>

      {code && (
        <Card className="neon-glow border-[var(--accent)]">
          <CardHeader>
            <CardTitle>Share this link</CardTitle>
            <CardDescription>One use, valid for 24 hours.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input readOnly value={link} className="font-mono text-xs" />
              <Button onClick={copy} variant="outline" size="icon">
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
