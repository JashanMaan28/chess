"use client";
import Link from "next/link";
import { SignedIn, SignedOut, UserButton, SignInButton } from "@clerk/nextjs";
import { ThemeSwitch } from "./theme-provider";
import { Button } from "./ui/button";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-[var(--border)] bg-[var(--bg)]/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="flex items-center gap-2 font-mono text-sm uppercase tracking-[0.18em]"
          >
            <span className="inline-block h-2 w-2 rounded-full bg-[var(--accent)] shadow-[0_0_12px_var(--accent)]" />
            <span className="font-semibold">chess.edge</span>
          </Link>
          <nav className="hidden md:flex items-center gap-1 text-sm">
            <Link
              href="/play"
              className="px-3 py-1.5 rounded-md hover:bg-[var(--bg-elev)] text-[var(--fg-muted)] hover:text-[var(--fg)]"
            >
              Play
            </Link>
            <Link
              href="/play/friend"
              className="px-3 py-1.5 rounded-md hover:bg-[var(--bg-elev)] text-[var(--fg-muted)] hover:text-[var(--fg)]"
            >
              Friend
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
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
