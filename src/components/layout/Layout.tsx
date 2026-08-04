import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import Navbar from './Navbar';
import Footer from './Footer';
import FloatingWhatsApp from './FloatingWhatsApp';
import ScrollToTopButton from './ScrollToTopButton';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
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
          the user actually sees; nothing visibly scrolls or snaps under it. */}
      <motion.main
        className="flex-1"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
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