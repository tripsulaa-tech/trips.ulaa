import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import Navbar from './Navbar';
import Footer from './Footer';
import FloatingWhatsApp from './FloatingWhatsApp';
import ScrollToTopButton from './ScrollToTopButton';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div
      className="min-h-screen flex flex-col view-only-images"
      // Right-click "Save image as / Copy image / Search with Google Lens"
      // all come from the browser's own image context menu — blocking it
      // here (it bubbles up from any <img>) covers every image on the
      // public site in one place instead of touching every page/component
      // that renders one. Paired with the .view-only-images CSS in
      // globals.css, which stops drag-out saving and the mobile long-press
      // callout menu too.
      onContextMenu={e => {
        if ((e.target as HTMLElement).closest('img')) e.preventDefault();
      }}
    >
      {/* Visually hidden until focused (first Tab press on any page) — lets
          keyboard users jump straight past the navbar's ~6 links instead of
          tabbing through them on every single page. Targets the same
          #main-content landmark that AppRouter's ScrollToTop moves focus to
          on route changes, so both paths land in the same place. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:bg-primary focus:text-white focus:font-button focus:font-semibold focus:text-sm focus:px-4 focus:py-2.5 focus:rounded-md focus:shadow-warm-lg"
      >
        Skip to content
      </a>
      <Navbar />
      {/* Every public page is wrapped in this Layout, and React swaps one
          page's Layout instance for another's on navigation (mount, not
          update) — so this entrance animation plays automatically on every
          route change, tab switch included, without any router-level
          AnimatePresence wiring. A soft fade + gentle rise, eased out
          (decelerating, no bounce) reads as a deliberate glide rather than
          a jarring cut or jump. By the time this plays, the page's scroll
          position has already been set correctly and instantly (see
          routes/AppRouter.tsx's ScrollToTop and
          hooks/useScrollRestoration.ts) — so this fade is the only motion
          the user actually sees; nothing visibly scrolls or snaps under it.

          id="main-content" + tabIndex={-1}: the skip link above and
          AppRouter's ScrollToTop (on every client-side route change) both
          focus this element directly — it's never in the normal Tab order
          itself, only a valid `.focus()` target — so a keyboard/
          screen-reader user always lands right at the new page's content,
          not still sitting on the link/button that triggered the
          navigation. outline-none because that focus is programmatic, not
          the result of the user tabbing onto an interactive element, so
          the browser's default focus ring would just be a stray box around
          the whole page. */}
      <motion.main
        id="main-content"
        tabIndex={-1}
        className="flex-1 outline-none"
        initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0.15 : 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </motion.main>
      <Footer />
      {/* Reserves space at the very end of the page on mobile so the fixed,
          edge-to-edge BottomNav (its height varies slightly with the
          device's safe-area inset) never overlaps the last line of the
          footer. Colored to match the footer background so this spacer
          reads as part of the footer instead of a visible gap between it
          and the bottom nav bar. */}
      <div className="h-28 lg:hidden bg-[#271e18]" aria-hidden="true" />
      <FloatingWhatsApp />
      <ScrollToTopButton />
    </div>
  );
}