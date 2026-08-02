import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Download, Menu, MoreVertical, Share, X } from 'lucide-react';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';

// iOS Safari (and, since they all relay to Safari's share sheet, Chrome/Edge/
// Firefox on iOS too) never fires `beforeinstallprompt` — Apple doesn't
// implement it at all, on any browser. So `canInstall` from useInstallPrompt
// will always be false here, and there is no way to trigger an install
// programmatically. The only path is the user manually tapping the Share
// icon and choosing "Add to Home Screen" — this just detects that platform
// so we can point them at it instead of showing nothing.
function isIos(): boolean {
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && 'ontouchend' in document);
}

// All iOS browsers are Safari (WebKit) under the hood, but each ships its
// own chrome around it, so the Share icon lives in a different spot in each
// one. Order matters: Chrome/Firefox/Edge on iOS all include "Safari" in
// their UA string too, so check their own tokens first and only fall back
// to "Safari" once those are ruled out.
type IosBrowser = 'chrome' | 'firefox' | 'edge' | 'safari';

function getIosBrowser(): IosBrowser {
  const ua = window.navigator.userAgent;
  if (ua.includes('CriOS')) return 'chrome';
  if (ua.includes('FxiOS')) return 'firefox';
  if (ua.includes('EdgiOS')) return 'edge';
  return 'safari';
}

const IOS_SHARE_LOCATION: Record<IosBrowser, string> = {
  // Chrome iOS: share icon sits in the top address bar, not a bottom toolbar.
  chrome: 'in the address bar at the top',
  // Firefox iOS: no dedicated share icon in the toolbar — it's inside the menu.
  firefox: 'in the menu at the bottom',
  // Edge iOS: share icon lives in the bottom "..." menu.
  edge: 'in the menu at the bottom',
  // Safari iOS: share icon is in the bottom toolbar (top toolbar on iPad).
  safari: 'in the toolbar at the bottom',
};

// Mobile Chrome/Edge no longer show their own install banner automatically
// on most visits — a page has to capture `beforeinstallprompt` and offer
// its own UI, otherwise there is nothing for the visitor to tap at all.
// This renders that UI for both the public site and /admin, with icon/copy
// that matches whichever one the visitor is currently on.
//
// /admin is a special case: once the public site is installed, Chrome on
// Android treats the whole origin (including /admin) as already covered by
// that install and won't fire beforeinstallprompt for it — a known
// same-origin limitation, not something fixable from the page itself. In
// that case we point the admin at "Create shortcut" from the browser menu
// instead, which isn't gated the same way and still picks up the
// admin-specific icon/manifest that's active on this route.
export default function InstallAppBanner() {
  const { canInstall, isInstalled, promptInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(false);
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');
  const ios = isIos();
  const iosBrowser = ios ? getIosBrowser() : null;

  if (isInstalled || dismissed) return null;
  if (!canInstall && !isAdmin && !ios) return null;

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
          {ios
            ? isAdmin
              ? 'Add the admin dashboard to your home screen for quick access.'
              : 'Add ULAA to your home screen for a faster, app-like experience.'
            : canInstall
              ? isAdmin
                ? 'Add the admin dashboard to your home screen for quick access.'
                : 'Add ULAA to your home screen for a faster, app-like experience.'
              : 'The main ULAA app is already installed on this device, so use "Create shortcut" instead to get a separate Admin icon.'}
        </p>
        {ios && iosBrowser ? (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-dark-muted">
            {iosBrowser === 'firefox' || iosBrowser === 'edge' ? (
              <>
                Tap <Menu className="h-3.5 w-3.5" /> ({IOS_SHARE_LOCATION[iosBrowser]}), then "Share" → "Add to Home Screen"
              </>
            ) : (
              <>
                Tap <Share className="h-3.5 w-3.5" /> ({IOS_SHARE_LOCATION[iosBrowser]}), then "Add to Home Screen"
              </>
            )}
          </div>
        ) : canInstall ? (
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
        ) : (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-dark-muted">
            Menu <MoreVertical className="h-3.5 w-3.5" /> → Create shortcut → check "Open as window"
          </div>
        )}
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
