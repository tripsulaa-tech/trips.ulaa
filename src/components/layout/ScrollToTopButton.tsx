import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUp } from 'lucide-react';

const SHOW_AFTER_PX = 400;

export default function ScrollToTopButton() {
  const { pathname } = useLocation();
  const [visible, setVisible] = useState(false);

  // Trip detail pages already have their own sticky quick-jump nav
  // (Overview / Itinerary / ...), which doubles as a way back to the top.
  // A second floating button there just adds clutter on mobile.
  const hasOwnNav = /^\/trips\/[^/]+$/.test(pathname);

  useEffect(() => {
    if (hasOwnNav) { setVisible(false); return; }
    const handleScroll = () => setVisible(window.scrollY > SHOW_AFTER_PX);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [hasOwnNav]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Back to top"
          title="Back to top"
          initial={{ opacity: 0, y: 10, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.9 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          className="fixed bottom-24 lg:bottom-6 left-6 z-50 w-11 h-11 rounded-full bg-white border border-background-warm shadow-warm-lg flex items-center justify-center text-dark-muted hover:text-primary transition-colors"
        >
          <ArrowUp size={18} />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
