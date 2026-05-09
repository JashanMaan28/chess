"use client";
import * as React from "react";
import { ContrastIcon, type ContrastIconHandle } from "./icons/contrast-icon";

type Theme = "gambit" | "ink";

type Ctx = {
  theme: Theme;
  setTheme: (t: Theme) => void;
};

const ThemeContext = React.createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>("gambit");

  React.useEffect(() => {
    const saved = (localStorage.getItem("theme") as Theme | null) || "gambit";
    setThemeState(saved);
    document.documentElement.dataset.theme = saved;
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    localStorage.setItem("theme", t);
    document.documentElement.dataset.theme = t;
  };

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme outside provider");
  return ctx;
}

export function ThemeSwitch() {
  const { theme, setTheme } = useTheme();
  const next = theme === "gambit" ? "ink" : "gambit";
  const iconRef = React.useRef<ContrastIconHandle>(null);

  // The icon's "animate" state rotates the filled half 180°. We bind it to
  // the active theme so the visible orientation reflects what's currently on,
  // and hover-previews the other theme by flipping to the opposite state.
  React.useEffect(() => {
    if (!iconRef.current) return;
    if (theme === "ink") iconRef.current.startAnimation();
    else iconRef.current.stopAnimation();
  }, [theme]);

  const onEnter = React.useCallback(() => {
    if (!iconRef.current) return;
    if (theme === "ink") iconRef.current.stopAnimation();
    else iconRef.current.startAnimation();
  }, [theme]);

  const onLeave = React.useCallback(() => {
    if (!iconRef.current) return;
    if (theme === "ink") iconRef.current.startAnimation();
    else iconRef.current.stopAnimation();
  }, [theme]);

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      title={`Switch to ${next}`}
      aria-label={`Switch theme (currently ${theme}, click for ${next})`}
      className="grid place-items-center size-9 rounded-md border border-[var(--border)] hover:border-[var(--fg)] text-[var(--fg-muted)] hover:text-[var(--fg)] transition-[border-color,color,transform] duration-150 active:scale-[0.92] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
    >
      <ContrastIcon ref={iconRef} size={18} />
    </button>
  );
}
