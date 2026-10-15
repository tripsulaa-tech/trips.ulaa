import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Fire, ArrowRight, User, Lock, CheckCircle, Wallet } from '@phosphor-icons/react';
import Modal from './Modal';
import { formatPrice } from '../../utils/utils-index';
import type { EarlyBirdSeatsOffer } from './earlyBirdSeatsOffer';

/** Caption for the card strip: "Only 5 early-bird seats · first 5 to pay get this price",
 *  "3 of 5 early-bird seats left · pay to lock yours", or the last-seat variant. */
function earlyBirdSeatsCaption(total: number, left: number): string {
  if (left === 1) return 'Last early-bird seat! · first to pay gets it';
  if (left === total) return `Only ${total} exclusive Early-bird seats - first 5 payments win!`;
  return `${left} of ${total} early-bird seats left · pay to lock yours`;
}

/** Compact seat-tile strip for the trip card: same tiles as the banner, so
 *  the card and the banner read as one system. */
export function EarlyBirdSeatsStrip({ total, left }: { total: number; left: number }) {
  const shown = Math.min(total, 12);
  const shownTaken = Math.min(total - left, shown);
  return (
    <div className="early-bird-border flex flex-col items-center gap-2 rounded-lg px-3 py-2.5 mb-5">
      <div className="flex flex-wrap justify-center gap-1" aria-hidden="true">
        {Array.from({ length: shown }).map((_, i) => (
          <span
            key={i}
            className={`w-6 h-6 rounded-md flex items-center justify-center ${
              i < shownTaken ? 'bg-background-warm text-dark-muted/50' : 'bg-gradient-to-b from-orange-500 to-red-500 text-white'
            }`}
          >
            <User size={13} weight="fill" />
          </span>
        ))}
      </div>
      <p className={`text-2xs leading-tight font-bold text-center ${left === 1 ? 'text-red-700' : 'text-orange-900'}`}>
        {earlyBirdSeatsCaption(total, left)}
      </p>
    </div>
  );
}

interface EarlyBirdSeatsPromptProps {
  isOpen: boolean;
  offer: EarlyBirdSeatsOffer | null;
  tripTitle?: string;
  advanceAmount?: number | null;
  /** Visitor accepted the heads-up — carry on to the trip page. */
  onContinue: () => void;
  /** X / backdrop / Escape — closes the banner and stays on the list. */
  onClose: () => void;
}

// One tile per early-bird seat. Free seats glow in the brand colour; taken
// ones are greyed out, so scarcity is readable at a glance (no numbers needed).
function SeatTiles({ total, left }: { total: number; left: number }) {
  const taken = total - left;
  // Cap the row so a large seat limit (e.g. 20) still fits on one line.
  const shown = Math.min(total, 12);
  const shownTaken = Math.min(taken, shown);
  return (
    <div className="flex flex-wrap justify-center gap-1.5" aria-hidden="true">
      {Array.from({ length: shown }).map((_, i) => {
        const isTaken = i < shownTaken;
        return (
          <motion.span
            key={i}
            initial={{ opacity: 0, y: 8, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.15 + i * 0.05, type: 'spring', stiffness: 400, damping: 20 }}
            className={`w-9 h-9 rounded-lg flex items-center justify-center ${
              isTaken
                ? 'bg-background-warm text-dark-muted/50'
                : 'bg-gradient-to-b from-orange-500 to-red-500 text-white shadow-warm ring-2 ring-orange-200'
            }`}
          >
            <User size={18} weight="fill" />
          </motion.span>
        );
      })}
    </div>
  );
}

/** Small conversion-focused heads-up shown when someone clicks a trip card
 *  whose early-bird price is limited to the first N paid travellers. */
