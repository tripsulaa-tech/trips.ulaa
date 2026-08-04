import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useVersionCheck } from '../../hooks/useVersionCheck';

// Once a new deployment is detected, the page auto-refreshes after this
// many seconds — just enough for the banner to register with the user
// before their tab reloads out from under them.
const AUTO_REFRESH_SECONDS = 2;

/**
 * Site-wide banner that appears the moment a newer deployment goes live
 * while someone is already browsing the site, and refreshes their tab
 * automatically so everyone ends up on the latest version without needing
 * to know to hit reload themselves.
 */
export default function UpdateToast() {
  const updateAvailable = useVersionCheck();
  const [secondsLeft, setSecondsLeft] = useState(AUTO_REFRESH_SECONDS);

  useEffect(() => {
    if (!updateAvailable) return;

    const countdown = window.setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);

    const reloadTimer = window.setTimeout(() => {
      window.location.reload();
    }, AUTO_REFRESH_SECONDS * 1000);

    return () => {
      window.clearInterval(countdown);
      window.clearTimeout(reloadTimer);
    };
  }, [updateAvailable]);

  if (!updateAvailable) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[999] px-4 w-full sm:w-auto sm:max-w-sm">
      <div className="flex items-center gap-3 bg-dark text-white rounded-xl shadow-lg px-4 py-3">
        <RefreshCw size={18} className="shrink-0 animate-spin text-primary" />
        <div className="flex-1 text-sm font-body">
          <p className="font-semibold">A new version of ULAA is available</p>
          <p className="text-white/70 text-xs">Refreshing in {secondsLeft}s…</p>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="shrink-0 text-xs font-button font-semibold text-primary hover:text-primary-dark transition-colors cursor-pointer"
        >
          Refresh now
        </button>
      </div>
    </div>
  );
}
