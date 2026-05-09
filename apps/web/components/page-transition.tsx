"use client";

import { motion } from "motion/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const SKIP_PATHS = ["/onboarding", "/sign-in", "/sign-up"];

const PANEL_COUNT = 5;

// Three-phase motion: each panel slides in from off-screen left, holds at
// center while every other panel catches up, then slides out off-screen
// right. The hold gives the eye time to register full coverage and the
// brand glyph reveal — without it the panels blow through center too fast.
const COVER = 0.45;
const HOLD = 0.25;
const UNCOVER = 0.45;
const PANEL_DURATION = COVER + HOLD + UNCOVER; // 1.15s
const PANEL_STAGGER = 0.035;
const TOTAL_DURATION = PANEL_DURATION + PANEL_STAGGER * (PANEL_COUNT - 1); // ~1.29s
const TOTAL_DURATION_MS = Math.ceil(TOTAL_DURATION * 1000);

// Gentle ease-in-out cubic. The previous expo curve was fastest at center,
// which made the visible part of the sweep blur past — this curve lingers.
const EASE: [number, number, number, number] = [0.65, 0, 0.35, 1];

const T_COVER_END = COVER / PANEL_DURATION;
const T_HOLD_END = (COVER + HOLD) / PANEL_DURATION;

// When all five panels are simultaneously covering the viewport. The last
// panel hits full cover at PANEL_STAGGER*(N-1) + COVER ≈ 0.59s, and panel 0
// starts uncovering at COVER + HOLD = 0.7s. Routing during this window
// keeps the new page hidden under the curtain.
const NAV_FIRE_MS = Math.round(
  (PANEL_STAGGER * (PANEL_COUNT - 1) + COVER + 0.02) * 1000
);

function shouldSkip(from: string, to: string): boolean {
  return (
    SKIP_PATHS.some((p) => from.startsWith(p)) ||
    SKIP_PATHS.some((p) => to.startsWith(p))
  );
}

export function PageTransition() {
  const pathname = usePathname();
  const router = useRouter();
  const lastPath = useRef<string | null>(null);
  const navInProgress = useRef(false);
  const [token, setToken] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Fallback for navigations not initiated by a click (router.replace,
  // back/forward, programmatic redirects). The curtain still plays, but it
  // overlays after the navigation rather than gating it.
  useEffect(() => {
    if (lastPath.current === null) {
      lastPath.current = pathname;
      return;
    }
    if (lastPath.current === pathname) return;

    const prev = lastPath.current;
    lastPath.current = pathname;

    if (navInProgress.current) return;
    if (shouldSkip(prev, pathname)) return;
    if (reduced) return;
    setToken((t) => t + 1);
  }, [pathname, reduced]);

  // Intercept link clicks so the curtain plays *before* the route swap,
  // not concurrently with it. Without this, Next.js routes synchronously
  // and the new page paints for a frame before the curtain starts.
  useEffect(() => {
    if (reduced) return;

    const handler = (e: MouseEvent) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (e.button !== 0) return;
      if (e.defaultPrevented) return;

      const a = (e.target as HTMLElement | null)?.closest("a");
      if (!a) return;
      if (a.getAttribute("target") === "_blank") return;
      if (a.hasAttribute("download")) return;

      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:")) return;

      let url: URL;
      try {
        url = new URL(a.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;
      if (shouldSkip(window.location.pathname, url.pathname)) return;

      // Capture-phase + stopPropagation is required: Next.js Link attaches
      // its click handler via React's delegated bubble phase and unconditionally
      // calls preventDefault + navigates. If we only preventDefault here, Link
      // still routes immediately. We have to stop the event before it reaches
      // React's listener so we own the navigation.
      e.preventDefault();
      e.stopPropagation();

      navInProgress.current = true;
      setToken((t) => t + 1);

      const target = url.pathname + url.search + url.hash;
      window.setTimeout(() => router.push(target), NAV_FIRE_MS);
      window.setTimeout(() => {
        navInProgress.current = false;
      }, TOTAL_DURATION_MS + 80);
    };

    document.addEventListener("click", handler, { capture: true });
    return () =>
      document.removeEventListener("click", handler, { capture: true });
  }, [router, reduced]);

  if (token === 0) return null;
  return <Curtain key={token} onDone={() => setToken(0)} />;
}

function Curtain({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDone, TOTAL_DURATION_MS + 60);
    return () => clearTimeout(id);
  }, [onDone]);

  return (
    <div
      aria-hidden
      className="fixed inset-0 z-[100] pointer-events-none overflow-hidden"
    >
      {Array.from({ length: PANEL_COUNT }).map((_, i) => {
        const isAccent = i % 2 === 1;
        return (
          <motion.div
            key={i}
            className="absolute"
            style={{
              top: `${(i * 100) / PANEL_COUNT}%`,
              height: `${100 / PANEL_COUNT + 0.8}%`,
              left: "-15%",
              width: "130%",
              background: isAccent ? "var(--accent)" : "var(--fg)",
              transform: "skewX(-7deg) translateZ(0)",
              willChange: "transform",
              backfaceVisibility: "hidden",
            }}
            initial={{ x: "-118%" }}
            animate={{ x: ["-118%", "0%", "0%", "118%"] }}
            transition={{
              duration: PANEL_DURATION,
              delay: i * PANEL_STAGGER,
              times: [0, T_COVER_END, T_HOLD_END, 1],
              ease: [EASE, "linear", EASE],
            }}
          />
        );
      })}

      <motion.div
        className="absolute inset-0 grid place-items-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0, 1, 1, 0] }}
        transition={{
          // Glyph fully visible during the all-panels-covered window
          // (~0.59s–0.7s of total ~1.29s = 46%–54%).
          times: [0, 0.4, 0.48, 0.56, 0.7],
          duration: TOTAL_DURATION,
          ease: "easeInOut",
        }}
      >
        <motion.span
          className="font-serif text-[var(--bg)] leading-none select-none"
          style={{
            fontSize: "clamp(96px, 17vw, 240px)",
            textShadow: "0 12px 60px rgba(0,0,0,0.30)",
          }}
          initial={{ scale: 0.92, rotate: -4, y: 6 }}
          animate={{ scale: 1.02, rotate: 2, y: -2 }}
          transition={{
            duration: TOTAL_DURATION,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          ♞
        </motion.span>
      </motion.div>

      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.16, 0.16, 0] }}
        transition={{
          duration: TOTAL_DURATION,
          ease: "easeInOut",
          times: [0, 0.42, 0.56, 0.78],
        }}
        style={{
          background:
            "radial-gradient(ellipse 55% 45% at 50% 50%, color-mix(in oklab, var(--accent) 28%, transparent), transparent 72%)",
          mixBlendMode: "screen",
        }}
      />
    </div>
  );
}
