import { useState, useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction, RefObject } from 'react';
import { useLocation } from 'react-router-dom';
import { useScrollRestoration } from '../hooks/useScrollRestoration';

interface UseSectionTabChromeResult {
  activeSection: number;
  /** Registers/clears the section element at `index` for the scroll-spy — pass as `ref={el => setSectionRef(i, el)}` on each section's wrapper. */
  setSectionRef: (index: number, el: HTMLDivElement | null) => void;
  tabBarRef: RefObject<HTMLDivElement | null>;
  tabButtonRefs: RefObject<(HTMLButtonElement | null)[]>;
  showLeftFade: boolean;
  showRightFade: boolean;
  handleTabSelect: (i: number) => void;

  pageSearch: string;
  setPageSearch: Dispatch<SetStateAction<string>>;
  pageSearchNoMatch: boolean;
  scrollBodyRef: RefObject<HTMLDivElement | null>;
}

// Tab bar (pills) + page-wide field search + scroll-spy chrome shared by
// every admin "content editor" page (useAdminHomePage, useContentEditorPage)
// that renders inside ContentEditorShell's `fixedHeight` AdminLayout.
// Previously an identical copy of all of this lived in both of those hooks;
// extracted here as part of a cleanup pass — behaviour is unchanged, only
// the content-loading/saving logic (which differs between them) stays put
// in each hook.
//
// `loading` gates the scroll-spy IntersectionObserver (sections aren't in
// the DOM yet while loading) and the scroll-restoration hook below.
// `sectionCount` drives the tab-bar edge-fade effect's re-measure — pass a
// fixed number for a static section list, or derive it from live content
// (e.g. `1 + content.features.length`) for a page whose sections grow or
// shrink with the data.
export function useSectionTabChrome(loading: boolean, sectionCount: number): UseSectionTabChromeResult {
  // Tab bar (pills): sections stay in one continuous scroll — clicking a
  // pill scrolls to that section, and the active pill updates automatically
  // as the admin scrolls past each one (same behavior as the Add Trip
  // modal's own tab bar / Tabs.tsx).
  const [activeSection, setActiveSection] = useState(0);
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const tabBarRef = useRef<HTMLDivElement>(null);
  const tabButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const lastActiveRef = useRef(0);
  // Edge fades on the tab bar (matches the Add Trip modal's Tabs.tsx) so
  // it's obvious there are more tabs to scroll to in either direction.
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);
  const suppressObserverRef = useRef(false);
  const suppressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressScrollListenerRef = useRef<(() => void) | null>(null);

  // Page-wide field search (mirrors the Add Trip modal's search field) —
  // scans every label/section-heading in the page, scrolls the first match
  // into view with a brief highlight flash.
  const [pageSearch, setPageSearch] = useState('');
  const [pageSearchNoMatch, setPageSearchNoMatch] = useState(false);
  const scrollBodyRef = useRef<HTMLDivElement>(null);

  // These pages render inside ContentEditorShell's `fixedHeight` AdminLayout,
  // which locks the document/window from scrolling at all and does its own
  // scrolling inside `scrollBodyRef` (see AdminLayout's fixedHeight effect
  // and ContentEditorShell's "app-scroll" div). AdminLayout's own
  // useScrollRestoration call is window-scoped, so on these pages it's
  // watching a scroll position that never moves — restoration needs to
  // target `scrollBodyRef` itself instead, which is what this does. Keyed
  // with a distinct '#editor-body' suffix (rather than reusing the bare
  // route pathname AdminLayout already uses) so the two restorations never
  // read/clear the same flag out from under each other regardless of which
  // of their layout effects happens to run first.
  const { pathname } = useLocation();
  useScrollRestoration(`${pathname}#editor-body`, !loading, scrollBodyRef);

  // The search bar + tab pills (data-sticky-toolbar in ContentEditorShell)
  // are sticky *inside* scrollBodyRef, so they stay pinned over whatever
  // content is scrolled to scrollTop 0 — landing a target flush with
  // scrollTop 0 tucks it right behind that bar instead of showing it.
  // Used by both handlePageSearch and scrollSectionIntoView below to land
  // just clear of it instead.
  const stickyOffset = () => {
    const bar = scrollBodyRef.current?.querySelector<HTMLElement>('[data-sticky-toolbar]');
    return bar ? bar.getBoundingClientRect().height : 0;
  };

  const handlePageSearch = () => {
    const query = pageSearch.trim().toLowerCase();
    const container = scrollBodyRef.current;
    if (!query || !container) {
      setPageSearchNoMatch(false);
      return;
    }
    const candidates = Array.from(container.querySelectorAll<HTMLElement>('label, h2'));
    const match = candidates.find(el => el.textContent?.toLowerCase().includes(query));
    if (!match) {
      setPageSearchNoMatch(true);
      return;
    }
    setPageSearchNoMatch(false);
    const sectionEl = match.closest<HTMLElement>('[data-section]');
    if (sectionEl) setActiveSection(Number(sectionEl.dataset.section) - 1);
    // Scroll within `container` only — see scrollSectionIntoView's comment
    // for why match.scrollIntoView() itself isn't used here. Centered in
    // whatever room is left below the sticky toolbar, so a match never
    // lands underneath it.
    const containerRect = container.getBoundingClientRect();
    const matchRect = match.getBoundingClientRect();
    const offset = stickyOffset();
    const visibleHeight = container.clientHeight - offset;
    const centerOffset = offset + visibleHeight / 2 - match.clientHeight / 2;
    const top = container.scrollTop + (matchRect.top - containerRect.top) - centerOffset;
    container.scrollTo({ top, behavior: 'smooth' });
    const previousBackground = match.style.backgroundColor;
    const previousTransition = match.style.transition;
    match.style.transition = 'background-color 0.3s ease';
    match.style.backgroundColor = '#FDE9D9';
    setTimeout(() => {
      match.style.backgroundColor = previousBackground;
      match.style.transition = previousTransition;
    }, 1500);
  };

  useEffect(() => {
    const timeout = setTimeout(() => handlePageSearch(), pageSearch.trim() ? 350 : 0);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSearch]);

  // Scroll-spy: highlights whichever section pill matches what's currently
  // at the top of the scroll area, same approach as Tabs.tsx. Scrolls the
  // tab bar's own scrollLeft directly (centering the button) instead of
  // the button's native scrollIntoView — scrollIntoView's block dimension
  // considers this page's outer vertical scroll containers too (it can't
  // be scoped to just the tab bar's horizontal axis), which meant a tab
  // scrolled would sometimes settle only partially into view instead of
  // fully. Computing the scrollLeft ourselves touches only the tab bar.
  const scrollTabIntoView = (i: number) => {
    const bar = tabBarRef.current;
    const btn = tabButtonRefs.current[i];
    if (!bar || !btn) return;
    const target = btn.offsetLeft - bar.clientWidth / 2 + btn.clientWidth / 2;
    bar.scrollTo({ left: target, behavior: 'smooth' });
  };

  // Keeps the edge fades in sync with the tab bar's scroll position — same
  // approach as Tabs.tsx. Depends on sectionCount since the tab bar's
  // scrollWidth changes on pages whose section list grows/shrinks with the
  // data (e.g. Why ULAA's feature cards); a no-op re-run on pages with a
  // fixed section count.
  const updateTabFades = () => {
    const el = tabBarRef.current;
    if (!el) return;
    setShowLeftFade(el.scrollLeft > 4);
    setShowRightFade(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    updateTabFades();
    const el = tabBarRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateTabFades);
    const resizeObserver = new ResizeObserver(updateTabFades);
    resizeObserver.observe(el);
    return () => {
      el.removeEventListener('scroll', updateTabFades);
      resizeObserver.disconnect();
    };
  }, [sectionCount]);

  useEffect(() => {
    const container = scrollBodyRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      entries => {
        if (suppressObserverRef.current) return;
        const visible = entries.filter(e => e.isIntersecting);
        if (visible.length === 0) return;
        const topMost = visible.reduce((a, b) => (a.boundingClientRect.top <= b.boundingClientRect.top ? a : b));
        const idx = sectionRefs.current.indexOf(topMost.target as HTMLDivElement);
        if (idx !== -1 && idx !== lastActiveRef.current) {
          lastActiveRef.current = idx;
          setActiveSection(idx);
          scrollTabIntoView(idx);
        }
      },
      { root: container, rootMargin: '0px 0px -65% 0px', threshold: 0 }
    );
    sectionRefs.current.forEach(el => el && observer.observe(el));
    return () => observer.disconnect();
  }, [loading]);

  useEffect(() => () => {
    if (suppressTimeoutRef.current) clearTimeout(suppressTimeoutRef.current);
    if (suppressScrollListenerRef.current) scrollBodyRef.current?.removeEventListener('scroll', suppressScrollListenerRef.current);
  }, []);

  // Scrolls a section into view within scrollBodyRef only, mirroring the
  // scrollTabIntoView approach above. Using the target's own
  // scrollIntoView() here would walk every scrollable ancestor up to
  // <body>/<html> — including ones with overflow-hidden, which still
  // accept a programmatic scrollTop even though the user can't scroll them
  // by hand — so a tab click could silently shift the page's own (hidden)
  // scroll position and drag the sticky page header out of view along with
  // it. Scrolling scrollBodyRef's scrollTop directly touches only the
  // section list itself. stickyOffset() (defined above) keeps the landed
  // section's own heading clear of the sticky search/tab bar.
  // Small visual gap left between the sticky toolbar and a freshly-scrolled
  // section's heading, so it doesn't land flush against the toolbar.
  const SECTION_SCROLL_GAP = 20;

  const scrollSectionIntoView = (i: number) => {
    const container = scrollBodyRef.current;
    const target = sectionRefs.current[i];
    if (!container || !target) return;
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const top = container.scrollTop + (targetRect.top - containerRect.top) - stickyOffset() - SECTION_SCROLL_GAP;
    container.scrollTo({ top, behavior: 'smooth' });
  };

  const handleTabSelect = (i: number) => {
    lastActiveRef.current = i;
    setActiveSection(i);
    suppressObserverRef.current = true;
    const container = scrollBodyRef.current;
    if (suppressTimeoutRef.current) clearTimeout(suppressTimeoutRef.current);
    if (suppressScrollListenerRef.current) {
      container?.removeEventListener('scroll', suppressScrollListenerRef.current);
      suppressScrollListenerRef.current = null;
    }
    scrollSectionIntoView(i);
    scrollTabIntoView(i);
    // Re-enable the scroll-spy once scrolling has actually gone idle,
    // rather than after a fixed delay. A fixed delay that's shorter than a
    // long jump's scroll duration (e.g. last section back to the first, on
    // a page this tall) lets the observer catch an intermediate section
    // mid-scroll and immediately snap the active tab back to it — which is
    // what made clicking an earlier (left-side) tab appear to bounce back
    // to the right.
    const clearSuppression = () => {
      suppressObserverRef.current = false;
      if (suppressScrollListenerRef.current) {
        container?.removeEventListener('scroll', suppressScrollListenerRef.current);
        suppressScrollListenerRef.current = null;
      }
    };
    const onScroll = () => {
      if (suppressTimeoutRef.current) clearTimeout(suppressTimeoutRef.current);
      suppressTimeoutRef.current = setTimeout(clearSuppression, 150);
    };
    suppressScrollListenerRef.current = onScroll;
    container?.addEventListener('scroll', onScroll);
    // Fallback in case no scroll event fires at all (e.g. already at the target).
    suppressTimeoutRef.current = setTimeout(clearSuppression, 150);
  };

  const setSectionRef = (index: number, el: HTMLDivElement | null) => {
    sectionRefs.current[index] = el;
  };

  return {
    activeSection,
    setSectionRef,
    tabBarRef,
    tabButtonRefs,
    showLeftFade,
    showRightFade,
    handleTabSelect,
    pageSearch,
    setPageSearch,
    pageSearchNoMatch,
    scrollBodyRef,
  };
}
