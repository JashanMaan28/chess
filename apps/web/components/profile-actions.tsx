"use client";
import * as React from "react";
import { useAuth } from "@clerk/nextjs";
import { Button } from "./ui/button";
import { ChallengeDialog } from "./challenge-dialog";
import { api } from "@/lib/api";
import { toast } from "sonner";

type Status = {
  following: boolean;
  followsYou: boolean;
  mutual: boolean;
};

export function ProfileActions({
  username,
  defaultTc = "5+0",
}: {
  username: string;
  defaultTc?: string;
}) {
  const { getToken, isLoaded, isSignedIn, userId } = useAuth();
  const [status, setStatus] = React.useState<Status | null>(null);
  const [me, setMe] = React.useState<{ username: string } | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    (async () => {
      const token = await getToken();
      if (!token) return;
      try {
        const [meRes, st] = await Promise.all([
          api<{ username: string }>("/me", { token }),
          api<Status>(`/users/${encodeURIComponent(username)}/follow-status`, {
            token,
          }),
        ]);
        if (cancelled) return;
        setMe(meRes);
        setStatus(st);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, userId, getToken, username]);

  const toggle = async () => {
    const token = await getToken();
    if (!token) {
      toast.error("Sign in to follow players.");
      return;
    }
    if (!status) return;
    setBusy(true);
    try {
      if (status.following) {
        await api(`/users/${encodeURIComponent(username)}/follow`, {
          method: "DELETE",
          token,
        });
        setStatus({ ...status, following: false, mutual: false });
      } else {
        await api(`/users/${encodeURIComponent(username)}/follow`, {
          method: "POST",
          token,
        });
        setStatus({
          ...status,
          following: true,
          mutual: status.followsYou,
        });
      }
    } catch {
      toast.error("Could not update follow.");
    } finally {
      setBusy(false);
    }
  };

  // Don't render the actions on your own profile.
  const isSelf = me && me.username === username;
  if (!isLoaded || !isSignedIn || isSelf) return null;

  return (
    <div className="flex gap-2">
      <ChallengeDialog
        username={username}
        defaultTc={defaultTc}
        trigger={<Button variant="outline">Challenge</Button>}
      />
      <Button onClick={toggle} disabled={busy || !status}>
        {!status
          ? "…"
          : status.following
            ? status.mutual
              ? "Unfollow (mutual)"
              : "Unfollow"
            : status.followsYou
              ? "Follow back"
              : "Follow"}
      </Button>
    </div>
  );
}
