import { useEffect, useState } from 'react';

interface ResponsiveCounts {
  base: number;
  sm?: number;
  md?: number;
  lg?: number;
}

/** Resolves how many cards should show at once for the current viewport
 *  width, matching Tailwind's sm(640)/md(768)/lg(1024) breakpoints. */
export function useResponsiveItemsPerView({ base, sm, md, lg }: ResponsiveCounts): number {
  const getValue = () => {
    if (typeof window === 'undefined') return base;
    const w = window.innerWidth;
    if (lg !== undefined && w >= 1024) return lg;
    if (md !== undefined && w >= 768) return md;
    if (sm !== undefined && w >= 640) return sm;
    return base;
  };

  const [value, setValue] = useState(getValue);

  useEffect(() => {
    const onResize = () => setValue(getValue());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, sm, md, lg]);

  return value;
}
