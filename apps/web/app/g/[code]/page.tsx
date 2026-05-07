"use client";
import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth, useUser } from "@clerk/nextjs";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { TIME_CONTROL_BY_ID } from "@chess/shared/time-controls";

type Invite = {
  code: string;
  inviterId: string;
  timeControl: string;
  colorPref: string;
  expiresAt: number;
  usedAt: number | null;
  gameId: string | null;
};

export default function FriendLandingPage() {
  const { code } = useParams<{ code: string }>();
  const { getToken, isSignedIn } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const [invite, setInvite] = React.useState<Invite | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [accepting, setAccepting] = React.useState(false);

  React.useEffect(() => {
    api<Invite>(`/friend/${code}`).then(setInvite).catch((e) => setError(e.message));
  }, [code]);

  React.useEffect(() => {
    if (!invite || !isSignedIn || !user) return;
    if (invite.gameId) {
      router.replace(`/game/${invite.gameId}`);
      return;
    }
  }, [invite, isSignedIn, user, router]);

  const accept = async () => {
    setAccepting(true);
    try {
      const token = await getToken();
      const res = await api<{ gameId: string }>(`/friend/${code}/accept`, {
        method: "POST",
        token,
      });
      router.replace(`/game/${res.gameId}`);
    } catch (e: any) {
      toast.error(e.message);
      setAccepting(false);
    }
  };

  if (error) {
    return (
      <div className="mx-auto max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Invite unavailable</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }
  if (!invite) {
    return (
      <div className="mx-auto max-w-md flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-[var(--accent)]" />
      </div>
    );
  }
  const tc = TIME_CONTROL_BY_ID[invite.timeControl];
  const isInviter = user?.id === invite.inviterId;
  const expired = invite.expiresAt < Date.now();
  const used = !!invite.usedAt;

  return (
    <div className="mx-auto max-w-md space-y-6">
      <Card className="neon-glow border-[var(--accent)]/50">
        <CardHeader>
          <CardTitle>Friend challenge</CardTitle>
          <CardDescription>
            {tc ? `${tc.label} · ${tc.bucket}` : invite.timeControl} · inviter prefers{" "}
            {invite.colorPref}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {expired && <p className="text-[var(--danger)] text-sm">This invite has expired.</p>}
          {used && (
            <p className="text-[var(--fg-muted)] text-sm">This invite has already been used.</p>
          )}
          {!expired && !used && (
            <>
              {isInviter ? (
                <p className="text-sm text-[var(--fg-muted)]">
                  Waiting for your opponent to open this link…
                </p>
              ) : !isSignedIn ? (
                <p className="text-sm text-[var(--fg-muted)]">
                  Sign in to accept this challenge.
                </p>
              ) : (
                <Button onClick={accept} disabled={accepting} className="w-full" size="lg">
                  {accepting ? "Joining…" : "Accept challenge"}
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
