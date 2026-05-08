"use client";
import * as React from "react";
import { readCache, writeCache } from "./cache";

export type CacheOpts = {
  /** How long the cache is "fresh"; within this window we don't refetch. */
  ttlMs: number;
  /** Refetch when the tab regains visibility (after the entry goes stale). */
  refetchOnFocus?: boolean;
};

type Result<T> = {
  data: T | null;
  isLoading: boolean;
  refetch: () => Promise<void>;
};

// Stale-while-revalidate hook. Renders the cached value instantly if any,
// then revalidates in the background only when the entry is older than ttlMs.
export function useCachedFetch<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  opts: CacheOpts
): Result<T> {
  const [data, setData] = React.useState<T | null>(() => {
    if (!key) return null;
    const c = readCache<T>(key);
    return c ? c.value : null;
  });
  const [isLoading, setIsLoading] = React.useState<boolean>(() => {
    if (!key) return false;
    return !readCache<T>(key);
  });

  // Keep the latest fetcher in a ref so the effect dependency only tracks key.
  const fetcherRef = React.useRef(fetcher);
  React.useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const fetchIt = React.useCallback(async () => {
    if (!key) return;
    try {
      const v = await fetcherRef.current();
      writeCache(key, v);
      setData(v);
    } catch {
      // Keep showing the cached value on error.
    } finally {
      setIsLoading(false);
    }
  }, [key]);

  // Initial / key change: fetch only if missing or stale.
  React.useEffect(() => {
    if (!key) {
      setData(null);
      setIsLoading(false);
      return;
    }
    const c = readCache<T>(key);
    if (c) {
      setData(c.value);
      setIsLoading(false);
      if (Date.now() - c.at > opts.ttlMs) fetchIt();
    } else {
      setIsLoading(true);
      fetchIt();
    }
  }, [key, opts.ttlMs, fetchIt]);

  // Revalidate on tab focus, but only if the cache has gone stale.
  React.useEffect(() => {
    if (!opts.refetchOnFocus || !key) return;
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      const c = readCache<T>(key);
      if (!c || Date.now() - c.at > opts.ttlMs) fetchIt();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [opts.refetchOnFocus, opts.ttlMs, key, fetchIt]);

  return { data, isLoading, refetch: fetchIt };
}
