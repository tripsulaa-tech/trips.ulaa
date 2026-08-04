import { useEffect, useRef, useState } from 'react';

// How often to poll for a new deployment while the tab is open (ms).
// Kept short so a deploy is noticed almost immediately rather than users
// sitting on a stale build — the fetch itself is a tiny HTML request, so
// polling this often is cheap.
const CHECK_INTERVAL_MS = 5_000;

// Pulls the hashed asset entry (e.g. /assets/main-abc123.js) out of an
// index.html document so it can be compared across fetches. Vite renames
// this file's hash on every build, so a change here reliably means a new
// deployment has gone live — without needing a dedicated version endpoint.
function extractBuildId(html: string): string | null {
  const match = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/i);
  return match ? match[1] : null;
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
    // Baseline: the module script this tab was actually loaded with.
    const loadedScript = document.querySelector('script[type="module"]');
    currentBuildId.current = loadedScript?.getAttribute('src') ?? null;

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
