import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getWhatsAppLink } from '../../utils/utils-index';
import { WhatsAppIcon } from '../icons/WhatsAppIcon';
import { WHATSAPP_NUMBER } from '../../constants/site';

export default function FloatingWhatsApp() {
  const [hovered, setHovered] = useState(false);
  const { pathname } = useLocation();
  const [heroVisible, setHeroVisible] = useState(true);

  useEffect(() => {
    if (pathname !== '/') return;
    const hero = document.querySelector('[data-home-hero]');
    if (!hero) return;
    // Keep mobile hero actions clear; restore chat once the hero leaves
    // the usable viewport beneath the fixed 80px header.
    const observer = new IntersectionObserver(([entry]) => {
      setHeroVisible(entry.isIntersecting);
    }, { rootMargin: '-80px 0px 0px 0px' });
    observer.observe(hero);
    return () => observer.disconnect();
  }, [pathname]);

  return (
    <div className={`fixed bottom-28 lg:bottom-6 right-4 lg:right-6 z-50 flex items-center gap-3 [body.fullscreen-modal-open_&]:hidden ${pathname === '/' && heroVisible ? 'max-lg:invisible max-lg:pointer-events-none' : ''}`}>
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, x: 10, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 10, scale: 0.9 }}
            className="bg-white rounded-lg shadow-warm-lg px-4 py-2 text-sm font-medium text-dark whitespace-nowrap border border-background-warm"
          >
            Chat with us on WhatsApp!
          </motion.div>
        )}
      </AnimatePresence>
      <motion.a
        href={getWhatsAppLink(WHATSAPP_NUMBER)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat on WhatsApp"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        onHoverStart={() => setHovered(true)}
        onHoverEnd={() => setHovered(false)}
        className="w-12 h-12 lg:w-14 lg:h-14 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center shadow-warm-lg text-white transition-colors"
      >
        <WhatsAppIcon className="w-6 h-6 lg:w-7 lg:h-7" />
      </motion.a>
    </div>
  );
}
