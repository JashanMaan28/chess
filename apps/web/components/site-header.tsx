"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignedIn, SignedOut, UserButton, SignInButton } from "@clerk/nextjs";
import { ThemeSwitch } from "./theme-provider";
import { Button } from "./ui/button";
import { SearchDialog, SearchTrigger } from "./search-dialog";

const links = [
  { href: "/", key: "play", label: "Play" },
  { href: "/puzzles", key: "puzzles", label: "Puzzles" },
  { href: "/learn", key: "learn", label: "Learn" },
  { href: "/tournaments", key: "tournaments", label: "Tournaments" },
];

const HIDE_ON = ["/onboarding", "/sign-in", "/sign-up"];

export function SiteHeader() {
  const pathname = usePathname();
  if (HIDE_ON.some((p) => pathname.startsWith(p))) return null;
  const activeKey =
    pathname === "/"
      ? "play"
      : pathname.startsWith("/puzzles")
        ? "puzzles"
        : pathname.startsWith("/learn")
          ? "learn"
          : pathname.startsWith("/tournaments")
            ? "tournaments"
            : pathname.startsWith("/play") || pathname.startsWith("/game") || pathname.startsWith("/review")
              ? "play"
              : "";

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[var(--border)] bg-[var(--bg)]/85 backdrop-blur-md">
      <div className="flex h-14 items-center px-10 gap-8">
        <Link
          href="/"
          className="flex items-center gap-2 font-serif text-[22px] tracking-tight"
        >
          <span aria-hidden className="text-[22px] leading-none">{"♞"}</span>
          <span>Gambit</span>
        </Link>

        <nav className="hidden md:flex flex-1 items-center gap-1 text-sm">
          {links.map((l) => {
            const active = activeKey === l.key;
            return (
              <Link
                key={l.key}
                href={l.href}
                className={
                  active
                    ? "px-3 py-1.5 rounded-md bg-[var(--fg)] text-[var(--bg)] font-medium"
                    : "px-3 py-1.5 rounded-md text-[color:var(--ink-2)] hover:bg-[var(--bg-elev-2)]"
                }
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <SearchTrigger />
          <SearchDialog />
          <ThemeSwitch />
          <SignedOut>
            <SignInButton>
              <Button size="sm" variant="outline">
                Sign in
              </Button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "h-8 w-8 ring-1 ring-[var(--border-strong)]",
                },
              }}
            />
          </SignedIn>
        </div>
      </div>
    </header>
  );
}
