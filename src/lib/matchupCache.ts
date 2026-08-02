// src/lib/matchupCache.ts
//
// Shared client-side response cache for the NCAAF analysis tabs.
//
// AnalysisTabs unmounts a tab's component when you switch away from it, so
// every switch re-ran that tab's fetch — and Summary re-requested what Eckel
// and Powers had already loaded. Keying by URL dedupes across tabs AND across
// game cards, since all three tabs build identical matchup URLs.
//
// The in-flight promise is cached (not just the result), so two components
// mounting in the same tick share one request rather than racing.

const TTL_MS = 10 * 60 * 1000; // snapshots change weekly at most

interface Entry {
  at: number;
  promise: Promise<unknown>;
}

const cache = new Map<string, Entry>();

/**
 * GET a JSON URL, reusing a recent response when one exists. Failures are
 * evicted immediately so a retry re-requests instead of replaying the error.
 */
export function cachedJson<T>(url: string): Promise<T> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return hit.promise as Promise<T>;
  }

  const promise = fetch(url)
    .then((r) => r.json())
    .catch((err) => {
      cache.delete(url);
      throw err;
    });

  cache.set(url, { at: Date.now(), promise });
  return promise as Promise<T>;
}

/** Drop cached responses — call after writing new ratings from the admin page. */
export function clearMatchupCache(): void {
  cache.clear();
}
