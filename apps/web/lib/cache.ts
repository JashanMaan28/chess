// Tiny localStorage cache used for stale-while-revalidate fetches.
// Keys are namespaced under "gambit:cache:" to make `clearCache()` cheap and
// to avoid colliding with other localStorage usage (e.g. theme, activeGameId).

type Cached<T> = { value: T; at: number };

const PREFIX = "gambit:cache:";

export function readCache<T>(key: string): Cached<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw) as Cached<T>;
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      PREFIX + key,
      JSON.stringify({ value, at: Date.now() } satisfies Cached<T>)
    );
  } catch {
    // Quota or serialisation issue — non-fatal; we just won't cache this entry.
  }
}

// Remove all entries whose key matches the given prefix. Without an argument,
// removes the entire gambit cache (used on sign-out so the next user starts
// clean).
export function clearCache(prefix?: string) {
  if (typeof window === "undefined") return;
  const full = PREFIX + (prefix ?? "");
  for (const k of Object.keys(window.localStorage)) {
    if (k.startsWith(full)) window.localStorage.removeItem(k);
  }
}
