import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Download, Menu, MoreVertical, Share, X } from 'lucide-react';
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

// There's no API to open Safari's share sheet for the user, so the
// "Install" button below can't finish the job itself — the best it can do
// is point at the real, physical spot on screen where the icon lives (the
// browser's own toolbar, outside our page), with a bouncing arrow anchored
// to whichever edge that toolbar is actually on for this browser.
interface IosStep {
  icon: typeof Share;
  text: string;
}

const IOS_STEPS: Record<IosBrowser, IosStep[]> = {
  safari: [
    { icon: Share, text: `Tap the Share icon ${IOS_SHARE_LOCATION.safari}` },
    { icon: Download, text: 'Scroll down and tap "Add to Home Screen"' },
    { icon: Download, text: 'Tap "Add" in the top-right corner' },
  ],
  chrome: [
    { icon: Share, text: `Tap the Share icon ${IOS_SHARE_LOCATION.chrome}` },
    { icon: Download, text: 'Tap "Add to Home Screen"' },
    { icon: Download, text: 'Tap "Add" to confirm' },
  ],
  firefox: [
    { icon: Menu, text: `Tap the menu icon ${IOS_SHARE_LOCATION.firefox}` },
    { icon: Share, text: 'Tap "Share"' },
    { icon: Download, text: 'Tap "Add to Home Screen", then "Add"' },
  ],
  edge: [
    { icon: MoreVertical, text: `Tap the menu icon ${IOS_SHARE_LOCATION.edge}` },
    { icon: Share, text: 'Tap "Share"' },
    { icon: Download, text: 'Tap "Add to Home Screen", then "Add"' },
  ],
};

// Where the icon actually sits on screen for each browser, so the arrow can
// point at the real toolbar edge instead of floating in the middle of a
// generic dialog.
const IOS_ANCHOR: Record<IosBrowser, { edge: 'top' | 'bottom'; align: 'start' | 'center' | 'end' }> = {
  // Safari: share icon is in the bottom toolbar, roughly centered.
  safari: { edge: 'bottom', align: 'center' },
  // Chrome iOS: share icon is in the top address bar, over on the right.
  chrome: { edge: 'top', align: 'end' },
  // Firefox/Edge iOS: menu icon is in the bottom toolbar, over on the right.
  firefox: { edge: 'bottom', align: 'end' },
  edge: { edge: 'bottom', align: 'end' },
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
  const [showIosSteps, setShowIosSteps] = useState(false);
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
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => setShowIosSteps(true)}
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

      {ios && iosBrowser ? (
        <AnimatePresence>
          {showIosSteps && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={[
                'fixed inset-0 z-[70] flex flex-col bg-dark/70 p-4 backdrop-blur-sm',
                IOS_ANCHOR[iosBrowser].edge === 'bottom' ? 'justify-end' : 'justify-start',
                IOS_ANCHOR[iosBrowser].align === 'end'
                  ? 'items-end'
                  : IOS_ANCHOR[iosBrowser].align === 'start'
                    ? 'items-start'
                    : 'items-center',
              ].join(' ')}
              onClick={() => setShowIosSteps(false)}
            >
              {IOS_ANCHOR[iosBrowser].edge === 'top' && (
                <ChevronUp className="h-9 w-9 shrink-0 animate-bounce text-white drop-shadow-lg" />
              )}
              <motion.div
                initial={{ y: IOS_ANCHOR[iosBrowser].edge === 'bottom' ? 20 : -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="my-2 w-full max-w-xs rounded-2xl bg-white p-5 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-sm font-semibold text-dark">
                  {isAdmin ? 'Install ULAA Admin' : 'Install the ULAA app'}
                </p>
                <ol className="mt-3 space-y-3">
                  {IOS_STEPS[iosBrowser].map((step) => (
                    <li key={step.text} className="flex items-start gap-3">
                      <step.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span className="text-sm text-dark">{step.text}</span>
                    </li>
                  ))}
                </ol>
                <button
                  onClick={() => {
                    setShowIosSteps(false);
                    setDismissed(true);
                  }}
                  className="mt-4 w-full rounded-lg bg-primary px-3 py-2 font-button text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
                >
                  Got it
                </button>
              </motion.div>
              {IOS_ANCHOR[iosBrowser].edge === 'bottom' && (
                <ChevronDown className="h-9 w-9 shrink-0 animate-bounce text-white drop-shadow-lg" />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      ) : null}
    </div>
  );
}
