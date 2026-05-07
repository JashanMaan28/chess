"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useAuth, useUser } from "@clerk/nextjs";
import { TIME_CONTROLS, TIME_CONTROL_BY_ID } from "@chess/shared/time-controls";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { toast } from "sonner";

type LevelId = "beginner" | "casual" | "club" | "strong";

const LEVELS: Array<{
  id: LevelId;
  title: string;
  desc: string;
  rating: string;
}> = [
  { id: "beginner", title: "New to chess", desc: "I know how the pieces move.", rating: "~800" },
  { id: "casual", title: "Casual", desc: "I play with friends or online sometimes.", rating: "~1200" },
  { id: "club", title: "Club player", desc: "I study openings and play tournaments.", rating: "~1600" },
  { id: "strong", title: "Strong", desc: "Rated 1800+ in a federation.", rating: "1900+" },
];

const TC_PICKS: Array<{ id: string; label: string; sub: string }> = [
  { id: "1+0", label: "1 + 0", sub: "Bullet — fastest" },
  { id: "3+0", label: "3 + 0", sub: "Blitz — most popular" },
  { id: "5+3", label: "5 + 3", sub: "Blitz with increment" },
  { id: "10+0", label: "10 + 0", sub: "Rapid — think a bit" },
  { id: "15+10", label: "15 + 10", sub: "Rapid with increment" },
];

