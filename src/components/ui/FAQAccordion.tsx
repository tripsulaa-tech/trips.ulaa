import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { FAQ as FAQType } from '../../types';

interface FAQProps {
  faqs: FAQType[];
}

export default function FAQAccordion({ faqs }: FAQProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = useCallback((index: number) => {
    setOpenIndex(prev => (prev === index ? null : index));
  }, []);

  return (
    <div className="space-y-3">
      {faqs.map((faq, index) => (
        <div
          key={index}
          className="bg-white rounded-2xl border border-background-warm overflow-hidden"
        >
          <button
            onClick={() => toggle(index)}
            className="w-full flex items-center justify-between gap-4 p-6 text-left"
            aria-expanded={openIndex === index}
          >
            <span className="font-display font-semibold text-dark text-lg">{faq.question}</span>
            {openIndex === index ? (
              <ChevronUp size={20} className="text-primary shrink-0" />
            ) : (
              <ChevronDown size={20} className="text-primary shrink-0" />
            )}
          </button>
          <AnimatePresence>
            {openIndex === index && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: 'easeInOut' }}
              >
                <div className="px-6 pb-6 text-dark-muted leading-relaxed border-t border-background-warm pt-4">
                  {faq.answer}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}
