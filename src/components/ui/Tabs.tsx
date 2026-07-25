import { useState, useRef, useEffect, Children, isValidElement } from 'react';
import type { ReactNode, ReactElement } from 'react';

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
}

/** Pill-style tab bar (matching the public trip page) that acts as
 *  in-page navigation rather than show/hide panels: every section stays
 *  rendered and scrollable in one flow, tapping a tab jumps to that
 *  section, and the active pill updates automatically as the admin
 *  scrolls past each one. Nothing is ever hidden — clicking a tab just
 *  gets you there faster. */
export default function Tabs({ children, defaultIndex = 0 }: TabsProps) {
  const [active, setActive] = useState(defaultIndex);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
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
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries.filter(e => e.isIntersecting);
        if (visible.length === 0) return;
        const topMost = visible.reduce((a, b) => (a.boundingClientRect.top <= b.boundingClientRect.top ? a : b));
        const idx = sectionRefs.current.indexOf(topMost.target as HTMLDivElement);
        if (idx !== -1 && idx !== lastActiveRef.current) {
          lastActiveRef.current = idx;
          setActive(idx);
          buttonRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
      },
      { rootMargin: '-88px 0px -65% 0px', threshold: 0 }
    );
    sectionRefs.current.forEach(el => el && observer.observe(el));
    return () => observer.disconnect();
  }, [panels.length]);

  const handleSelect = (i: number) => {
    lastActiveRef.current = i;
    setActive(i);
    sectionRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    buttonRefs.current[i]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  };

  return (
    <div>
      {/* Sticky so the jump-nav stays reachable while scrolling through a
          long section further down. Spans the full modal width (cancelling
          the body's own p-6) and repaints a solid white background over
          that padding area, so nothing scrolled-past can peek through
          above it. */}
      <div className="sticky top-0 z-20 bg-white -mx-6 -mt-6 px-6 pt-6 pb-3 mb-2">
        <div className="relative">
          <div ref={barRef} className="flex gap-2 overflow-x-auto scrollbar-hide">
            {panels.map((panel, i) => (
              <button
                key={panel.props.label}
                ref={el => { buttonRefs.current[i] = el; }}
                type="button"
                onClick={() => handleSelect(i)}
                className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${
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
