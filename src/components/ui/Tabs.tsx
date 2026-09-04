import { useState, useRef, useEffect, Children, isValidElement } from 'react';
import type { ReactNode, ReactElement, RefObject } from 'react';

interface TabPanelProps {
  label: string;
  children: ReactNode;
}

/** A single section's content. Must be a direct child of <Tabs>. */
export function TabPanel({ children }: TabPanelProps) {
  return <>{children}</>;
}

interface TabsProps {
  children: ReactNode;
  defaultIndex?: number;
  /** The actual scrollable ancestor this tab bar lives in (e.g. Modal's own
   *  overflow-y-auto body, via its `bodyRef`) — same idea as
   *  useContentEditorPage's `scrollBodyRef`. When provided, the scroll-spy
   *  observer is scoped to it and a tab click scrolls its scrollTop
   *  directly. Without it, a tab click falls back to the target's own
   *  scrollIntoView(), which walks *every* scrollable ancestor up to
   *  <body>/<html> — including ones with overflow-hidden (like a Modal
   *  panel), which still accept a programmatic scrollTop even though the
   *  user can't scroll them by hand — so the click can silently shift the
   *  page's own hidden scroll position and surface a stray native
   *  scrollbar behind the modal. Always pass this when Tabs is used inside
   *  a Modal. */
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
}

/** Pill-style tab bar (matching the public trip page) that acts as
 *  in-page navigation rather than show/hide panels: every section stays
 *  rendered and scrollable in one flow, tapping a tab jumps to that
 *  section, and the active pill updates automatically as the admin
 *  scrolls past each one. Nothing is ever hidden — clicking a tab just
 *  gets you there faster. */
