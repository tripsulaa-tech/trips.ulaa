// Session-storage flags and the scroll helper used by the collapsible sections
// of the Creator Rate Calculator page.

// Height of AdminLayout's sticky top bar (76px mobile / 92px desktop, plus
// a little breathing room) — used whenever a collapsible section on this
// page is expanded and scrolled into view, since scrolling its header to
// the very top of the page would otherwise tuck it directly underneath
// that sticky bar instead of leaving it visible below it.
export const STICKY_HEADER_SCROLL_OFFSET = 100;

// Saved Calculations card/row expand state — kept in sessionStorage (not
// localStorage) so leaving this page for another admin screen and coming
// back mid-visit doesn't lose your place, but the card still honours its
// "collapsed by default" design on a fresh tab/next day rather than
// permanently remembering whatever was left open.
export const HISTORY_EXPANDED_KEY = 'cr_history_expanded';
export const HISTORY_EXPANDED_ID_KEY = 'cr_history_expanded_id';
export const TEMPLATE_EXPANDED_KEY = 'cr_template_expanded';

export function readSessionFlag(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function readSessionString(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

// Scrolls `el` (offset for the sticky top bar) into place, then keeps
// re-checking its position for a short window instead of trusting a single
// snapshot-in-time scroll. Right after a click, this page's layout can
// still be settling — web fonts swapping in, an in-flight fetch resolving
// — any of which nudges content up/down a beat after we've already
// scrolled, leaving the target back off-screen even though the scroll
// "worked". Re-asserts the corrected position on every frame for ~800ms,
// stopping early the moment the admin scrolls by hand.
export function scrollElementIntoView(el: HTMLElement, offset: number) {
  let cancelled = false;
  const deadline = performance.now() + 800;
  let firstJump = true;

  const step = () => {
    if (cancelled) return;
    const target = el.getBoundingClientRect().top + window.scrollY - offset;
    if (Math.abs(window.scrollY - target) > 2) {
      // The first jump animates (smooth) so opening the panel reads as one
      // motion; any later correction (layout having shifted since) snaps
      // instantly — a second smooth call would just restart the easing
      // and fight itself into visible jitter instead of settling.
      window.scrollTo({ top: target, behavior: firstJump ? 'smooth' : 'auto' });
      firstJump = false;
    }
    if (performance.now() < deadline) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);

  const stop = () => { cancelled = true; };
  window.addEventListener('wheel', stop, { passive: true, once: true });
  window.addEventListener('touchmove', stop, { passive: true, once: true });

  return () => {
    cancelled = true;
    window.removeEventListener('wheel', stop);
    window.removeEventListener('touchmove', stop);
  };
}
