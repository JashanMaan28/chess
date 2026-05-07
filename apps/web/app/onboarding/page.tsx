"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const LEVELS = [
  { title: "New to chess", desc: "I know how the pieces move.", rating: "600" },
  { title: "Casual", desc: "I play with friends or online sometimes.", rating: "1100" },
  { title: "Club player", desc: "I study openings and play tournaments.", rating: "1600" },
  { title: "Strong", desc: "Rated 1800+ in a federation.", rating: "2000+" },
] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const [selected, setSelected] = React.useState<number>(2);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 flex-1 min-h-0">
      {/* Left side — dark ink panel */}
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
            Three minutes from sign-up to your first move. Calibrated puzzles. Honest
            opponents. Quiet design.
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

      {/* Right side — form */}
      <div className="px-14 lg:px-20 py-14 flex flex-col justify-center gap-6 max-w-[640px]">
        <div className="flex items-center gap-2.5 font-mono text-[12px] text-[var(--fg-muted)]">
          <span className="block w-[18px] h-[2px] rounded-sm bg-[var(--fg)]" />
          <span className="block w-[18px] h-[2px] rounded-sm bg-[var(--fg)]" />
          <span className="block w-[18px] h-[2px] rounded-sm bg-[var(--border-strong)]" />
          <span className="block w-[18px] h-[2px] rounded-sm bg-[var(--border-strong)]" />
          <span className="ml-2">Step 02 of 04</span>
        </div>

        <h2 className="text-[28px] font-medium tracking-tight">What's your level?</h2>
        <p className="text-[14px] text-[var(--fg-muted)]">
          We'll calibrate your puzzles and matchmake fair opponents. You can change this
          later.
        </p>

        <div className="flex flex-col gap-3 mt-2">
          {LEVELS.map((lvl, i) => {
            const on = selected === i;
            return (
              <button
                key={lvl.title}
                onClick={() => setSelected(i)}
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
                    <div className="text-[15px] font-medium tracking-tight">{lvl.title}</div>
                    <div className="text-[12.5px] text-[var(--fg-muted)] mt-0.5">
                      {lvl.desc}
                    </div>
                  </div>
                  <div className="font-mono text-[12px] text-[var(--fg-muted)]">
                    ~{lvl.rating}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between mt-4">
          <Button variant="ghost" onClick={() => router.back()}>
            ← Back
          </Button>
          <Button size="lg" onClick={() => router.push("/")}>
            Continue →
          </Button>
        </div>
      </div>
    </div>
  );
}
