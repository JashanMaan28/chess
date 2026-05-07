"use client";
import * as React from "react";
import { useAuth } from "@clerk/nextjs";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";

const SKIP = ["/onboarding", "/sign-in", "/sign-up"];

// Once a user is signed in, check whether they've completed onboarding. If not,
// route them to /onboarding. Runs once per session — caches the answer in
// sessionStorage so we don't hit the worker on every page nav.
export function OnboardingGate() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  React.useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    if (SKIP.some((p) => pathname.startsWith(p))) return;
    if (typeof window === "undefined") return;
    const cached = window.sessionStorage.getItem("onboarded");
    if (cached === "yes") return;
    let cancelled = false;
    (async () => {
      const token = await getToken();
      if (!token) return;
      try {
        const me = await api<{ onboardedAt: number | null }>("/me", { token });
        if (cancelled) return;
        if (me.onboardedAt) {
          window.sessionStorage.setItem("onboarded", "yes");
        } else {
          router.replace("/onboarding");
        }
      } catch {
        /* ignore — worker may be down */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, pathname, router, getToken]);

  return null;
}
