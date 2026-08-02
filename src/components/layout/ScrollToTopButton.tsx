import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUp } from 'lucide-react';

const SHOW_AFTER_PX = 400;

interface ScrollToTopButtonProps {
  /**
   * Overrides the default `left-6` position — e.g. the admin layout passes
   * a wider offset on `lg+` so the button clears the fixed sidebar instead
   * of floating on top of it.
   */
  leftClass?: string;
}

export default function ScrollToTopButton({ leftClass = 'left-6' }: ScrollToTopButtonProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => setVisible(window.scrollY > SHOW_AFTER_PX);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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
          className={`fixed bottom-24 lg:bottom-6 ${leftClass} z-50 w-11 h-11 rounded-full bg-white border border-background-warm shadow-warm-lg flex items-center justify-center text-dark-muted hover:text-primary transition-colors`}
        >
          <ArrowUp size={18} />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
