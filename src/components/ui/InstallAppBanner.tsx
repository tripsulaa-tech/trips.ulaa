import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Download, X } from 'lucide-react';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';

// Mobile Chrome/Edge no longer show their own install banner automatically
// on most visits — a page has to capture `beforeinstallprompt` and offer
// its own UI, otherwise there is nothing for the visitor to tap at all.
// This renders that UI for both the public site and /admin, with icon/copy
// that matches whichever one the visitor is currently on.
export default function InstallAppBanner() {
  const { canInstall, isInstalled, promptInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(false);
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');

  if (!canInstall || isInstalled || dismissed) return null;

  const handleInstall = async () => {
    const accepted = await promptInstall();
    if (accepted) setDismissed(true);
  };

  return (
    <div className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:left-auto sm:right-4 sm:w-80 z-[60] flex items-start gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-xl">
      <img
        src={isAdmin ? '/icons/admin/icon-192.png' : '/icons/user/icon-192.png'}
        alt=""
        className="h-10 w-10 shrink-0 rounded-lg"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-dark">
          {isAdmin ? 'Install ULAA Admin' : 'Install the ULAA app'}
        </p>
        <p className="mt-0.5 text-xs text-dark-muted">
          {isAdmin
            ? 'Add the admin dashboard to your home screen for quick access.'
            : 'Add ULAA to your home screen for a faster, app-like experience.'}
        </p>
        <div className="mt-3 flex gap-2">
          <button
            onClick={handleInstall}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 font-button text-xs font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            <Download className="h-3.5 w-3.5" />
            Install
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="rounded-lg px-3 py-1.5 font-button text-xs text-dark-muted transition-colors hover:bg-gray-100"
          >
            Not now
          </button>
        </div>
      </div>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="shrink-0 text-dark-muted hover:text-dark"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
