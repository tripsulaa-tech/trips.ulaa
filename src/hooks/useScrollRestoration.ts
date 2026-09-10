import { useEffect, useLayoutEffect, useRef } from 'react';
import { scrollToInstant } from '../utils/scroll';

/**
 * Captures the current scroll position for `pathname` and flags it for
 * restoration the next time that page is visited. Call this synchronously
 * from whatever actually triggers navigation away — a sidebar link's
 * onClick, a "sign out" button's onClick — BEFORE the navigation itself
 * runs, rather than relying solely on this hook's own unmount-cleanup
 * capture below.
 *
 * Why this exists in addition to that cleanup: by the time a layout
 * effect's cleanup fires for the page being left, React may already be
 * partway through tearing down that page's DOM as part of the very same
 * commit that mounts the destination page. If the page being left was
 * scrolled further down than the document is tall once its content is
 * removed, the browser clamps window.scrollY back toward 0 the instant
 * that happens — so reading window.scrollY inside the cleanup can already
 * be reading a clamped, wrong value (0, or close to it), no matter how
 * carefully the cleanup itself is written. Capturing here, at the moment
 * of the click, sidesteps that race entirely: nothing has been torn down
 * yet, so window.scrollY is still exactly where the admin left it. This is
 * what actually fixes "scrolled down, switched pages, came back, and it's
 * back at the top" — the unmount cleanup alone could never fully solve it.
 */
export function captureScrollForRestore(pathname: string) {
  sessionStorage.setItem(`ulaa:scrollY:${pathname}`, String(window.scrollY));
  sessionStorage.setItem(`ulaa:restoreScroll:${pathname}`, '1');
}

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
  // Keep track of how far down this page the user has scrolled. This is
  // the main source of truth for ulaa:scrollY — see captureScrollForRestore
  // above for the more precise, click-time capture, and the layout effect
  // below for the unmount-time fallback (which deliberately does NOT
  // re-capture scrollY, since that can already be a clamped value by then).
  useEffect(() => {
    const handleScroll = () => {
      sessionStorage.setItem(`ulaa:scrollY:${pathname}`, String(window.scrollY));
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [pathname]);

  // Flag this page for scroll restoration on the way OUT, whenever it
  // unmounts — for any reason, not just via a specific back-link — and
  // capture its exact final scroll position right then and there.
  //
  // This has to be a LAYOUT effect's cleanup, not a plain effect's. Plain
  // (passive) effect cleanups for an unmounting subtree are flushed on
  // React's own schedule, which can land AFTER the page being navigated TO
  // has already run its own layout effects — including ScrollToTop and
  // this very hook's restore step below, for whichever page the admin
  // lands back on next. If that happens, the restore flag/position for
  // THIS page wouldn't be written yet when a later visit checks for it,
  // so restoration would silently be skipped (or restore to a stale
  // position) — exactly the "I scrolled down, came back, and it landed
  // somewhere else" symptom this hook exists to prevent. A layout effect's
  // cleanup always runs synchronously, in the same commit as the unmount,
  // so it's guaranteed to be written before anything downstream can read
  // it. Reading window.scrollY directly here (rather than trusting only
  // the running record above) also sidesteps any risk of the last 'scroll'
  // event's handler not having flushed yet.
  //
  // In dev, React 18's <StrictMode> deliberately double-invokes every
  // effect on initial mount — setup, then IMMEDIATELY its own cleanup, then
  // setup again — to surface effects with missing cleanup. The component
  // never actually leaves the screen for that phantom cycle, but this
  // cleanup doesn't know that: it would fire anyway, at a moment when
  // window.scrollY is still whatever the PREVIOUS page happened to be
  // scrolled to (ScrollToTop deliberately hasn't reset it yet — see below),
  // and stomp the real saved position this page's previous, genuine visit
  // left behind with that leftover value. The next visit would then
  // "restore" to that garbage instead of where the admin actually was —
  // in practice this reliably reproduces as "came back and it's at the
  // top", every single time, in dev. `justMountedRef` distinguishes that
  // synchronous phantom cleanup (fired in the same tick as setup, before
  // the setTimeout below has had a chance to run) from a real unmount
  // (which only ever happens much later, well after the timeout has
  // cleared the flag).
  const justMountedRef = useRef(true);
  useLayoutEffect(() => {
    justMountedRef.current = true;
    const clearFlag = setTimeout(() => { justMountedRef.current = false; }, 0);
    return () => {
      clearTimeout(clearFlag);
      if (justMountedRef.current) return;
      // Fallback only, for whatever navigation away WASN'T already captured
      // by captureScrollForRestore() at click-time (e.g. the browser's own
      // back/forward buttons, which fire no click handler of ours).
      // Deliberately does NOT (re)write ulaa:scrollY here — by the time
      // this cleanup runs, React may have already started removing this
      // page's DOM as part of the same commit, and reading window.scrollY
      // after a tall page's content is torn down can return an
      // already-clamped value (see captureScrollForRestore's docs above).
      // The passive 'scroll' listener above keeps ulaa:scrollY reasonably
      // fresh on its own, and any click-time capture already wrote the
      // exact value — this only needs to guarantee the restore flag itself
      // ends up set.
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
    if (!shouldRestore) return;
    sessionStorage.removeItem(`ulaa:restoreScroll:${pathname}`);
    const savedY = Number(sessionStorage.getItem(`ulaa:scrollY:${pathname}`) || 0);
    scrollToInstant(savedY);

    // `ready` only tracks THIS hook's own notion of "loaded" (usually just
    // the page's main list/data fetch) — but plenty of pages keep growing
    // after that: web fonts swapping in and reflowing text, a secondary
    // fetch that isn't gated by `ready` (e.g. a KPI/summary card, a banner
    // that only shows once its own data arrives), images without a
    // reserved size, etc. If the document is still shorter than `savedY`
    // at the exact instant we jump, the browser silently clamps the scroll
    // toward the top — and since nothing re-checks it, the page is left
    // sitting there even once it's grown tall enough to reach the real
    // target a moment later. That's the "I scrolled down, came back, and
    // it landed somewhere else (often right back at the top)" symptom.
    //
    // Re-assert the target position for a short window after the jump,
    // but only once the page has actually grown enough to reach it —
    // never yank the admin somewhere they haven't scrolled-content for
    // yet. Stops the moment the admin scrolls by hand (a deliberate
    // override) or once the window elapses.
    let cancelled = false;
    let rafId = 0;
    const deadline = performance.now() + 1500;
    const reassert = () => {
      if (cancelled) return;
      const maxScrollable = document.documentElement.scrollHeight - window.innerHeight;
      if (Math.abs(window.scrollY - savedY) > 2 && maxScrollable >= savedY) {
        scrollToInstant(savedY);
      }
      if (performance.now() < deadline) {
        rafId = requestAnimationFrame(reassert);
      }
    };
    rafId = requestAnimationFrame(reassert);

    const stopOnUserScroll = () => { cancelled = true; };
    window.addEventListener('wheel', stopOnUserScroll, { passive: true, once: true });
    window.addEventListener('touchmove', stopOnUserScroll, { passive: true, once: true });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('wheel', stopOnUserScroll);
      window.removeEventListener('touchmove', stopOnUserScroll);
    };
  }, [ready, pathname]);
}
