import {
  ArrowsClockwise as RefreshCw,
} from '@phosphor-icons/react';
import { useVersionCheck } from '../../hooks/useVersionCheck';

/**
 * Site-wide banner that appears the moment a newer deployment goes live
 * while someone is already browsing the site. Stays up until they
 * explicitly click Refresh — it never reloads the tab on its own, since an
 * admin or user could be mid-edit in a form (adding a trip, filling out an
 * enquiry, etc.) and an unannounced reload would lose that unsaved work.
 */
export default function UpdateToast() {
  const updateAvailable = useVersionCheck();

  if (!updateAvailable) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[999] px-4 w-full sm:w-auto sm:max-w-sm">
      <div className="flex items-center gap-3 bg-dark text-white rounded-xl shadow-lg px-4 py-3">
        <RefreshCw size={18} className="shrink-0 text-primary" />
        <div className="flex-1 text-sm font-body">
          <p className="font-semibold">A new version of ULAA is available</p>
          <p className="text-white/70 text-xs">Refresh whenever you're ready.</p>
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
