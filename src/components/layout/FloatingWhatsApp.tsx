import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { getWhatsAppLink } from '../../utils/utils-index';
import { WhatsAppIcon } from '../icons/WhatsAppIcon';

const WHATSAPP_NUMBER = '916381336772';

export default function FloatingWhatsApp() {
  const [hovered, setHovered] = useState(false);

  return (
    <div className="fixed bottom-28 lg:bottom-6 right-6 z-50 flex items-center gap-3">
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
        href={getWhatsAppLink(WHATSAPP_NUMBER, 'Hi! I am interested in Ulaa travel experiences.')}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat on WhatsApp"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        onHoverStart={() => setHovered(true)}
        onHoverEnd={() => setHovered(false)}
        className="w-14 h-14 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center shadow-warm-lg text-white transition-colors"
      >
        <WhatsAppIcon className="w-7 h-7" />
      </motion.a>
    </div>
  );
}
