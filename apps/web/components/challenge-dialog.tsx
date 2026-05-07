"use client";
import * as React from "react";
import { useAuth } from "@clerk/nextjs";
import { TIME_CONTROLS } from "@chess/shared/time-controls";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { api } from "@/lib/api";

type Color = "white" | "black" | "random";

export function ChallengeDialog({
  username,
  trigger,
  defaultTc = "5+0",
}: {
  username: string;
  trigger: React.ReactNode;
  defaultTc?: string;
}) {
  const { getToken } = useAuth();
  const [open, setOpen] = React.useState(false);
  const [tcId, setTcId] = React.useState(defaultTc);
  const [color, setColor] = React.useState<Color>("random");
  const [generating, setGenerating] = React.useState(false);
  const [link, setLink] = React.useState<string | null>(null);

  const reset = () => {
    setLink(null);
    setGenerating(false);
  };

  const generate = async () => {
    const token = await getToken();
    if (!token) {
      toast.error("Sign in to challenge friends.");
      return;
    }
    setGenerating(true);
    try {
      const res = await api<{ code: string }>("/friend/invite", {
        method: "POST",
        token,
        body: JSON.stringify({ timeControl: tcId, color }),
      });
      const url = `${window.location.origin}/g/${res.code}`;
      setLink(url);
    } catch (e) {
      toast.error("Could not create invite.");
      setGenerating(false);
    } finally {
      setGenerating(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    toast.success("Invite link copied.");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Challenge {username}</DialogTitle>
          <DialogDescription>
            Generate a one-time invite link, then send it to {username}. Expires in 24 hours.
          </DialogDescription>
        </DialogHeader>

        {!link ? (
          <div className="flex flex-col gap-5 mt-4">
            <div className="flex flex-col gap-2">
              <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--fg-muted)]">
                Time control
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {TIME_CONTROLS.map((tc) => {
                  const on = tc.id === tcId;
                  return (
                    <button
                      key={tc.id}
                      type="button"
                      onClick={() => setTcId(tc.id)}
                      className="px-2.5 py-2 rounded-md border text-[13px] font-mono transition-colors"
                      style={{
                        borderColor: on ? "var(--fg)" : "var(--border)",
                        background: on ? "var(--bg-elev-2)" : "transparent",
                      }}
                    >
                      {tc.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--fg-muted)]">
                Your color
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {(["white", "random", "black"] as Color[]).map((c) => {
                  const on = c === color;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className="px-2.5 py-2 rounded-md border text-[13px] capitalize transition-colors"
                      style={{
                        borderColor: on ? "var(--fg)" : "var(--border)",
                        background: on ? "var(--bg-elev-2)" : "transparent",
                      }}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>

            <Button onClick={generate} disabled={generating}>
              {generating ? "Generating…" : "Generate invite link"}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 mt-4">
            <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--fg-muted)]">
              Single-use invite
            </div>
            <div className="flex gap-2">
              <input
                readOnly
                value={link}
                className="flex-1 px-3 py-2 rounded-md border border-[var(--border)] bg-[var(--bg)] font-mono text-[12.5px]"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button onClick={copy}>Copy</Button>
            </div>
            <p className="text-[12.5px] text-[var(--fg-muted)]">
              Send this link to {username} however you like — once they open it,
              the game starts.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
