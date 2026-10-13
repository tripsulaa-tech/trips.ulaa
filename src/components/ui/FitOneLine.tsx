import { useLayoutEffect, useRef } from 'react';
import type { ElementType, ReactNode } from 'react';

interface FitOneLineProps {
  children: ReactNode;
  /** Tailwind classes. The font-size classes here (including responsive ones) set the MAXIMUM size. */
  className?: string;
  as?: ElementType;
  /** Never shrink below this many px; past it the text is cut with an ellipsis instead. */
  minPx?: number;
}

/**
 * A heading that always stays on ONE line: it renders at the size its classes
 * ask for, and only if the text is too wide for the space available does it
 * shrink — proportionally to how much too wide it is — so short titles stay
 * big and long ones get smaller. Re-fits on resize, rotation and when web
 * fonts finish loading. Measured before paint, so there is no visible jump.
 */
export default function FitOneLine({ children, className = '', as: Tag = 'h1', minPx = 18 }: FitOneLineProps) {
  const ref = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;

    const fit = () => {
      el.style.fontSize = ''; // back to the class-defined maximum
      const maxPx = parseFloat(getComputedStyle(el).fontSize);
      const available = parent.clientWidth;
      const needed = el.scrollWidth;
      if (available > 0 && needed > available) {
        // Text width scales linearly with font size, so one proportional step lands it.
        el.style.fontSize = `${Math.max(minPx, Math.floor(maxPx * (available / needed) * 100) / 100)}px`;
      }
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(parent);
    void document.fonts?.ready.then(fit);
    return () => ro.disconnect();
  }, [children, minPx]);

  return (
    <Tag ref={ref} className={`${className} whitespace-nowrap overflow-hidden text-ellipsis`}>
      {children}
    </Tag>
  );
}
