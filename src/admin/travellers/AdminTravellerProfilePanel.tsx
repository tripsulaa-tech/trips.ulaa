import { useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  X, CaretLeft, CaretRight, WhatsappLogo, Phone, Envelope as Mail, PencilSimple as Edit2,
  Siren, MapPin, Repeat, CalendarBlank, Users, ArrowUpRight, Copy, Warning,
} from '@phosphor-icons/react';
import FoodMark from '../../components/ui/FoodMark';
import { useToast } from '../../components/ui/useToast';
import { formatDate, formatPrice, getInitials, getWhatsAppLink } from '../../utils/utils-index';
import { SOURCE_CONFIG, listStatusBadge } from '../enquiries/AdminEnquiryCommon';
import type { TravellerContact } from './travellerContacts';
import { buildTravellerProfile, matchWaitlistEntries, WAITLIST_STATUS_LABEL } from './travellerProfile';
import type { ProfileTrip } from './travellerProfile';
import type { WaitlistEntry } from '../../types/types-index';

type WaitlistState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; entries: WaitlistEntry[] };

interface Props {
  contact: TravellerContact | null;
  // 1-based position within the (filtered) list, for "3 of 25".
  position: number;
  total: number;
  onPrev?: () => void;
  onNext?: () => void;
  onClose: () => void;
  onEdit: (contact: TravellerContact) => void;
  waitlist: WaitlistState;
  onRetryWaitlist: () => void;
}

const shortDate = (d: string) => formatDate(d, { month: 'short' });

function SectionHeading({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-baseline justify-between mb-3">
      <h3 className="font-display font-bold text-dark text-sm">{title}</h3>
      {count !== undefined && <span className="text-xs text-dark-muted tabular-nums">{count}</span>}
    </div>
  );
}