export default function Tabs({ children, defaultIndex = 0, scrollContainerRef }: TabsProps) {
  const [active, setActive] = useState(defaultIndex);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const stickyBarRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);

  const panels = Children.toArray(children).filter(isValidElement) as ReactElement<TabPanelProps>[];

  const updateFades = () => {
    const el = barRef.current;
    if (!el) return;
    setShowLeftFade(el.scrollLeft > 4);
    setShowRightFade(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    updateFades();
    const el = barRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateFades);
    const resizeObserver = new ResizeObserver(updateFades);
    resizeObserver.observe(el);
    return () => {
      el.removeEventListener('scroll', updateFades);
      resizeObserver.disconnect();
    };
  }, [panels.length]);

  // Keeps the active pill in sync with whatever section is currently at
  // the top of the scroll area, so scrolling manually still highlights
  // the right tab (not just clicking one) — and keeps that tab scrolled
  // into view horizontally too, so it's never highlighted off-screen.
  const lastActiveRef = useRef(defaultIndex);
  // While a tab click's own smooth scroll is still in flight, the sections
  // it scrolls past will briefly cross the observed band too — ignore the
  // observer during that window so its corrective button scrollIntoView
  // doesn't fight/cancel the scroll the click just started.
  const suppressObserverRef = useRef(false);
  const suppressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Scrolls the tab bar horizontally only — avoids scrollIntoView's
  // block/vertical dimension entirely so it can never nudge the page's
  // vertical scroll (which is what let this compete with a click's scroll).
  const scrollButtonIntoView = (i: number) => {
    const bar = barRef.current;
    const btn = buttonRefs.current[i];
    if (!bar || !btn) return;
    const target = btn.offsetLeft - bar.clientWidth / 2 + btn.clientWidth / 2;
    bar.scrollTo({ left: target, behavior: 'smooth' });
  };

  // Height of the sticky tab bar below, measured live off the DOM rather
  // than guessed as a pixel constant — mirrors useContentEditorPage's
  // stickyOffset(), which does the same for its own sticky search+tab bar.
  const stickyOffset = () => stickyBarRef.current?.getBoundingClientRect().height ?? 0;

  // Small gap left between the sticky bar and a freshly-scrolled section's
  // heading, so it doesn't land flush against it — mirrors
  // useContentEditorPage's SECTION_SCROLL_GAP.
  const SECTION_SCROLL_GAP = 20;

  useEffect(() => {
    // Scoping the observer's root to the real scroll container (when known)
    // keeps its geometry — and therefore which section counts as "topmost"
    // — anchored to the container that's actually scrolling, exactly like
    // useContentEditorPage's own scroll-spy observer. Falling back to the
    // viewport (root: null) needs a fixed top rootMargin instead, to roughly
    // account for whatever sits above Tabs in the viewport.
    const container = scrollContainerRef?.current;
    const observer = new IntersectionObserver(
      entries => {
        if (suppressObserverRef.current) return;
        const visible = entries.filter(e => e.isIntersecting);
        if (visible.length === 0) return;
        const topMost = visible.reduce((a, b) => (a.boundingClientRect.top <= b.boundingClientRect.top ? a : b));
        const idx = sectionRefs.current.indexOf(topMost.target as HTMLDivElement);
        if (idx !== -1 && idx !== lastActiveRef.current) {
          lastActiveRef.current = idx;
          setActive(idx);
          scrollButtonIntoView(idx);
        }
      },
      container
        ? { root: container, rootMargin: '0px 0px -65% 0px', threshold: 0 }
        : { rootMargin: '-88px 0px -65% 0px', threshold: 0 }
    );
    sectionRefs.current.forEach(el => el && observer.observe(el));
    return () => observer.disconnect();
  }, [panels.length, scrollContainerRef]);

  // Scrolls a section into view. With a real scroll container passed in,
  // this scrolls its scrollTop directly — mirroring
  // useContentEditorPage's scrollSectionIntoView — instead of calling the
  // target's own scrollIntoView(), which walks *every* scrollable ancestor
  // up to <body>/<html>, including ones with overflow-hidden (like a Modal
  // panel), which still accept a programmatic scrollTop even though the
  // user can't scroll them by hand. Left unscoped, that silently shifts
  // the page's own hidden scroll position and can surface a stray native
  // scrollbar behind the modal — only falling back to scrollIntoView() when
  // no container was given.
  const scrollSectionIntoView = (i: number) => {
    const target = sectionRefs.current[i];
    if (!target) return;
    const container = scrollContainerRef?.current;
    if (!container) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const top = container.scrollTop + (targetRect.top - containerRect.top) - stickyOffset() - SECTION_SCROLL_GAP;
    container.scrollTo({ top, behavior: 'smooth' });
  };

  const handleSelect = (i: number) => {
    lastActiveRef.current = i;
    setActive(i);
    suppressObserverRef.current = true;
    if (suppressTimeoutRef.current) clearTimeout(suppressTimeoutRef.current);
    scrollSectionIntoView(i);
    scrollButtonIntoView(i);
    // Smooth scrolls to nearby sections finish quickly; give it generous
    // room for a long jump (e.g. first tab to last) before trusting the
    // observer again.
    suppressTimeoutRef.current = setTimeout(() => { suppressObserverRef.current = false; }, 900);
  };

  useEffect(() => () => { if (suppressTimeoutRef.current) clearTimeout(suppressTimeoutRef.current); }, []);

  return (
    <div>
      {/* Sticky so the jump-nav stays reachable while scrolling through a
          long section further down. Spans the full modal width (cancelling
          the body's own p-6) and repaints a solid white background over
          that padding area, so nothing scrolled-past can peek through
          above it. */}
      <div ref={stickyBarRef} data-sticky-toolbar className="sticky -top-6 z-20 bg-white -mx-6 -mt-6 px-6 pt-6 pb-3 mb-2">
        <div className="relative">
          <div ref={barRef} className="flex gap-2 overflow-x-auto scrollbar-hide">
            {panels.map((panel, i) => (
              <button
                key={panel.props.label}
                ref={el => { buttonRefs.current[i] = el; }}
                type="button"
                onClick={() => handleSelect(i)}
                aria-current={active === i ? 'true' : undefined}
                className={`shrink-0 px-4 py-2 rounded-md text-sm font-semibold whitespace-nowrap transition-colors ${
                  active === i
                    ? 'bg-primary text-white'
                    : 'bg-background text-dark-muted hover:text-dark'
                }`}
              >
                {panel.props.label}
              </button>
            ))}
          </div>
          {showLeftFade && (
            <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white to-transparent" />
          )}
          {showRightFade && (
            <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white to-transparent" />
          )}
        </div>
      </div>

      <div className="space-y-8">
        {panels.map((panel, i) => (
          <div
            key={panel.props.label}
            ref={el => { sectionRefs.current[i] = el; }}
            className="scroll-mt-24"
          >
            <h4 className="text-base font-bold text-dark mb-3 pb-2 border-b border-background-warm">
              {panel.props.label}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {panel}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}