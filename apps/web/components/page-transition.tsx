"use client";

import { motion } from "motion/react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const SKIP_PATHS = ["/onboarding", "/sign-in", "/sign-up"];

const PANEL_COUNT = 5;
const PANEL_DURATION = 0.7;
const PANEL_STAGGER = 0.045;
const TOTAL_DURATION = PANEL_DURATION + PANEL_STAGGER * (PANEL_COUNT - 1);
const TOTAL_DURATION_MS = Math.ceil(TOTAL_DURATION * 1000);
const EASE: [number, number, number, number] = [0.76, 0, 0.24, 1];

export function PageTransition() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);
  const [token, setToken] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (lastPath.current === null) {
      lastPath.current = pathname;
      return;
    }
    if (lastPath.current === pathname) return;

    const prev = lastPath.current;
    lastPath.current = pathname;

    if (
      SKIP_PATHS.some((p) => pathname.startsWith(p)) ||
      SKIP_PATHS.some((p) => prev.startsWith(p))
    ) {
      return;
    }
    if (reduced) return;
    setToken((t) => t + 1);
  }, [pathname, reduced]);

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
              height: `${100 / PANEL_COUNT + 0.6}%`,
              left: "-22%",
              width: "144%",
              background: isAccent ? "var(--accent)" : "var(--fg)",
              transform: "skewX(-9deg)",
              willChange: "transform",
              boxShadow: isAccent
                ? "0 0 30px rgba(104, 125, 58, 0.25)"
                : "0 0 30px rgba(0, 0, 0, 0.35)",
            }}
            initial={{ x: "-150%" }}
            animate={{ x: "150%" }}
            transition={{
              duration: PANEL_DURATION,
              delay: i * PANEL_STAGGER,
              ease: EASE,
            }}
          />
        );
      })}

      <motion.div
        className="absolute inset-0 grid place-items-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0, 1, 1, 0] }}
        transition={{
          times: [0, 0.32, 0.46, 0.62, 0.86],
          duration: TOTAL_DURATION,
          ease: "easeInOut",
        }}
      >
        <motion.span
          className="font-serif text-[var(--bg)] leading-none select-none"
          style={{
            fontSize: "clamp(96px, 17vw, 240px)",
            textShadow:
              "0 10px 50px rgba(0,0,0,0.35), 0 0 1px rgba(255,255,255,0.25)",
          }}
          initial={{ scale: 0.82, rotate: -10, y: 12 }}
          animate={{ scale: 1.06, rotate: 3, y: -6 }}
          transition={{
            duration: TOTAL_DURATION,
            ease: [0.16, 1, 0.3, 1],
          }}
        >
          ♞
        </motion.span>
      </motion.div>

      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.18, 0] }}
        transition={{
          duration: TOTAL_DURATION,
          ease: "easeInOut",
          times: [0, 0.5, 1],
        }}
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 50%, color-mix(in oklab, var(--accent) 30%, transparent), transparent 70%)",
          mixBlendMode: "screen",
        }}
      />
    </div>
  );
}
