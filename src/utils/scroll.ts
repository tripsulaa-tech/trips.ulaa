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
export function scrollToInstant(top: number, container?: HTMLElement | null) {
  // A specific scroll container (e.g. an admin editor page's own internal
  // "app-scroll" area) never inherits the <html> element's global
  // `scroll-behavior: smooth` — that CSS property only ever governs the
  // element it's set on, not other scrollers nested inside it — so there's
  // nothing to bypass here; setting scrollTop directly is already instant.
  if (container) {
    container.scrollTop = top;
    return;
  }
  const root = document.documentElement;
  const previous = root.style.scrollBehavior;
  root.style.scrollBehavior = 'auto';
  window.scrollTo(0, top);
  root.style.scrollBehavior = previous;
}

/**
 * Scans `container` for the first element matching `selector` whose text
 * content includes `query` (case-insensitive), scrolls it into view within
 * `container` itself, and flashes it with a brief highlight. Shared by the
 * Add/Edit Trip modal's in-modal field search (useTripFormModal) and every
 * admin content-editor page's page-wide field search (useSectionTabChrome)
 * — previously an identical copy of this lived in both.
 *
 * Scrolls `container.scrollTop` directly rather than calling the match's
 * own `scrollIntoView()`: scrollIntoView() walks every scrollable ancestor
 * up to <body>/<html>, including any overflow-hidden wrapper along the way
 * (e.g. a modal panel's own frame), which still accepts a programmatic
 * scrollTop even though the user can't scroll it by hand. That could
 * silently shift a hidden ancestor's own scroll position and surface a
 * stray scrollbar behind the modal, or drag a page's sticky header out of
 * view — scoping the scroll to `container`'s own scrollTop touches only
 * the intended scroller.
 *
 * `getStickyOffset`, if given, is called (with `container`) once a match is
 * found and should return the height (px) of any sticky bar overlapping the
 * top of `container`, so the match is centered in whatever room is left
 * below it instead of landing underneath it — each caller's sticky bar is
 * found/measured differently, so this is left to them rather than assumed
 * here.
 *
 * `onMatch`, if given, is called with the matched element before scrolling
 * — e.g. so a page-wide search can also sync which section tab is active.
 *
 * Returns whether a match was found, so callers can drive their own
 * "no match" messaging.
 */
export function scrollToTextMatch(
  container: HTMLElement | null,
  query: string,
  selector: string,
  options: {
    getStickyOffset?: (container: HTMLElement) => number;
    onMatch?: (match: HTMLElement) => void;
  } = {},
): boolean {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed || !container) return false;
  const candidates = Array.from(container.querySelectorAll<HTMLElement>(selector));
  const match = candidates.find(el => el.textContent?.toLowerCase().includes(trimmed));
  if (!match) return false;

  options.onMatch?.(match);

  const containerRect = container.getBoundingClientRect();
  const matchRect = match.getBoundingClientRect();
  const offset = options.getStickyOffset?.(container) ?? 0;
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

  return true;
}

/** Lowercases and strips punctuation so "Why You'll Love" matches "why youll love". */
const normalizeSearchText = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();

interface RankedMatch {
  el: HTMLElement;
  /** Lower is better. Tier (what kind of text matched) * 10 + strength (how well). */
  score: number;
  order: number;
}

/**
 * Finds everything in `container` that matches `query`, best match first:
 *   1. section headings and field labels   (e.g. "Pricing", "Meeting point")
 *   2. hint text and button text           (e.g. "Add Card", "Intro text under…")
 *   3. placeholders                        (e.g. "Search by …")
 *   4. text already typed into a field     (e.g. a day title, a highlight)
 * Within a tier an exact match beats "starts with", which beats "contains";
 * ties keep page order. This is what makes typing "itinerary" land on the
 * Itinerary section instead of the first label that merely mentions it.
 */
export function findRankedMatches(container: HTMLElement | null, query: string): HTMLElement[] {
  const q = normalizeSearchText(query);
  if (!q || !container) return [];
  const results: RankedMatch[] = [];
  const seen = new Set<HTMLElement>();
  const add = (el: HTMLElement, text: string, tier: number, order: number) => {
    if (seen.has(el)) return;
    const t = normalizeSearchText(text);
    if (!t.includes(q)) return;
    // Skip anything that isn't actually laid out (hidden / collapsed).
    if (el.getClientRects().length === 0) return;
    const strength = t === q ? 0 : t.startsWith(q) ? 1 : t.split(' ').some(w => w.startsWith(q)) ? 2 : 3;
    seen.add(el);
    results.push({ el, score: tier * 10 + strength, order });
  };
  let order = 0;
  container.querySelectorAll<HTMLElement>('label, h2, h3, h4, h5, legend').forEach(el => add(el, el.textContent || '', 0, order++));
  container.querySelectorAll<HTMLElement>('p, button, summary').forEach(el => add(el, el.textContent || '', 1, order++));
  container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea').forEach(el => {
    if (el.type === 'checkbox' || el.type === 'radio' || el.type === 'file' || el.type === 'hidden') return;
    add(el, el.placeholder || '', 2, order++);
  });
  container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea').forEach(el => {
    if (el.type === 'number' || el.type === 'checkbox' || el.type === 'radio' || el.type === 'file' || el.type === 'hidden') return;
    add(el, el.value || '', 3, order++);
  });
  return results.sort((a, b) => a.score - b.score || a.order - b.order).map(r => r.el);
}

/**
 * Scrolls `container` so `match` sits in the middle of the room left below any
 * sticky bar, and flashes it. For a label it also flashes the field it
 * belongs to, so it's obvious which box you've been taken to. Focus is left
 * alone on purpose, so the admin can keep typing in the search box.
 */
export function scrollToMatchElement(
  container: HTMLElement,
  match: HTMLElement,
  getStickyOffset?: (container: HTMLElement) => number,
) {
  const containerRect = container.getBoundingClientRect();
  const matchRect = match.getBoundingClientRect();
  const offset = getStickyOffset?.(container) ?? 0;
  const visibleHeight = container.clientHeight - offset;
  const top = container.scrollTop + (matchRect.top - containerRect.top) - (offset + visibleHeight / 2 - matchRect.height / 2);
  container.scrollTo({ top, behavior: 'smooth' });

  const targets: HTMLElement[] = [match];
  if (match instanceof HTMLLabelElement && match.htmlFor) {
    const field = container.querySelector<HTMLElement>(`#${CSS.escape(match.htmlFor)}`);
    if (field) targets.push(field);
  }
  targets.forEach(el => {
    const prevBg = el.style.backgroundColor;
    const prevTransition = el.style.transition;
    el.style.transition = 'background-color 0.3s ease';
    el.style.backgroundColor = '#FDE9D9';
    setTimeout(() => {
      el.style.backgroundColor = prevBg;
      el.style.transition = prevTransition;
    }, 1500);
  });
}
