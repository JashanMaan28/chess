"use client";
import * as React from "react";
import { useAuth } from "@clerk/nextjs";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { clearCache, readCache, writeCache } from "@/lib/cache";

const SKIP = ["/onboarding", "/sign-in", "/sign-up"];

// (1) Routes signed-in users without onboardedAt to /onboarding.
// (2) Clears the gambit cache when the user signs out so the next signed-in
//     user starts clean on this device.
export function OnboardingGate() {
  const { isLoaded, isSignedIn, getToken, userId } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const wasSignedInRef = React.useRef<boolean>(false);

  // Sign-out detection — clear cached entries from the prior user.
  React.useEffect(() => {
    if (!isLoaded) return;
    if (wasSignedInRef.current && !isSignedIn) {
      clearCache();
      try {
        window.sessionStorage.removeItem("onboarded");
      } catch {
        /* ignore */
      }
    }
    wasSignedInRef.current = !!isSignedIn;
  }, [isLoaded, isSignedIn]);

  React.useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) return;
    if (SKIP.some((p) => pathname.startsWith(p))) return;
    if (typeof window === "undefined") return;
    const cached = window.sessionStorage.getItem("onboarded");
    if (cached === "yes") return;

    // Reuse the long-lived /me cache if it's already there — the home page
    // populates it, so on a typical second visit we never even hit /me here.
    const meKey = `me:${userId}`;
    const cachedMe = readCache<{ onboardedAt: number | null }>(meKey);
    if (cachedMe?.value?.onboardedAt) {
      window.sessionStorage.setItem("onboarded", "yes");
      return;
    }

    let cancelled = false;
    (async () => {
      const token = await getToken();
      if (!token) return;
      try {
        const me = await api<{ username: string; onboardedAt: number | null }>(
          "/me",
          { token }
        );
        if (cancelled) return;
        writeCache(meKey, me);
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
  }, [isLoaded, isSignedIn, userId, pathname, router, getToken]);

  return null;
}
