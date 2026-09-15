// Shared framer-motion presets. `fadeUp` was previously duplicated
// identically in MeetTheFounder.tsx and AboutPage.tsx — kept here once so
// the timing/easing can't quietly drift between the two.

// Read once per call rather than wired up as a live-updating hook — every
// call site here is a plain object literal spread onto a `motion.*` prop,
// not a component, so there's nowhere to subscribe for a change mid-render.
// Matches the same one-shot matchMedia check TripOrbitScene.tsx already
// uses for the same reason.
const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Fade-and-rise-in-on-scroll preset for `<motion.div {...fadeUp(delay)}>` —
 *  used throughout the About/Home marketing sections. `delay` staggers
 *  items within the same group (e.g. a grid of cards). Collapses to a
 *  quick opacity-only fade (no rise, no stagger) when the visitor has
 *  requested reduced motion. */
export const fadeUp = (delay = 0) => {
  if (prefersReducedMotion()) {
    return {
      initial: { opacity: 0 },
      whileInView: { opacity: 1 },
      viewport: { once: true },
      transition: { duration: 0.2 },
    };
  }
  return {
    initial: { opacity: 0, y: 30 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true },
    transition: { duration: 0.6, delay },
  };
};