export default function EarlyBirdSeatsPrompt({ isOpen, offer, tripTitle, advanceAmount, onContinue, onClose }: EarlyBirdSeatsPromptProps) {
  if (!offer || typeof document === 'undefined') return null;
  const { totalSeats, seatsLeft, price, regularPrice } = offer;
  const saving = regularPrice != null ? regularPrice - price : 0;
  const hasAdvance = !!advanceAmount && advanceAmount > 0;
  const balance = hasAdvance ? Math.max(0, price - (advanceAmount as number)) : null;
  const isLast = seatsLeft === 1;
  const seatWord = seatsLeft === 1 ? 'seat' : 'seats';

  // Rendered into <body>: this lives inside a trip card, and the card's
  // transform/stacking context would otherwise let the sticky search bar and
  // navbar paint over the banner.
  return createPortal(
    <Modal isOpen={isOpen} onClose={onClose} size="sm" flush>
      <div>
        {/* Hero band */}
        <div className="offer-gradient-shift relative overflow-hidden px-5 sm:px-6 pt-8 pb-6 text-white text-center">
          <span className="pointer-events-none absolute -bottom-16 left-1/2 -translate-x-1/2 w-72 h-40 rounded-full bg-white/10 blur-2xl" />
          <span className="relative inline-flex items-center gap-1.5 rounded-full bg-white/20 ring-1 ring-inset ring-white/30 px-3 py-1 text-2xs font-button font-bold uppercase tracking-widest">
            <Fire size={13} weight="fill" className="text-yellow-300" />
            Early bird · Limited seats
          </span>
          <h3 className="relative mt-3 font-display text-2xl sm:text-[26px] font-bold leading-tight">
            Only the first {totalSeats} travellers<br className="hidden sm:block" /> get this price
          </h3>
          {tripTitle && (
            <p className="relative mt-1.5 text-xs text-white/95 line-clamp-1">{tripTitle}</p>
          )}
        </div>

        <div className="px-5 sm:px-6 pt-5 pb-5 sm:pb-6">
          {/* Seat tracker */}
          <div className="text-center">
            <SeatTiles total={totalSeats} left={seatsLeft} />
            <p className={`mt-2.5 text-sm font-button font-semibold ${isLast ? 'text-red-600' : 'text-dark'}`}>
              {isLast
                ? 'Last early-bird seat!'
                : seatsLeft === totalSeats
                  ? `All ${totalSeats} early-bird seats still open`
                  : `${seatsLeft} of ${totalSeats} early-bird ${seatWord} left`}
            </p>
          </div>

          {/* Price */}
          <div className="mt-4 rounded-xl bg-background border border-background-warm px-4 py-3.5 text-center">
            <div className="flex items-baseline justify-center gap-2.5 flex-wrap">
              <span className="font-display text-4xl font-bold text-primary leading-none">{formatPrice(price)}</span>
              {regularPrice != null && (
                <span className="text-base text-dark-muted line-through">{formatPrice(regularPrice)}</span>
              )}
              <span className="text-xs text-dark-muted">per person</span>
            </div>
            {saving > 0 && (
              <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-green-100 text-green-700 text-xs font-button font-bold px-2.5 py-1">
                You save {formatPrice(saving)}
              </span>
            )}
          </div>

          {/* How it works */}
          <ol className="mt-4 grid grid-cols-3 gap-2 text-center">
            <li className="flex flex-col items-center gap-1">
              <span className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center"><Wallet size={16} weight="fill" /></span>
              <span className="text-2xs leading-tight text-dark">
                Pay {hasAdvance ? <strong>{formatPrice(advanceAmount as number)}</strong> : 'a small'} advance
              </span>
            </li>
            <li className="flex flex-col items-center gap-1">
              <span className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center"><Lock size={16} weight="fill" /></span>
              <span className="text-2xs leading-tight text-dark">Seat locked at <strong>{formatPrice(price)}</strong></span>
            </li>
            <li className="flex flex-col items-center gap-1">
              <span className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center"><CheckCircle size={16} weight="fill" /></span>
              <span className="text-2xs leading-tight text-dark">
                {balance != null ? <>Balance <strong>{formatPrice(balance)}</strong> later</> : 'Pay the rest later'}
              </span>
            </li>
          </ol>

          {/* CTA */}
          <button
            type="button"
            onClick={onContinue}
            className="group/cta mt-5 w-full flex items-center justify-center gap-2 rounded-lg bg-primary hover:bg-primary-dark active:bg-primary-dark text-white font-button font-bold text-base min-h-[52px] px-5 shadow-warm-lg transition-colors"
          >
            Grab my early-bird seat
            <ArrowRight size={18} weight="bold" className="transition-transform group-hover/cta:translate-x-1" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="mt-2 w-full text-center text-xs font-button font-semibold text-dark-muted hover:text-dark py-2 transition-colors"
          >
            Not now
          </button>
        </div>
      </div>
    </Modal>,
    document.body
  );
}
