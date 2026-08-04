/**
 * Jump the window to a scroll position immediately, bypassing the site's
 * global `scroll-behavior: smooth` (see styles/globals.css).
 *
 * That global smooth-scroll is meant for in-page anchors (e.g. the "back to
 * top" button), but it also intercepts plain `window.scrollTo` calls made
 * during navigation — so resetting to the top of a fresh page, or jumping
 * back to a remembered position, would animate/slide into place AFTER the
 * new page's content is already visible. That visible slide is what reads
 * as a "jump": the page yanks itself into position in front of the user
 * instead of just already being there.
 *
 * Using this for navigation-time scroll changes (reset-to-top, restore),
 * combined with running it in a layout effect (before paint) and Layout's
 * own fade-in, means the position is corrected before anything is shown —
 * the fade is the only motion the user actually sees.
 */
export function scrollToInstant(top: number) {
  const root = document.documentElement;
  const previous = root.style.scrollBehavior;
  root.style.scrollBehavior = 'auto';
  window.scrollTo(0, top);
  root.style.scrollBehavior = previous;
}