function Pill({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 text-2xs font-button font-semibold px-2 py-0.5 rounded-md whitespace-nowrap ${className}`}>
      {children}
    </span>
  );
}

function QuickAction({
  label, icon, href, onClick, primary = false,
}: { label: string; icon: ReactNode; href?: string; onClick?: () => void; primary?: boolean }) {
  const base = 'flex flex-col items-center justify-center gap-1 rounded-lg py-2.5 min-h-[56px] text-2xs font-button font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
  const tone = primary
    ? 'bg-primary text-white hover:bg-primary-dark'
    : 'bg-white border border-background-warm text-dark hover:border-primary/40 hover:text-primary';
  const disabled = 'opacity-40 pointer-events-none';
  if (!href && !onClick) {
    return <span aria-disabled="true" className={`${base} ${tone} ${disabled}`}>{icon}{label}</span>;
  }
  if (href) {
    const external = href.startsWith('http');
    return (
      <a href={href} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})} className={`${base} ${tone}`}>
        {icon}{label}
      </a>
    );
  }
  return <button type="button" onClick={onClick} className={`${base} ${tone}`}>{icon}{label}</button>;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const toast = useToast();
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      onClick={() => {
        navigator.clipboard?.writeText(value).then(
          () => toast.success(`${label} copied.`),
          () => toast.error('Could not copy.'),
        );
      }}
      className="p-1.5 -m-1 rounded text-dark-muted/60 hover:text-primary hover:bg-background transition-colors shrink-0"
    >
      <Copy size={14} aria-hidden="true" />
    </button>
  );
}

function ContactRow({ label, children, copy }: { label: string; children: ReactNode; copy?: { value: string; label: string } }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <dt className="w-24 shrink-0 text-xs text-dark-muted pt-0.5">{label}</dt>
      <dd className="flex-1 min-w-0 text-sm text-dark flex items-start justify-between gap-2">
        <span className="min-w-0 break-words">{children}</span>
        {copy && <CopyButton {...copy} />}
      </dd>
    </div>
  );
}

const OUTCOME_DOT: Record<ProfileTrip['outcome'], string> = {
  joined: 'bg-green-500',
  cancelled: 'bg-red-400',
  enquiry: 'bg-slate-300',
};

function TripItem({ trip }: { trip: ProfileTrip }) {
  const badge = listStatusBadge(trip.representative);
  const pct = trip.total > 0 ? Math.min(100, Math.round((trip.paid / trip.total) * 100)) : 0;
  const showMoney = trip.outcome === 'joined' || trip.paid > 0 || trip.total > 0;
  return (
    <li className="relative pl-6 pb-4 last:pb-0">
      {/* Rail dot — colour follows the outcome so the history scans at a glance. */}
      <span aria-hidden="true" className={`absolute left-0 top-[18px] -translate-x-1/2 w-3 h-3 rounded-full ring-4 ring-white ${OUTCOME_DOT[trip.outcome]}`} />
      <div className="rounded-lg border border-background-warm bg-white p-3.5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-dark leading-snug break-words min-w-0">{trip.title}</p>
          <Pill className={badge.color}>{badge.label}</Pill>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-dark-muted">
          {trip.departureDate && (
            <span className="inline-flex items-center gap-1"><CalendarBlank size={12} aria-hidden="true" /> {shortDate(trip.departureDate)}</span>
          )}
          <span className="inline-flex items-center gap-1">
            <Users size={12} aria-hidden="true" /> {trip.seats} {trip.seats === 1 ? 'seat' : 'seats'}
          </span>
          {trip.earlyBird && <Pill className="bg-amber-100 text-amber-800">Early bird</Pill>}
          {trip.child && <Pill className="bg-sky-100 text-sky-800">Child fare</Pill>}
        </div>

        {showMoney && trip.outcome !== 'cancelled' && (
          <div className="mt-3">
            {trip.outcome === 'joined' && trip.total > 0 && (
              <div
                role="progressbar"
                aria-label="Amount paid"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
                className="h-1.5 rounded-full bg-background-warm overflow-hidden"
              >
                <div className={`h-full rounded-full ${trip.balance > 0 ? 'bg-primary' : 'bg-green-500'}`} style={{ width: `${pct}%` }} />
              </div>
            )}
            <div className="mt-1.5 flex items-baseline justify-between gap-2 text-xs tabular-nums">
              <span className="text-dark-muted">
                {trip.outcome === 'joined'
                  ? <><span className="font-semibold text-dark">{formatPrice(trip.paid)}</span> paid of {formatPrice(trip.total)}</>
                  : <>Quoted {formatPrice(trip.total)}</>}
              </span>
              {trip.outcome === 'joined' && (
                trip.balance > 0
                  ? <span className="font-semibold text-amber-700">{formatPrice(trip.balance)} due</span>
                  : <span className="font-semibold text-green-700">Paid in full</span>
              )}
            </div>
          </div>
        )}

        {trip.outcome === 'cancelled' && (trip.paid > 0 || trip.refunded > 0) && (
          <p className="mt-2 text-xs text-dark-muted tabular-nums">
            {formatPrice(trip.paid)} paid{trip.refunded > 0 ? `, ${formatPrice(trip.refunded)} refunded` : ''}
          </p>
        )}

        <div className="mt-2.5 flex justify-end">
          <Link
            to={`/admin/enquiries/${trip.enquiryId}`}
            className="inline-flex items-center gap-1 text-xs font-button font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary rounded"
          >
            Open enquiry <ArrowUpRight size={12} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </li>
  );
}

/** Traveller profile — opens from the Contact Book when a name/row is
 *  clicked. A non-modal drawer on desktop (the table stays visible and
 *  clickable behind it, so clicking another row just swaps the profile) and a
 *  full-screen sheet on mobile. Everything except the waitlist is derived
 *  from the contact the page already holds — see travellerProfile.ts. */
export default function AdminTravellerProfilePanel({
  contact, position, total, onPrev, onNext, onClose, onEdit, waitlist, onRetryWaitlist,
}: Props) {
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);
  const isOpen = !!contact;

  // Remember what had focus (the row/name that was clicked) so Esc / close
  // hands it back, then move focus into the panel for keyboard + screen readers.
  useEffect(() => {
    if (!isOpen) return;
    returnFocusTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    const target = returnFocusTo.current;
    return () => { target?.focus?.(); };
  }, [isOpen]);

  // Esc closes — unless a real modal (Edit / Merge / confirm) is on top of
  // us, which should get the Esc instead.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('[aria-modal="true"]')) return;
      onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Full-screen sheet on phones: stop the page scrolling behind it.
  useEffect(() => {
    if (!isOpen || !window.matchMedia('(max-width: 639px)').matches) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  // New traveller → start at the top.
  const key = contact?.key;
  useEffect(() => { bodyRef.current?.scrollTo({ top: 0 }); }, [key]);

  const profile = useMemo(() => (contact ? buildTravellerProfile(contact) : null), [contact]);
  const waitlistMatches = useMemo(
    () => (contact && waitlist.status === 'ready' ? matchWaitlistEntries(contact, waitlist.entries) : []),
    [contact, waitlist],
  );

  const transition = reduceMotion ? { duration: 0 } : { type: 'tween' as const, duration: 0.22, ease: [0.32, 0.72, 0, 1] as [number, number, number, number] };

  return (
    <AnimatePresence>
      {contact && profile && (
        <motion.aside
          ref={panelRef}
          role="dialog"
          aria-label={`${contact.fullName}'s profile`}
          tabIndex={-1}
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={transition}
          className="fixed inset-y-0 right-0 z-40 w-full sm:w-[460px] bg-white border-l border-background-warm shadow-warm-lg flex flex-col outline-none"
        >
          {/* Top bar: prev/next through the current list, edit, close. */}
          <div className="flex items-center justify-between gap-2 px-3 sm:px-4 h-14 border-b border-background-warm flex-shrink-0 pt-[env(safe-area-inset-top)] box-content">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onPrev}
                disabled={!onPrev}
                aria-label="Previous traveller"
                className="p-2.5 rounded-full text-dark-muted hover:bg-background hover:text-dark transition-colors disabled:opacity-30 disabled:pointer-events-none"
              >
                <CaretLeft size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={onNext}
                disabled={!onNext}
                aria-label="Next traveller"
                className="p-2.5 rounded-full text-dark-muted hover:bg-background hover:text-dark transition-colors disabled:opacity-30 disabled:pointer-events-none"
              >
                <CaretRight size={18} aria-hidden="true" />
              </button>
              {position > 0 && (
                <span className="ml-1 text-xs text-dark-muted tabular-nums" aria-live="polite">{position} of {total}</span>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close profile"
              className="p-2.5 rounded-full text-dark-muted hover:bg-background hover:text-dark transition-colors"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          <div ref={bodyRef} className="flex-1 min-h-0 overflow-y-auto app-scroll">
            <div className="px-5 pt-5 pb-8 space-y-6">
              {/* Header */}
              <header>
                <div className="flex items-center gap-3.5">
                  <div className="w-14 h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center font-display font-bold text-lg flex-shrink-0">
                    {getInitials(contact.fullName, '?')}
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-display font-bold text-xl text-dark leading-tight break-words">{contact.fullName}</h2>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-dark-muted">
                      {contact.city && (
                        <span className="inline-flex items-center gap-1"><MapPin size={12} aria-hidden="true" /> {contact.city}</span>
                      )}
                      {profile.isRepeat && (
                        <Pill className="bg-primary/10 text-primary"><Repeat size={10} aria-hidden="true" /> Repeat traveller</Pill>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-4 gap-2">
                  <QuickAction primary label="WhatsApp" icon={<WhatsappLogo size={18} weight="fill" aria-hidden="true" />} href={contact.phone ? getWhatsAppLink(contact.phone) : undefined} />
                  <QuickAction label="Call" icon={<Phone size={18} aria-hidden="true" />} href={contact.phone ? `tel:${contact.phone.replace(/[^\d+]/g, '')}` : undefined} />
                  <QuickAction label="Email" icon={<Mail size={18} aria-hidden="true" />} href={contact.email ? `mailto:${contact.email}` : undefined} />
                  <QuickAction label="Edit" icon={<Edit2 size={18} aria-hidden="true" />} onClick={() => onEdit(contact)} />
                </div>
              </header>

              {/* Summary */}
              <section aria-label="Summary">
                <dl className="grid grid-cols-2 sm:grid-cols-4 rounded-lg bg-background-warm/60 border border-background-warm divide-x divide-y sm:divide-y-0 divide-background-warm overflow-hidden">
                  <div className="px-3.5 py-3">
                    <dt className="text-2xs text-dark-muted">Trips joined</dt>
                    <dd className="mt-0.5 text-base font-semibold text-dark tabular-nums">{profile.summary.tripsJoined}</dd>
                  </div>
                  <div className="px-3.5 py-3">
                    <dt className="text-2xs text-dark-muted">Total paid</dt>
                    <dd className="mt-0.5 text-base font-semibold text-dark tabular-nums">{formatPrice(profile.summary.totalPaid)}</dd>
                  </div>
                  <div className="px-3.5 py-3">
                    <dt className="text-2xs text-dark-muted">Balance due</dt>
                    <dd className={`mt-0.5 text-base font-semibold tabular-nums ${profile.summary.balanceDue > 0 ? 'text-amber-700' : 'text-dark'}`}>
                      {formatPrice(profile.summary.balanceDue)}
                    </dd>
                  </div>
                  <div className="px-3.5 py-3">
                    <dt className="text-2xs text-dark-muted">First enquiry</dt>
                    <dd
                      className="mt-0.5 text-base font-semibold text-dark whitespace-nowrap"
                      title={formatDate(profile.summary.firstEnquiryAt)}
                    >
                      {formatDate(profile.summary.firstEnquiryAt, { day: undefined, month: 'short' })}
                    </dd>
                  </div>
                </dl>
                {(profile.summary.notConverted > 0 || profile.summary.cancelled > 0) && (
                  <p className="mt-2 text-xs text-dark-muted">
                    {[
                      profile.summary.notConverted > 0 && `${profile.summary.notConverted} ${profile.summary.notConverted === 1 ? 'enquiry' : 'enquiries'} never converted`,
                      profile.summary.cancelled > 0 && `${profile.summary.cancelled} cancelled`,
                    ].filter(Boolean).join(', ')}.
                  </p>
                )}
              </section>

              {/* Contact */}
              <section aria-label="Contact details">
                <SectionHeading title="Contact" />
                <dl className="divide-y divide-background-warm border-y border-background-warm">
                  <ContactRow label="Phone" copy={contact.phone ? { value: contact.phone, label: 'Phone number' } : undefined}>
                    {contact.phone || <span className="text-dark-muted/60">Not on file</span>}
                  </ContactRow>
                  {contact.phones.slice(1).map(ph => (
                    <ContactRow key={ph} label="Emergency" copy={{ value: ph, label: 'Emergency number' }}>
                      <span className="inline-flex items-center gap-1.5">
                        <Siren size={13} weight="fill" className="text-red-500 shrink-0" aria-hidden="true" /> {ph}
                      </span>
                    </ContactRow>
                  ))}
                  <ContactRow label="Email" copy={contact.email ? { value: contact.email, label: 'Email' } : undefined}>
                    {contact.email ? <span className="break-all">{contact.email}</span> : <span className="text-dark-muted/60">Not on file</span>}
                  </ContactRow>
                </dl>
                {/* Secondary facts as a compact three-up row, so the trip
                    history starts higher on screen. */}
                <dl className="mt-3 grid grid-cols-3 gap-3">
                  <div>
                    <dt className="text-2xs text-dark-muted">Age</dt>
                    <dd className="mt-0.5 text-sm text-dark">{profile.age ?? <span className="text-dark-muted/60">Not on file</span>}</dd>
                  </div>
                  <div>
                    <dt className="text-2xs text-dark-muted">Food</dt>
                    <dd className="mt-0.5 text-sm text-dark">
                      {profile.food ? (
                        <span className="inline-flex items-center gap-1.5">
                          <FoodMark type={profile.food} size={12} /> {profile.food === 'veg' ? 'Veg' : 'Non-veg'}
                        </span>
                      ) : <span className="text-dark-muted/60">Not on file</span>}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-2xs text-dark-muted">First source</dt>
                    <dd className="mt-0.5 text-sm text-dark">
                      {profile.firstSource ? (SOURCE_CONFIG[profile.firstSource]?.label ?? profile.firstSource) : <span className="text-dark-muted/60">Not on file</span>}
                    </dd>
                  </div>
                </dl>
              </section>

              {/* Trip timeline */}
              <section aria-label="Trip history">
                <SectionHeading title="Trips" count={profile.trips.length} />
                {profile.trips.length === 0 ? (
                  <p className="text-sm text-dark-muted">No trips on file for this traveller.</p>
                ) : (
                  <ol className="relative ml-1.5 border-l-2 border-background-warm">
                    {profile.trips.map(trip => <TripItem key={trip.key} trip={trip} />)}
                  </ol>
                )}
              </section>

              {/* Waitlist */}
              <section aria-label="Waitlist history">
                <SectionHeading title="Waitlist" count={waitlist.status === 'ready' ? waitlistMatches.length : undefined} />
                {(waitlist.status === 'idle' || waitlist.status === 'loading') && (
                  <div className="space-y-2" aria-busy="true" aria-label="Loading waitlist">
                    <div className="h-12 rounded-lg bg-background-warm/60 animate-pulse" />
                  </div>
                )}
                {waitlist.status === 'error' && (
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-amber-50 border border-amber-200 px-3.5 py-3 text-sm text-amber-900">
                    <span className="inline-flex items-center gap-2"><Warning size={16} aria-hidden="true" /> Couldn&apos;t load the waitlist.</span>
                    <button type="button" onClick={onRetryWaitlist} className="font-button font-semibold text-xs text-primary hover:underline">Try again</button>
                  </div>
                )}
                {waitlist.status === 'ready' && waitlistMatches.length === 0 && (
                  <p className="text-sm text-dark-muted">Never joined a waitlist with this phone number.</p>
                )}
                {waitlist.status === 'ready' && waitlistMatches.length > 0 && (
                  <ul className="space-y-2">
                    {waitlistMatches.map(({ entry, asName }) => {
                      const st = WAITLIST_STATUS_LABEL[entry.status] ?? WAITLIST_STATUS_LABEL.waiting;
                      return (
                        <li key={entry.id} className="rounded-lg border border-background-warm p-3.5">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-semibold text-dark leading-snug break-words min-w-0">{entry.trip_title || 'Trip no longer listed'}</p>
                            <Pill className={st.color}>{st.label}</Pill>
                          </div>
                          <p className="mt-1.5 text-xs text-dark-muted">
                            Joined {shortDate(entry.created_at)}
                            {entry.group_size && entry.group_size > 1 ? `, group of ${entry.group_size}` : ''}
                          </p>
                          {asName && <p className="mt-1 text-xs text-dark-muted">Signed up as {asName}</p>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
