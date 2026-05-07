import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function TournamentsPage() {
  return (
    <div className="flex-1 flex items-center justify-center p-10">
      <div className="max-w-[560px] w-full flex flex-col items-center text-center gap-6">
        <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--fg-muted)]">
          Coming soon
        </div>
        <h1 className="h-display">
          Tournaments are <em className="font-serif italic">on the way</em>.
        </h1>
        <p className="text-[15px] text-[var(--fg-muted)] leading-[1.55]">
          Arena and bracket tournaments aren't live yet. We've sketched the
          design and shipped the rest of the site first — for now, find a match
          on <Link className="underline decoration-dotted hover:text-[var(--fg)]" href="/play">play</Link>{" "}
          or challenge a friend directly.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
          <Button asChild>
            <Link href="/play">Play now</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/play/friend">Challenge a friend</Link>
          </Button>
        </div>

        <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-elev)] px-5 py-4 text-left w-full mt-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--fg-muted)] mb-1.5">
            Curious about the design?
          </div>
          <div className="text-[13.5px]">
            The architecture and rollout plan lives in{" "}
            <code className="font-mono text-[12.5px] px-1.5 py-0.5 rounded bg-[var(--bg-elev-2)]">
              docs/tournaments.md
            </code>{" "}
            in the repo.
          </div>
        </div>
      </div>
    </div>
  );
}
