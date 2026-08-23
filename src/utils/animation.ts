// Shared framer-motion presets. `fadeUp` was previously duplicated
// identically in MeetTheFounder.tsx and AboutPage.tsx — kept here once so
// the timing/easing can't quietly drift between the two.

/** Fade-and-rise-in-on-scroll preset for `<motion.div {...fadeUp(delay)}>` —
 *  used throughout the About/Home marketing sections. `delay` staggers
 *  items within the same group (e.g. a grid of cards). */
export const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.6, delay },
});
