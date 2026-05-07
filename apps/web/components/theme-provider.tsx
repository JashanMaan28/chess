"use client";
import * as React from "react";

type Theme = "midnight" | "ember";

type Ctx = {
  theme: Theme;
  setTheme: (t: Theme) => void;
};

const ThemeContext = React.createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>("midnight");

  React.useEffect(() => {
    const saved = (localStorage.getItem("theme") as Theme | null) || "midnight";
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
  return (
    <button
      onClick={() => setTheme(theme === "midnight" ? "ember" : "midnight")}
      className="text-xs font-mono uppercase tracking-wider px-3 py-1.5 rounded-md border border-[var(--border)] hover:border-[var(--accent)] transition-colors"
    >
      {theme === "midnight" ? "midnight" : "ember"}
    </button>
  );
}
