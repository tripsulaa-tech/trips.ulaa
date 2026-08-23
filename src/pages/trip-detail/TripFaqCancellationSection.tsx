import { motion, AnimatePresence } from 'framer-motion';
import FAQAccordion from '../../components/ui/FAQAccordion';
import CancellationPolicyDisplay from '../../components/ui/CancellationPolicyDisplay';
import type { UpcomingTrip } from '../../types/types-index';
import { DEFAULT_CANCELLATION_POLICY } from '../../constants/cancellationPolicy';
import { CaretDown as ChevronDown, CaretUp as ChevronUp } from '@phosphor-icons/react';

interface TripFaqCancellationSectionProps {
  trip: UpcomingTrip;
  faqsOpen: boolean;
  setFaqsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  cancellationOpen: boolean;
  setCancellationOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function TripFaqCancellationSection({
  trip,
  faqsOpen,
  setFaqsOpen,
  cancellationOpen,
  setCancellationOpen,
}: TripFaqCancellationSectionProps) {
  return (
    <>
      {/* FAQs */}
      {trip.faqs.length > 0 && (
        <section id="faqs" className="scroll-mt-44">
          <button
            type="button"
            onClick={() => setFaqsOpen(o => !o)}
            aria-expanded={faqsOpen}
            className="w-full flex items-center justify-between gap-4 mb-6"
          >
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-dark">FAQs</h2>
            {faqsOpen ? (
              <ChevronUp size={24} className="text-primary shrink-0" />
            ) : (
              <ChevronDown size={24} className="text-primary shrink-0" />
            )}
          </button>
          <AnimatePresence initial={false}>
            {faqsOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: 'easeInOut' }}
                className="overflow-hidden"
              >
                <FAQAccordion faqs={trip.faqs} />
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      )}

      {/* Cancellation Policy */}
      <section id="cancellation" className="scroll-mt-44">
        <button
          type="button"
          onClick={() => setCancellationOpen(o => !o)}
          aria-expanded={cancellationOpen}
          className="w-full flex items-center justify-between gap-4 mb-6"
        >
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-dark">Cancellation Policy</h2>
          {cancellationOpen ? (
            <ChevronUp size={24} className="text-primary shrink-0" />
          ) : (
            <ChevronDown size={24} className="text-primary shrink-0" />
          )}
        </button>
        <AnimatePresence initial={false}>
          {cancellationOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <CancellationPolicyDisplay policy={trip.cancellation_policy || DEFAULT_CANCELLATION_POLICY} />
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </>
  );
}
