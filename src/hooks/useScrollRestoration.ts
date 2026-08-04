import { useEffect, useLayoutEffect } from 'react';
import { scrollToInstant } from '../utils/scroll';

/**
 * Remembers how far down a page the user scrolled and smoothly restores it
 * the next time they land back on that page — no matter HOW they left:
 * following a "back" link from a detail page, switching tabs via the
 * bottom nav and coming back, using the browser's back button, etc.
 *
 * Previously each list page wired this up by hand, and only flagged
 * "restore" from one specific back-link's onClick. That meant leaving via
 * the bottom nav (e.g. Upcoming -> Completed -> Upcoming) always reset the
 * scroll to the top instead of remembering where the user was. Centralizing
 * the logic here — and flagging for restoration on unmount, for ANY reason
 * the page goes away — fixes that everywhere at once, and keeps every page
 * that adopts it behaving identically.
 *
 * @param pathname key this scroll position is stored under, e.g. '/trips'.
 *   Pass the route's own path (not the live URL) so it stays stable.
 * @param ready whether the page's content has finished loading. Restoring
 *   before then would scroll to a position the (still-loading, and
 *   therefore not yet tall enough) page can't actually reach. Pages with no
 *   async loading step (static content, or content that renders at full
 *   height immediately via skeletons/defaults) can just pass `true`.
 */
export function useScrollRestoration(pathname: string, ready: boolean) {
  // Keep track of how far down this page the user has scrolled.
  useEffect(() => {
    const handleScroll = () => {
      sessionStorage.setItem(`ulaa:scrollY:${pathname}`, String(window.scrollY));
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [pathname]);

  // Flag this page for scroll restoration on the way OUT, whenever it
  // unmounts — for any reason, not just via a specific back-link.
  useEffect(() => {
    return () => {
      sessionStorage.setItem(`ulaa:restoreScroll:${pathname}`, '1');
    };
  }, [pathname]);

  // Once the content is ready (so the page has its real height) and this
  // page has been flagged, jump back to the saved position. This runs in a
  // layout effect — synchronously, before the browser paints — and jumps
  // instantly rather than animating, so the position is already correct in
  // the very first frame the user sees; Layout's fade-in is what actually
  // reads as the transition. The flag is cleared right away so a normal,
  // fresh visit still starts at the top.
  useLayoutEffect(() => {
    if (!ready) return;
    const shouldRestore = sessionStorage.getItem(`ulaa:restoreScroll:${pathname}`);
    if (shouldRestore) {
      sessionStorage.removeItem(`ulaa:restoreScroll:${pathname}`);
      const savedY = Number(sessionStorage.getItem(`ulaa:scrollY:${pathname}`) || 0);
      scrollToInstant(savedY);
    }
  }, [ready, pathname]);
}
