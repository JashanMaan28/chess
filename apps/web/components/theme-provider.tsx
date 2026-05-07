"use client";
import * as React from "react";

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
  return (
    <button
      onClick={() => setTheme(next)}
      title={`Switch to ${next}`}
      className="text-[11px] font-mono uppercase tracking-[0.1em] px-2.5 py-1.5 rounded-md border border-[var(--border)] hover:border-[var(--fg)] text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors"
    >
      {theme}
    </button>
  );
}