const STEPS = ["Welcome", "Skill level", "Time control", "Done"] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();

  const [step, setStep] = React.useState(0);
  const [level, setLevel] = React.useState<LevelId>("casual");
  const [tcId, setTcId] = React.useState("3+0");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace("/sign-in");
  }, [isLoaded, isSignedIn, router]);

  const submit = React.useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    setSubmitting(true);
    try {
      await api("/me/onboard", {
        method: "POST",
        token,
        body: JSON.stringify({ level, preferredTc: tcId }),
      });
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem("onboarded", "yes");
      }
      setStep(3);
    } catch {
      toast.error("Could not save preferences. Try again.");
    } finally {
      setSubmitting(false);
    }
  }, [getToken, level, tcId]);

  const initial = (user?.username ||
    user?.firstName ||
    user?.primaryEmailAddress?.emailAddress ||
    "?")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 flex-1 min-h-0">
      <div
        className="px-14 py-14 flex flex-col justify-between text-[var(--bg)]"
        style={{ background: "var(--fg)" }}
      >
        <div className="font-serif text-[24px] tracking-tight flex items-center gap-2">
          <span aria-hidden>{"♞"}</span>
          <span>Gambit</span>
        </div>

        <div className="max-w-[380px] flex flex-col gap-6">
          <h1 className="h-display" style={{ color: "var(--bg)" }}>
            The board <em className="font-serif italic">remembers</em>.
          </h1>
          <p
            className="text-[16px] leading-[1.55] max-w-[340px]"
            style={{ color: "rgba(250,248,243,0.7)" }}
          >
            Three minutes from sign-up to your first move. Calibrated puzzles.
            Honest opponents. Quiet design.
          </p>
        </div>

        <div
          className="flex gap-3 font-mono text-[11px] uppercase tracking-[0.1em]"
          style={{ color: "rgba(250,248,243,0.5)" }}
        >
          <span>Est. 2024</span>
          <span>·</span>
          <span>Edinburgh</span>
        </div>
      </div>

      <div className="px-14 lg:px-20 py-14 flex flex-col justify-center gap-6 max-w-[640px]">
        <div className="flex items-center gap-2.5 font-mono text-[12px] text-[var(--fg-muted)]">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className="block w-[18px] h-[2px] rounded-sm"
              style={{
                background: i <= step ? "var(--fg)" : "var(--border-strong)",
              }}
            />
          ))}
          <span className="ml-2">
            Step {String(Math.min(step + 1, STEPS.length)).padStart(2, "0")} of{" "}
            {String(STEPS.length).padStart(2, "0")}
          </span>
        </div>

        {step === 0 && (
          <>
            <h2 className="text-[28px] font-medium tracking-tight">
              Welcome{user?.firstName ? `, ${user.firstName}` : ""}.
            </h2>
            <p className="text-[14px] text-[var(--fg-muted)]">
              We'll calibrate puzzles and matchmake fair opponents based on a
              couple of quick answers. You can change these later from your
              profile.
            </p>
            <div className="flex items-center gap-3 mt-2 px-4 py-3 rounded-md border border-[var(--border)] bg-[var(--bg-elev)]">
              <div
                aria-hidden
                className="size-9 rounded-full text-[12px] font-semibold text-white flex items-center justify-center flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #c8b896, #876f4e)" }}
              >
                {initial}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-medium tracking-tight truncate">
                  {user?.username ?? user?.firstName ?? "your account"}
                </div>
                <div className="text-[12px] text-[var(--fg-muted)] truncate">
                  {user?.primaryEmailAddress?.emailAddress ?? ""}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end mt-4">
              <Button size="lg" onClick={() => setStep(1)}>
                Continue →
              </Button>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h2 className="text-[28px] font-medium tracking-tight">
              What's your level?
            </h2>
            <p className="text-[14px] text-[var(--fg-muted)]">
              We'll seed your puzzle rating and matchmake fair opponents.
            </p>
            <div className="flex flex-col gap-3 mt-2">
              {LEVELS.map((lvl) => {
                const on = level === lvl.id;
                return (
                  <button
                    key={lvl.id}
                    onClick={() => setLevel(lvl.id)}
                    className="rounded-[10px] p-5 text-left transition-all bg-[var(--bg-elev)]"
                    style={{
                      borderWidth: 1,
                      borderStyle: "solid",
                      borderColor: on ? "var(--fg)" : "var(--border)",
                      boxShadow: on ? "0 0 0 3px rgba(26,24,21,0.08)" : "none",
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[15px] font-medium tracking-tight">
                          {lvl.title}
                        </div>
                        <div className="text-[12.5px] text-[var(--fg-muted)] mt-0.5">
                          {lvl.desc}
                        </div>
                      </div>
                      <div className="font-mono text-[12px] text-[var(--fg-muted)]">
                        {lvl.rating}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between mt-4">
              <Button variant="ghost" onClick={() => setStep(0)}>
                ← Back
              </Button>
              <Button size="lg" onClick={() => setStep(2)}>
                Continue →
              </Button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="text-[28px] font-medium tracking-tight">
              Pick your tempo.
            </h2>
            <p className="text-[14px] text-[var(--fg-muted)]">
              Your default time control. We'll suggest it on the home screen —
              you can always pick something else.
            </p>
            <div className="flex flex-col gap-2 mt-2">
              {TC_PICKS.map((tc) => {
                const on = tcId === tc.id;
                const valid = !!TIME_CONTROL_BY_ID[tc.id];
                if (!valid) return null;
                return (
                  <button
                    key={tc.id}
                    onClick={() => setTcId(tc.id)}
                    className="rounded-[10px] p-4 text-left bg-[var(--bg-elev)] flex items-center justify-between transition-colors"
                    style={{
                      borderWidth: 1,
                      borderStyle: "solid",
                      borderColor: on ? "var(--fg)" : "var(--border)",
                      boxShadow: on ? "0 0 0 3px rgba(26,24,21,0.08)" : "none",
                    }}
                  >
                    <div className="flex items-center gap-4">
                      <div className="font-serif text-[28px] leading-none tracking-tight w-[68px]">
                        {tc.label}
                      </div>
                      <div className="text-[13.5px] text-[var(--fg-muted)]">
                        {tc.sub}
                      </div>
                    </div>
                    <span
                      className="font-mono text-[10px] uppercase tracking-[0.1em] capitalize"
                      style={{ color: on ? "var(--fg)" : "var(--fg-muted)" }}
                    >
                      {TIME_CONTROL_BY_ID[tc.id]?.bucket}
                    </span>
                  </button>
                );
              })}
            </div>
            <details className="mt-2">
              <summary className="text-[12.5px] text-[var(--fg-muted)] cursor-pointer hover:text-[var(--fg)]">
                Show all time controls
              </summary>
              <div className="grid grid-cols-3 gap-1.5 mt-3">
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
            </details>
            <div className="flex items-center justify-between mt-4">
              <Button variant="ghost" onClick={() => setStep(1)}>
                ← Back
              </Button>
              <Button size="lg" onClick={submit} disabled={submitting}>
                {submitting ? "Saving…" : "Finish setup →"}
              </Button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="text-[28px] font-medium tracking-tight">
              You're set.
            </h2>
            <p className="text-[14px] text-[var(--fg-muted)]">
              We'll start you with puzzles around{" "}
              <strong className="text-[var(--fg)]">
                {seedRatingFor(level).toLocaleString()}
              </strong>{" "}
              and offer{" "}
              <strong className="text-[var(--fg)]">
                {TIME_CONTROL_BY_ID[tcId]?.label}
              </strong>{" "}
              by default. Have a good first game.
            </p>
            <div className="flex items-center gap-3 mt-4">
              <Button size="lg" onClick={() => router.push(`/play?tc=${encodeURIComponent(tcId)}`)}>
                Find first match →
              </Button>
              <Button variant="outline" onClick={() => router.push("/")}>
                Go to home
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function seedRatingFor(level: LevelId): number {
  return level === "beginner"
    ? 800
    : level === "casual"
      ? 1200
      : level === "club"
        ? 1600
        : 1900;
}
