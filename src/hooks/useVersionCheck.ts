import { useEffect, useRef, useState } from 'react';

// How often to poll for a new deployment while the tab is open (ms).
// Kept short so a deploy is noticed almost immediately rather than users
// sitting on a stale build — the fetch itself is a tiny HTML request, so
// polling this often is cheap.
const CHECK_INTERVAL_MS = 5_000;

// Pulls a fingerprint out of an index.html document so it can be compared
// across fetches. index.html can reference more than one <script
// type="module"> tag — e.g. a small static loader shim (like Rolldown's
// runtime helper) plus the actual hashed entry chunk — and only some of
// those filenames change hash on every build. Matching just the first tag
// risks locking onto the one that stays byte-identical across deploys, so
// this collects every module script src instead and joins them; if *any*
// of them changes, the fingerprint changes too.
function extractBuildId(html: string): string | null {
  const matches = [...html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/gi)];
  if (matches.length === 0) return null;
  return matches.map((m) => m[1]).join('|');
}

/**
 * Detects when a newer build of the site has been deployed while the user
 * is still on an older build in their browser tab, and returns true once
 * that's the case. Compares the hashed entry-script filename referenced by
 * a freshly-fetched copy of /index.html (bypassing the cache) against the
 * one the current tab was loaded with. index.html is served with
 * no-cache/no-store headers (see vercel.json), so this always reflects
 * the live deployment.
 */
export function useVersionCheck(): boolean {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const currentBuildId = useRef<string | null>(null);

  useEffect(() => {
    // Baseline: every module script this tab was actually loaded with,
    // fingerprinted the same way as extractBuildId so the two are
    // comparing like for like.
    const loadedScripts = [...document.querySelectorAll('script[type="module"]')];
    const loadedSrcs = loadedScripts
      .map((el) => el.getAttribute('src'))
      .filter((src): src is string => !!src);
    currentBuildId.current = loadedSrcs.length > 0 ? loadedSrcs.join('|') : null;

    let cancelled = false;

    const checkForUpdate = async () => {
      try {
        const res = await fetch(`/index.html?ts=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const html = await res.text();
        const latestBuildId = extractBuildId(html);
        if (!latestBuildId || cancelled) return;

        if (currentBuildId.current === null) {
          // No baseline could be read from the loaded document (e.g. dev
          // mode quirks) — adopt the first fetched value as the baseline
          // instead of comparing against null.
          currentBuildId.current = latestBuildId;
          return;
        }

        if (latestBuildId !== currentBuildId.current) {
          setUpdateAvailable(true);
        }
      } catch {
        // Offline or a transient network hiccup — just try again next tick.
      }
    };

    const intervalId = window.setInterval(checkForUpdate, CHECK_INTERVAL_MS);

    // Also check right away whenever the tab regains focus/visibility,
    // since that's when a user is most likely to have missed a deploy
    // that happened while they were away.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', checkForUpdate);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', checkForUpdate);
    };
  }, []);

  return updateAvailable;
}
