import { motion } from 'framer-motion';
import { Plus } from '@phosphor-icons/react';

interface AddFabProps {
  onClick: () => void;
  /** Accessible + tooltip label, e.g. "Add trip", "Add to waitlist". */
  label: string;
}

// Mobile-only "+" floating action button for admin toolbars that have a
// single primary "Add X" action. Same reasoning as AdminEnquiriesFab (see
// that file): on a phone-width screen a full "Add X" button permanently
// costs a whole row above the actual list, where a FAB in the corner is
// the pattern people already expect and costs nothing until they need it.
//
// Desktop keeps the original inline button (hidden here via `sm:hidden`)
// — plenty of room there, and a FAB is a mobile convention.
//
// This is the single-action counterpart to AdminEnquiriesFab's speed-dial
// (Enquiries needs two actions — Add + Bulk — so it fans out; every other
// admin list here only ever has the one "Add" action, so a plain button
// is all that's needed, no expand/collapse state).
export default function AddFab({ onClick, label }: AddFabProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.92 }}
      className="sm:hidden fixed bottom-6 right-6 z-[45] w-14 h-14 rounded-full bg-primary border-2 border-primary shadow-warm-lg flex items-center justify-center text-white hover:bg-primary-dark hover:border-primary-dark transition-colors"
    >
      <Plus size={24} weight="bold" aria-hidden="true" />
    </motion.button>
  );
}
