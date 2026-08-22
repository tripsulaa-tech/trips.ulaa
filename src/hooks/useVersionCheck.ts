import { useEffect, useState } from 'react';

// How often to explicitly ask the browser to re-check /sw.js for changes
// while the tab is open (ms). Browsers only check an already-registered SW
// for updates on navigation by default, which is easy to miss in an SPA
// where a tab (especially the admin panel) stays open for a long session
// without a full reload — so this checks explicitly on an interval instead.
//
// Kept short (rather than the 15s this used to be) because a longer gap
// between reg.update() calls is exactly what made the "refresh available"
// toast feel like it took forever to show up after a Vercel deploy — the
// tab was simply waiting out the rest of its interval before it even asked
// the browser to look for a new /sw.js.
const CHECK_INTERVAL_MS = 4_000;

/**
 * Detects when a newer build of the site has been deployed while the user
 * is still on an older build in their browser tab, and returns true once
 * that's the case.
 *
 * This relies on the browser's native service-worker update lifecycle
 * rather than diffing fetched HTML: /sw.js is stamped with a unique build
 * id on every build (see the stampServiceWorker plugin in vite.config.ts),
 * so a new deployment always means different bytes at /sw.js. The service
 * worker itself (public/sw.js) calls self.skipWaiting() + clients.claim()
 * unconditionally, so a newly-installed SW takes over immediately — which
 * fires a `controllerchange` event on every open tab. That's the signal
 * this hook listens for, guarding against the false positive of a tab's
 * very first SW claim (no deploy involved, just the SW activating for the
 * first time) by only treating it as a real update if a controller was
 * already present.
 *
 * The SW itself is registered once, globally, in main.tsx (for both the
 * public site and /admin) — this hook just listens to and polls that
 * existing registration.
 */
export function useVersionCheck(): boolean {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let cancelled = false;
    // Guards against firing twice (controllerchange can theoretically fire
    // more than once) and against treating the tab's very first SW claim
    // (nothing was deployed, the SW is just activating for the first time)
    // as an update.
    let hadController = !!navigator.serviceWorker.controller;
    let reloadTriggered = false;

    const onControllerChange = () => {
      if (reloadTriggered) return;
      if (hadController) {
        reloadTriggered = true;
        if (!cancelled) setUpdateAvailable(true);
      }
      hadController = true;
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    const checkForUpdate = () => {
      navigator.serviceWorker.getRegistration().then((reg) => {
        reg?.update().catch(() => {
          // Offline or a transient network hiccup — next tick retries.
        });
      });
    };

    // Check immediately, then on an interval, then again whenever the tab
    // regains focus (covers a deploy that happened while it was
    // backgrounded rather than waiting for the next poll).
    checkForUpdate();
    const intervalId = window.setInterval(checkForUpdate, CHECK_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', checkForUpdate);

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', checkForUpdate);
    };
  }, []);

  return updateAvailable;
}
