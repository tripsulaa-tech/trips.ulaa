import type { ReactNode } from 'react';
import Modal from './Modal';

// The full screen stage every game plays on: dark gradient, a close button top
// right, content centred (a phone-width column that widens on tablets and desktops).
// Pages that open from a shared link use this so the invite lands straight in the
// game, with no site header or footer around it.
export default function FullScreenGame({ ariaLabel, onClose, children }: { ariaLabel: string; onClose: () => void; children: ReactNode }) {
  return (
    <Modal isOpen onClose={onClose} ariaLabel={ariaLabel} size="sm" flush fullScreen>
      <div className="[-webkit-tap-highlight-color:transparent] touch-manipulation relative overflow-hidden bg-gradient-to-b from-dark via-footer to-[#1B130E] text-cream px-4 pt-[max(4rem,calc(env(safe-area-inset-top)+3.5rem))] pb-[max(1.5rem,env(safe-area-inset-bottom))] min-h-[100dvh] flex justify-center items-center md:py-10">
        <div className="relative w-full max-w-md md:max-w-xl flex flex-col">
          <span className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-72 rounded-full bg-primary/35 blur-3xl pointer-events-none" aria-hidden="true" />
          <span className="absolute -top-10 -right-16 w-56 h-56 rounded-full bg-gold/20 blur-3xl pointer-events-none" aria-hidden="true" />
          {children}
        </div>
      </div>
    </Modal>
  );
}
