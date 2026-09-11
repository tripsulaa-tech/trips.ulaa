import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, UsersThree } from '@phosphor-icons/react';
import { useCloseOnOutsideClick } from '../../hooks/useCloseOnOutsideClick';

interface AdminEnquiriesFabProps {
  onAddEnquiry: () => void;
  onBulkEnquiry: () => void;
}

// Mobile-only speed-dial replacement for the "Bulk Enquiry" / "Add Enquiry"
// button pair sitting above the KPI cards. On a phone-width screen those
// two full-size buttons eat an entire row before a single enquiry is even
// visible. A single "+" FAB in the corner is the pattern people already
// know from every other mobile app — it fans out into the same two
// actions (each still carrying its own label, so nothing is lost) only
// when tapped, instead of permanently costing a full-width row.
//
// Desktop keeps the original inline button pair (see AdminEnquiries.tsx,
// `hidden sm:flex`) — there's plenty of horizontal room there already, and
// a FAB is a mobile-native convention, not a desktop one.
export default function AdminEnquiriesFab({ onAddEnquiry, onBulkEnquiry }: AdminEnquiriesFabProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useCloseOnOutsideClick(open, [rootRef], () => setOpen(false), { escape: true });

  // Ordered bottom-to-top: the item listed last renders closest to the
  // main FAB (i.e. reached with the smallest thumb movement), so the more
  // frequently used "Add Enquiry" action sits right above the FAB and
  // "Bulk Enquiry" sits one step further.
  const actions = [
    { label: 'Bulk Enquiry', icon: UsersThree, onClick: onBulkEnquiry },
    { label: 'Add Enquiry', icon: Plus, onClick: onAddEnquiry },
  ];

  return (
    <div ref={rootRef} className="sm:hidden fixed bottom-6 right-6 z-[45] flex flex-col items-end gap-3">
      <AnimatePresence>
        {open && (
          <>
            {/* Faint scrim so the fanned-out actions read as a distinct
                overlay and an accidental tap on the list behind doesn't
                also trigger a row action. */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              aria-hidden="true"
              className="fixed inset-0 bg-dark/10 -z-10"
            />
            {actions.map((action, i) => (
              <motion.button
                key={action.label}
                type="button"
                initial={{ opacity: 0, y: 14, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 14, scale: 0.9 }}
                transition={{ delay: (actions.length - 1 - i) * 0.035 }}
                onClick={() => {
                  action.onClick();
                  setOpen(false);
                }}
                className="flex items-center gap-2.5"
              >
                <span className="font-button font-semibold text-xs text-dark bg-white px-3 py-1.5 rounded-full shadow-warm-lg whitespace-nowrap">
                  {action.label}
                </span>
                <span className="w-11 h-11 rounded-full bg-white border-2 border-primary shadow-warm-lg flex items-center justify-center text-primary shrink-0">
                  <action.icon size={18} aria-hidden="true" />
                </span>
              </motion.button>
            ))}
          </>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close quick actions' : 'Add enquiry'}
        aria-expanded={open}
        aria-haspopup="true"
        whileTap={{ scale: 0.92 }}
        animate={{ rotate: open ? 45 : 0 }}
        className="w-14 h-14 rounded-full bg-primary border-2 border-primary shadow-warm-lg flex items-center justify-center text-white hover:bg-primary-dark hover:border-primary-dark transition-colors"
      >
        <Plus size={24} weight="bold" aria-hidden="true" />
      </motion.button>
    </div>
  );
}
