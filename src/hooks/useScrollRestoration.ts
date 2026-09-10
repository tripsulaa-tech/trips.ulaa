import { useEffect, useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { scrollToInstant } from '../utils/scroll';

/**
 * Remembers how far down a page the user scrolled and smoothly restores it
 * the next time they land back on that page — no matter HOW they left:
 * following a "back" link from a detail page, switching tabs via the
 * bottom nav and coming back, using the browser's back button, etc.
 *
 * Previously each list page wired this up by hand, and only flagged
 * "restore" from one specific back-link's onClick (e.g. TripHero's "All
 * Trips" link setting `ulaa:restoreScroll:/trips` itself). That meant
 * leaving via any OTHER route back to the page — the bottom nav, say —
 * always reset the scroll to the top instead of remembering where the user
 * was. Centralizing the "flag this page on the way out" part here, so it
 * happens automatically on unmount regardless of which link the user
 * actually clicked, fixes that everywhere at once, and keeps every page
 * that adopts it behaving identically without needing its own hand-wired
 * back-link — see the layout effect below.
 *
 * Most pages scroll the WINDOW itself, which is what this restores by
 * default. A few admin editor screens (About Page, Home Page — anything
 * built on ContentEditorShell) are laid out at a fixed 100vh and scroll an
 * inner "app-scroll" div instead, with the document/window locked from
 * scrolling at all (see AdminLayout's fixedHeight effect). For those, pass
 * `containerRef` pointing at that inner scrollable element — every read,
 * write, and listener below then targets the container's own scrollTop
 * instead of window.scrollY, since window never moves on those pages and
 * restoring against it would silently do nothing.
 *
 * @param pathname key this scroll position is stored under, e.g. '/trips'.
 *   Pass the route's own path (not the live URL) so it stays stable.
 * @param ready whether the page's content has finished loading. Restoring
 *   before then would scroll to a position the (still-loading, and
 *   therefore not yet tall enough) page can't actually reach. Pages with no
 *   async loading step (static content, or content that renders at full
 *   height immediately via skeletons/defaults) can just pass `true`.
 * @param containerRef optional ref to the element that actually scrolls,
 *   for pages that scroll an inner container rather than the window.
 *   Leave unset for ordinary window-scrolling pages.
 */
export function useScrollRestoration(pathname: string, ready: boolean, containerRef?: RefObject<HTMLElement | null>) {
  // Resolves to the actual scrolling box every time it's called, rather
  // than being captured once — a `containerRef`'s element only exists once
  // its page has finished loading (ContentEditorShell doesn't render the
  // "app-scroll" div at all while `loading`), so effects below re-read this
  // fresh instead of caching a `null` from before it mounted.
  const getScrollTop = () => (containerRef ? containerRef.current?.scrollTop ?? 0 : window.scrollY);

  // The single source of truth for how far down this page the user has
  // scrolled. Written continuously, live, during ordinary scrolling — which
  // is what makes it safe to read from anywhere, including during a later
  // unmount: it was never captured AT the moment of leaving, so it's never
  // at risk of reading a value after this page's DOM has already started
  // being torn down (see the layout effect below for why that specifically
  // matters).
  useEffect(() => {
    const target: EventTarget | null = containerRef ? containerRef.current : window;
    if (!target) return;
    const handleScroll = () => {
      sessionStorage.setItem(`ulaa:scrollY:${pathname}`, String(getScrollTop()));
    };
    target.addEventListener('scroll', handleScroll, { passive: true });
    return () => target.removeEventListener('scroll', handleScroll);
    // `ready` is included so a `containerRef`'s element — which doesn't
    // exist until its page is done loading — gets this listener attached
    // the moment it actually mounts, instead of the effect having run once
    // already against a `null` container and never re-checking.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, ready, containerRef]);

  // Flag this page for scroll restoration on the way OUT, whenever it
  // unmounts — for any reason, not just via a specific back-link. This is
  // the one piece a page would otherwise have to wire up by hand (as the
  // public trip/album pages' back-links do, one at a time, per known
  // return path) — doing it here on unmount instead means it happens for
  // every possible exit automatically, with no per-page wiring needed.
  //
  // This has to be a LAYOUT effect's cleanup, not a plain effect's. Plain
  // (passive) effect cleanups for an unmounting subtree are flushed on
  // React's own schedule, which can land AFTER the page being navigated TO
  // has already run its own layout effects — including ScrollToTop and
  // this very hook's restore step below, for whichever page the admin
  // lands back on next. If that happens, the restore flag for THIS page
  // wouldn't be set yet when a later visit checks for it, so restoration
  // would silently be skipped — exactly the "I scrolled down, came back,
  // and it landed somewhere else" symptom this hook exists to prevent. A
  // layout effect's cleanup always runs synchronously, in the same commit
  // as the unmount, so it's guaranteed to be set before anything
  // downstream can read it.
  //
  // In dev, React 18's <StrictMode> deliberately double-invokes every
  // effect on initial mount — setup, then IMMEDIATELY its own cleanup, then
  // setup again — to surface effects with missing cleanup. The component
  // never actually leaves the screen for that phantom cycle, but this
  // cleanup doesn't know that: it would fire anyway and mark THIS page
  // (which hasn't gone anywhere) as flagged for restoration, purely as a
  // side effect of mounting. `justMountedRef` distinguishes that
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
      // Flags this page for restoration on whatever visit comes next — the
      // one thing this needs to do, since ulaa:scrollY is already being
      // kept fresh by the passive 'scroll' listener above, live, the whole
      // time this page was on screen. Deliberately does NOT (re)read the
      // scroll position here to write it — by the time this cleanup runs,
      // React may have already started removing this page's DOM as part of
      // the same commit that mounts wherever the admin is headed next, and
      // reading the scroll position after a tall page's content is torn
      // down can return an already-clamped value (0, or close to it)
      // rather than the real position. The passive listener was never at
      // risk of that, since it only ever captures during ordinary,
      // mid-scroll use.
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
    const container = containerRef?.current ?? null;
    if (containerRef && !container) return; // container-mode page not mounted yet
    const shouldRestore = sessionStorage.getItem(`ulaa:restoreScroll:${pathname}`);
    if (!shouldRestore) return;
    sessionStorage.removeItem(`ulaa:restoreScroll:${pathname}`);
    const savedY = Number(sessionStorage.getItem(`ulaa:scrollY:${pathname}`) || 0);
    scrollToInstant(savedY, container);

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
      const currentY = getScrollTop();
      const maxScrollable = container
        ? container.scrollHeight - container.clientHeight
        : document.documentElement.scrollHeight - window.innerHeight;
      if (Math.abs(currentY - savedY) > 2 && maxScrollable >= savedY) {
        scrollToInstant(savedY, container);
      }
      if (performance.now() < deadline) {
        rafId = requestAnimationFrame(reassert);
      }
    };
    rafId = requestAnimationFrame(reassert);

    const stopOnUserScroll = () => { cancelled = true; };
    // Listening on window (rather than the container) covers both modes at
    // once: a 'wheel'/'touchmove' dispatched on an inner scroll container
    // still bubbles up to window by default, so this still sees it even
    // when `containerRef` is set.
    window.addEventListener('wheel', stopOnUserScroll, { passive: true, once: true });
    window.addEventListener('touchmove', stopOnUserScroll, { passive: true, once: true });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('wheel', stopOnUserScroll);
      window.removeEventListener('touchmove', stopOnUserScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pathname, containerRef]);
}
