import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { motion } from 'framer-motion';
import { CheckCircle, AlertCircle, FileText, User, Users, Utensils, Clock3 } from 'lucide-react';
import type { BookingFormData, BookingMode } from '../../types/types-index';
import { submitEnquiry, submitGroupEnquiry, submitWaitlist, getTripSeatSnapshot } from '../../services/api';
import { DEFAULT_TERMS_AND_CONDITIONS } from '../../constants/terms';
import { parseTerms } from '../../utils/parseTerms';
import { validateFullName, validateCity, validatePhone, validateOptionalPhone, validateAge, DEFAULT_MIN_AGE, DEFAULT_MAX_AGE } from '../../utils/formValidation';
import Button from './Button';
import Modal from './Modal';
import TermsBlocks from './TermsBlocks';

// Group bookings top out at this many seats in one submission — beyond
// that it's a phone/WhatsApp conversation, not a self-serve form.
const MIN_GROUP_SIZE = 2;
const MAX_GROUP_SIZE = 15;

interface BookingFormProps {
  tripId?: string;
  tripTitle?: string;
  terms?: string;
  onSuccess?: () => void;
  // How many seats are actually left on the trip right now. Both Solo and
  // Group stay selectable regardless of this number — if what's requested
  // (1 seat for Solo, N for Group) doesn't fit, submit silently routes to
  // the waitlist instead of an enquiry, using the exact same fields, so
  // there's no separate "not enough seats" dead end in the UI. Optional so
  // existing callers that don't pass it still work (falls back to always
  // treating this as a normal booking).
  remainingSeats?: number;
  // Trip-specific age eligibility, set by the admin on this trip (Admin →
  // Trips → Basic Info). Either side can be left unset by the admin (no
  // restriction on that side) or omitted entirely by the caller — in both
  // cases validateAge falls back to the app's default 18-65 range. See
  // src/utils/formValidation.ts.
  minAge?: number | null;
  maxAge?: number | null;
}

export default function BookingForm({ tripId, tripTitle, terms, onSuccess, remainingSeats, minAge, maxAge }: BookingFormProps) {
  // Shared id prefix so every label/input pair below has a stable,
  // unique-per-instance id — needed for htmlFor/aria-describedby wiring,
  // and unique in case this form is ever mounted more than once at a time.
  const uid = useId();
  const ids = {
    bookingType: `${uid}-booking-type`,
    groupSize: `${uid}-group-size`,
    fullName: `${uid}-full-name`,
    age: `${uid}-age`,
    phone: `${uid}-phone`,
    email: `${uid}-email`,
    city: `${uid}-city`,
    emergencyContact: `${uid}-emergency-contact`,
    foodPreference: `${uid}-food-preference`,
    vegCount: `${uid}-veg-count`,
    message: `${uid}-message`,
  };
  const effectiveMinAge = minAge ?? DEFAULT_MIN_AGE;
  const effectiveMaxAge = maxAge ?? DEFAULT_MAX_AGE;
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [termsOpen, setTermsOpen] = useState(false);
  const [bookingMode, setBookingMode] = useState<BookingMode>('solo');
  const [groupSize, setGroupSize] = useState(MIN_GROUP_SIZE);
  // Raw text the user is typing into the "Number of People" input. Kept
  // separate from the numeric groupSize so the field can be emptied out
  // (e.g. via backspace) while the user is mid-edit, instead of snapping
  // back to a number on every keystroke. Reconciled into groupSize on blur.
  const [groupSizeInput, setGroupSizeInput] = useState(String(MIN_GROUP_SIZE));
  const [groupSizeError, setGroupSizeError] = useState('');
  const [successCount, setSuccessCount] = useState(1);
  // Which path the most recent successful submission actually took —
  // drives the wording on the success screen (enquiry vs waitlist).
  const [submittedAsWaitlist, setSubmittedAsWaitlist] = useState(false);
  // True when the waitlist path was reached because the DB's live capacity
  // check rejected what looked (from this form's stale seats-left number)
  // like a fitting enquiry — i.e. the exact race this component's
  // remainingSeats prop can't fully close on its own. Drives a distinct,
  // more specific success message than the ordinary "didn't fit" waitlist
  // path below.
  const [justMissedSeats, setJustMissedSeats] = useState(false);
  // Not react-hook-form fields (kept alongside bookingMode/groupSize as
  // separate choices, same pattern as Solo/Group above).
  // Solo: one shared preference, same as full_name/phone/etc.
  const [foodPreference, setFoodPreference] = useState<'veg' | 'non_veg' | null>(null);
  const [foodPreferenceError, setFoodPreferenceError] = useState('');
  // Group: a group can be a mix, so this collects how many of the
  // groupSize seats are veg — the rest are treated as non-veg. Clamped to
  // [0, groupSize] whenever groupSize changes (see the Number of People
  // input below).
  const [groupVegCount, setGroupVegCount] = useState(MIN_GROUP_SIZE);
  // Raw text for the veg-count input — same reasoning as groupSizeInput
  // above. Kept in sync with groupVegCount whenever it changes elsewhere
  // (e.g. clamped down when groupSize shrinks) via the effect below.
  const [vegCountInput, setVegCountInput] = useState(String(MIN_GROUP_SIZE));

  // Whether what's currently selected/entered actually fits in the seats
  // left. When it doesn't, submitting still succeeds — it just becomes a
  // waitlist signup instead of an enquiry (see onSubmit below). Undefined
  // remainingSeats (caller didn't pass it) always means "treat as fits".
  const soloFits = remainingSeats === undefined || remainingSeats >= 1;
  const groupFits = remainingSeats === undefined || groupSize <= remainingSeats;
  const willWaitlist = bookingMode === 'solo' ? !soloFits : !groupFits;

  // Keeps the veg-count text field's displayed value in sync whenever
  // groupVegCount is changed programmatically elsewhere (clamped down when
  // groupSize shrinks, reset after a successful submit, etc.) rather than
  // by the user typing directly into this field. Adjusted during render
  // (rather than in an effect) to avoid an extra cascading render.
  const [prevVegSyncKey, setPrevVegSyncKey] = useState(`${groupVegCount}:${groupSize}`);
  const vegSyncKey = `${groupVegCount}:${groupSize}`;
  if (vegSyncKey !== prevVegSyncKey) {
    setPrevVegSyncKey(vegSyncKey);
    setVegCountInput(String(Math.min(groupVegCount, groupSize)));
  }

  const termsText = (terms || '').trim() || DEFAULT_TERMS_AND_CONDITIONS;
  const termsSections = useMemo(() => parseTerms(termsText), [termsText]);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollBodyRef = useRef<HTMLDivElement>(null);
  const chipBarRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [activeSectionNum, setActiveSectionNum] = useState<string | null>(null);
  // Falls back to the first section before the observer below has fired
  // (e.g. right when the modal opens), without needing its own effect.
  const displayedActiveNum = activeSectionNum ?? termsSections[0]?.number ?? null;

  // Highlight whichever chip's section is currently at the top of the
  // modal's own scroll box (not the page) — same live-highlight behavior
  // as the other quick-jump tab bars in the app.
  useEffect(() => {
    if (!termsOpen) return;
    const root = scrollBodyRef.current;
    if (!root) return;
    const sections = termsSections
      .map(s => sectionRefs.current[s.number])
      .filter((el): el is HTMLDivElement => el !== null);
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      entries => {
        const visible = entries.filter(e => e.isIntersecting);
        if (visible.length === 0) return;
        const topMost = visible.reduce((a, b) => (a.boundingClientRect.top <= b.boundingClientRect.top ? a : b));
        const num = Object.keys(sectionRefs.current).find(key => sectionRefs.current[key] === topMost.target);
        if (num) setActiveSectionNum(num);
      },
      { root, rootMargin: '0px 0px -70% 0px', threshold: 0 }
    );
    sections.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [termsOpen, termsSections]);

  // Keeps the active chip scrolled into view horizontally — scrollLeft only,
  // so it never touches the vertical scroll of the policy text below it.
  useEffect(() => {
    const bar = chipBarRef.current;
    const chip = displayedActiveNum ? chipRefs.current[displayedActiveNum] : null;
    if (!bar || !chip) return;
    const target = chip.offsetLeft - bar.clientWidth / 2 + chip.clientWidth / 2;
    bar.scrollTo({ left: target, behavior: 'smooth' });
  }, [displayedActiveNum]);

  const handleChipSelect = (num: string) => {
    setActiveSectionNum(num);
    sectionRefs.current[num]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<BookingFormData>({
    // Default is 'onSubmit', which only runs validation (and shows errors)
    // after the first Save attempt. 'onChange' validates on every keystroke
    // instead, so a bad phone/email/name shows its error message live as
    // the user types rather than only surfacing on save.
    mode: 'onChange',
  });

  const onSubmit = async (data: BookingFormData) => {
    // Trim all text fields to strip accidental leading/trailing whitespace
    // before submission — the DB's unique index already normalises with
    // lower(trim()), but storing untrimmed values would mean a second
    // identical submission (same name/phone with a trailing space) bypasses
    // the duplicate check. Trimming here aligns what's stored with what the
    // index sees.
    const d: BookingFormData = {
      ...data,
      full_name: data.full_name.trim(),
      phone: data.phone.trim(),
      email: data.email.trim(),
      city: (data.city ?? '').trim(),
      emergency_contact: (data.emergency_contact ?? '').trim(),
      message: data.message?.trim(),
    };
    if (bookingMode === 'group') {
      if (!Number.isInteger(groupSize) || groupSize < MIN_GROUP_SIZE || groupSize > MAX_GROUP_SIZE) {
        setGroupSizeError(`Enter a number of people between ${MIN_GROUP_SIZE} and ${MAX_GROUP_SIZE}.`);
        return;
      }
    }
    setGroupSizeError('');

    const groupVegCountClamped = Math.min(Math.max(groupVegCount, 0), groupSize);
    if (bookingMode === 'solo' && !foodPreference) {
      setFoodPreferenceError('Please let us know your food preference.');
      return;
    }
    setFoodPreferenceError('');

    try {
      setStatus('loading');
      setJustMissedSeats(false);

      // remainingSeats (the prop) reflects whatever was true when the trip
      // page loaded — it goes stale the moment seats fill up while this
      // form is still open. Re-fetch the trip's live seat numbers right
      // before deciding enquiry-vs-waitlist so that decision uses current
      // data instead of a snapshot from page load. Falls back to the prop
      // if the fetch fails for any reason, rather than blocking submission.
      let liveRemaining = remainingSeats;
      if (tripId) {
        const snapshot = await getTripSeatSnapshot(tripId);
        if (snapshot) {
          liveRemaining = snapshot.totalSeats == null
            ? undefined
            : Math.max(0, snapshot.totalSeats - snapshot.seatsBooked - snapshot.waitlistReserved);
        }
      }
      const soloFitsLive = liveRemaining === undefined || liveRemaining >= 1;
      const groupFitsLive = liveRemaining === undefined || groupSize <= liveRemaining;

      if (bookingMode === 'group') {
        const foodPreferences: ('veg' | 'non_veg')[] = [
          ...Array(groupVegCountClamped).fill('veg'),
          ...Array(groupSize - groupVegCountClamped).fill('non_veg'),
        ];
        // Doesn't fit in what's left — one waitlist row for the whole group
        // (group_size on the row), not one enquiry per seat. The veg/non-veg
        // split isn't stored as structured data on a single row, so it's
        // folded into the message for whoever follows up.
        const foodNote = `${groupVegCountClamped} veg / ${groupSize - groupVegCountClamped} non-veg.`;
        const waitlistPayload = {
          full_name: d.full_name,
          phone: d.phone,
          email: d.email,
          age: d.age,
          city: d.city,
          emergency_contact: d.emergency_contact,
          message: d.message ? `${foodNote} ${d.message}` : foodNote,
          trip_id: tripId!,
          trip_title: tripTitle,
          group_size: groupSize,
        };

        if (groupFitsLive) {
          try {
            await submitGroupEnquiry({ ...d, trip_id: tripId, trip_title: tripTitle }, groupSize, foodPreferences);
            setSubmittedAsWaitlist(false);
          } catch (err) {
            // The DB's own capacity check — the hard backstop behind the
            // live re-check above — says these seats are actually gone.
            // Fall back to the waitlist instead of failing outright.
            if (err instanceof Error && err.message === 'SEATS_UNAVAILABLE') {
              await submitWaitlist(waitlistPayload);
              setSubmittedAsWaitlist(true);
              setJustMissedSeats(true);
            } else {
              throw err;
            }
          }
        } else {
          await submitWaitlist(waitlistPayload);
          setSubmittedAsWaitlist(true);
        }
        setSuccessCount(groupSize);
      } else {
        const waitlistPayload = {
          full_name: d.full_name,
          phone: d.phone,
          email: d.email,
          age: d.age,
          city: d.city,
          emergency_contact: d.emergency_contact,
          food_preference: foodPreference,
          message: d.message,
          trip_id: tripId!,
          trip_title: tripTitle,
          group_size: null,
        };

        if (soloFitsLive) {
          try {
            await submitEnquiry({ ...d, food_preference: foodPreference as 'veg' | 'non_veg', trip_id: tripId, trip_title: tripTitle });
            setSubmittedAsWaitlist(false);
          } catch (err) {
            if (err instanceof Error && err.message === 'SEATS_UNAVAILABLE') {
              await submitWaitlist(waitlistPayload);
              setSubmittedAsWaitlist(true);
              setJustMissedSeats(true);
            } else {
              throw err;
            }
          }
        } else {
          await submitWaitlist(waitlistPayload);
          setSubmittedAsWaitlist(true);
        }
        setSuccessCount(1);
      }
      setStatus('success');
      reset();
      setBookingMode('solo');
      setGroupSize(MIN_GROUP_SIZE);
      setGroupSizeInput(String(MIN_GROUP_SIZE));
      setGroupVegCount(MIN_GROUP_SIZE);
      setFoodPreference(null);
      onSuccess?.();
    } catch (err) {
      setStatus('error');
      if (err instanceof Error && err.message === 'DUPLICATE_ENQUIRY') {
        setErrorMsg("Looks like you've already submitted an enquiry for this trip with these exact details. We'll be in touch shortly — or message us on WhatsApp if you need to change something.");
      } else if (err instanceof Error && err.message === 'DUPLICATE_WAITLIST_ENTRY') {
        setErrorMsg("You're already on the waitlist for this trip with these exact details — we'll reach out the moment enough seats open up.");
      } else if (err instanceof Error && err.message === 'AGE_NOT_ELIGIBLE') {
        setErrorMsg(`This trip is only open to ages ${effectiveMinAge}–${effectiveMaxAge}. Please double-check the age entered, or message us on WhatsApp if you have questions.`);
      } else if (err instanceof Error && err.message === 'SEATS_UNAVAILABLE') {
        setErrorMsg("Seats for this trip just sold out while you were booking. Please refresh the page and try again — you'll be offered the waitlist instead.");
      } else {
        // Log whatever we actually got so the real DB rejection reason
        // (visible here even though the UI keeps a friendly generic message)
        // isn't lost — check this in devtools console when debugging a 400.
        console.error('BookingForm submit failed:', err);
        setErrorMsg('Something went wrong. Please try again or contact us on WhatsApp.');
      }
    }
  };

  if (status === 'success') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        role="status"
        aria-live="polite"
        className="text-center py-12"
      >
        <CheckCircle size={64} className="text-green-500 mx-auto mb-4" aria-hidden="true" />
        <h3 className="font-display text-2xl font-bold text-dark mb-2">
          {submittedAsWaitlist ? "You're on the list!" : 'Enquiry Received!'}
        </h3>
        <p className="text-dark-muted">
          {justMissedSeats
            ? (successCount > 1
                ? `Seats for this trip just sold out as you were booking — no worries, we've added your group of ${successCount} to the waitlist and will message and email you the moment seats free up together.`
                : "A seat for this trip just sold out as you were booking — no worries, we've added you to the waitlist and will message and email you the moment one frees up.")
            : submittedAsWaitlist
            ? (successCount > 1
                ? `We'll message and email you the moment ${successCount} seats free up together on this trip.`
                : "We'll message and email you the moment a seat frees up on this trip.")
            : (successCount > 1
                ? `Thank you! We've logged your group of ${successCount} and will contact you shortly to confirm your spots.`
                : "Thank you! We'll contact you shortly to confirm your spot.")}
        </p>
      </motion.div>
    );
  }

  const inputClass = `
    w-full px-4 py-3 rounded-lg border-2 bg-background
    font-body text-dark placeholder-dark-muted/50
    transition-all duration-200 outline-none
    focus:border-primary focus:bg-white
    border-background-warm
  `;

  const errorClass = 'text-red-500 text-xs mt-1';

  return (
    <>
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {tripTitle && (
        <div className="bg-background-warm rounded-lg px-4 py-3 mb-2">
          <p className="text-sm text-dark-muted">
            Booking for: <span className="font-semibold text-dark">{tripTitle}</span>
          </p>
        </div>
      )}

      {/* Solo vs Group booking */}
      <div>
        <label id={ids.bookingType} className="block text-sm font-medium text-dark mb-1">Booking Type</label>
        <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby={ids.bookingType}>
          <button
            type="button"
            onClick={() => setBookingMode('solo')}
            aria-pressed={bookingMode === 'solo'}
            className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 font-medium text-sm transition-colors ${
              bookingMode === 'solo'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-background-warm text-dark-muted hover:border-primary/40'
            }`}
          >
            <User size={16} aria-hidden="true" /> Solo
          </button>
          <button
            type="button"
            onClick={() => setBookingMode('group')}
            aria-pressed={bookingMode === 'group'}
            className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 font-medium text-sm transition-colors ${
              bookingMode === 'group'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-background-warm text-dark-muted hover:border-primary/40'
            }`}
          >
            <Users size={16} aria-hidden="true" /> Group
          </button>
        </div>
        {bookingMode === 'solo' && !soloFits && (
          <p className="flex items-start gap-1.5 text-xs text-dark-muted mt-1">
            <Clock3 size={13} className="text-primary shrink-0 mt-0.5" aria-hidden="true" />
            This trip is full right now — submitting will add you to the waitlist instead, and
            we'll notify you the moment a seat opens up.
          </p>
        )}
      </div>

      {bookingMode === 'group' && (
        <div>
          <label htmlFor={ids.groupSize} className="block text-sm font-medium text-dark mb-1">Number of People *</label>
          <input
            id={ids.groupSize}
            type="number"
            inputMode="numeric"
            min={MIN_GROUP_SIZE}
            max={MAX_GROUP_SIZE}
            aria-invalid={!!groupSizeError}
            aria-describedby={groupSizeError ? `${ids.groupSize}-error` : `${ids.groupSize}-hint`}
            value={groupSizeInput}
            onChange={e => {
              setGroupSizeError('');
              const raw = e.target.value;
              // Let the field be empty or mid-edit (e.g. after backspace)
              // without immediately forcing it back to a number — only
              // commit a numeric groupSize once we have real digits.
              setGroupSizeInput(raw);
              if (raw !== '' && !Number.isNaN(Number(raw))) {
                const val = Math.round(Number(raw));
                setGroupSize(val);
                setGroupVegCount(prev => Math.min(prev, val));
              }
            }}
            onBlur={() => {
              const parsed = Math.round(Number(groupSizeInput));
              const clamped = groupSizeInput === '' || Number.isNaN(parsed)
                ? MIN_GROUP_SIZE
                : Math.min(Math.max(parsed, MIN_GROUP_SIZE), MAX_GROUP_SIZE);
              setGroupSize(clamped);
              setGroupSizeInput(String(clamped));
              setGroupVegCount(prev => Math.min(prev, clamped));
            }}
            className={inputClass}
          />
          {groupFits ? (
            <p id={`${ids.groupSize}-hint`} className="text-xs text-dark-muted mt-1">
              We'll create one entry per person under this name and contact — {groupSize} {groupSize === 1 ? 'entry' : 'entries'} in total.
            </p>
          ) : (
            <p id={`${ids.groupSize}-hint`} className="flex items-start gap-1.5 text-xs text-dark-muted mt-1">
              <Clock3 size={13} className="text-primary shrink-0 mt-0.5" aria-hidden="true" />
              Only {remainingSeats} seat{remainingSeats === 1 ? '' : 's'} left right now — not enough for {groupSize}. Submitting will add your group to the waitlist instead, and we'll notify you the moment {groupSize} seats are free together.
            </p>
          )}
          {groupSizeError && <p id={`${ids.groupSize}-error`} role="alert" className={errorClass}>{groupSizeError}</p>}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Full Name */}
        <div>
          <label htmlFor={ids.fullName} className="block text-sm font-medium text-dark mb-1">Full Name *</label>
          <input
            id={ids.fullName}
            {...register('full_name', { required: 'Full name is required', validate: validateFullName })}
            placeholder="Your full name"
            autoComplete="name"
            aria-invalid={!!errors.full_name}
            aria-describedby={errors.full_name ? `${ids.fullName}-error` : undefined}
            className={inputClass}
          />
          {errors.full_name && <p id={`${ids.fullName}-error`} role="alert" className={errorClass}>{errors.full_name.message}</p>}
        </div>

        {/* Age */}
        <div>
          <label htmlFor={ids.age} className="block text-sm font-medium text-dark mb-1">Age *</label>
          <input
            id={ids.age}
            type="number"
            inputMode="numeric"
            maxLength={3}
            {...register('age', {
              required: 'Age is required',
              validate: value => validateAge(value, effectiveMinAge, effectiveMaxAge),
            })}
            placeholder="Your age"
            autoComplete="off"
            aria-invalid={!!errors.age}
            aria-describedby={errors.age ? `${ids.age}-error` : `${ids.age}-hint`}
            className={inputClass}
          />
          {!errors.age && (
            <p id={`${ids.age}-hint`} className="text-xs text-dark-muted mt-1">
              This trip is open to ages {effectiveMinAge}–{effectiveMaxAge}.
            </p>
          )}
          {errors.age && <p id={`${ids.age}-error`} role="alert" className={errorClass}>{errors.age.message}</p>}
        </div>

        {/* Phone */}
        <div>
          <label htmlFor={ids.phone} className="block text-sm font-medium text-dark mb-1">Phone Number *</label>
          <input
            id={ids.phone}
            type="tel"
            inputMode="tel"
            {...register('phone', { required: 'Phone number is required', validate: validatePhone })}
            placeholder="+91 63813 36772"
            autoComplete="tel"
            aria-invalid={!!errors.phone}
            aria-describedby={errors.phone ? `${ids.phone}-error` : undefined}
            className={inputClass}
          />
          {errors.phone && <p id={`${ids.phone}-error`} role="alert" className={errorClass}>{errors.phone.message}</p>}
        </div>

        {/* Email */}
        <div>
          <label htmlFor={ids.email} className="block text-sm font-medium text-dark mb-1">Email *</label>
          <input
            id={ids.email}
            type="email"
            {...register('email', {
              required: 'Email is required',
              pattern: { value: /^\S+@\S+\.\S+$/, message: 'Invalid email address' },
            })}
            placeholder="you@example.com"
            autoComplete="email"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? `${ids.email}-error` : undefined}
            className={inputClass}
          />
          {errors.email && <p id={`${ids.email}-error`} role="alert" className={errorClass}>{errors.email.message}</p>}
        </div>

        {/* City */}
        <div>
          <label htmlFor={ids.city} className="block text-sm font-medium text-dark mb-1">City</label>
          <input
            id={ids.city}
            {...register('city', { validate: validateCity })}
            placeholder="Your city"
            autoComplete="address-level2"
            aria-invalid={!!errors.city}
            aria-describedby={errors.city ? `${ids.city}-error` : undefined}
            className={inputClass}
          />
          {errors.city && <p id={`${ids.city}-error`} role="alert" className={errorClass}>{errors.city.message}</p>}
        </div>

        {/* Emergency Contact */}
        <div>
          <label htmlFor={ids.emergencyContact} className="block text-sm font-medium text-dark mb-1">Emergency Contact</label>
          <input
            id={ids.emergencyContact}
            type="tel"
            inputMode="tel"
            {...register('emergency_contact', { validate: validateOptionalPhone })}
            placeholder="Emergency contact number"
            autoComplete="off"
            aria-invalid={!!errors.emergency_contact}
            aria-describedby={errors.emergency_contact ? `${ids.emergencyContact}-error` : undefined}
            className={inputClass}
          />
          {errors.emergency_contact && <p id={`${ids.emergencyContact}-error`} role="alert" className={errorClass}>{errors.emergency_contact.message}</p>}
        </div>
      </div>

      {/* Food Preference */}
      <div>
        {bookingMode === 'solo' ? (
          <>
            <label id={ids.foodPreference} className="block text-sm font-medium text-dark mb-1">Food Preference *</label>
            <div
              className="grid grid-cols-2 gap-2"
              role="group"
              aria-labelledby={ids.foodPreference}
              aria-describedby={foodPreferenceError ? `${ids.foodPreference}-error` : undefined}
            >
              <button
                type="button"
                onClick={() => { setFoodPreference('veg'); setFoodPreferenceError(''); }}
                aria-pressed={foodPreference === 'veg'}
                className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 font-medium text-sm transition-colors ${
                  foodPreference === 'veg'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-background-warm text-dark-muted hover:border-primary/40'
                }`}
              >
                <Utensils size={16} aria-hidden="true" /> Veg
              </button>
              <button
                type="button"
                onClick={() => { setFoodPreference('non_veg'); setFoodPreferenceError(''); }}
                aria-pressed={foodPreference === 'non_veg'}
                className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 font-medium text-sm transition-colors ${
                  foodPreference === 'non_veg'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-background-warm text-dark-muted hover:border-primary/40'
                }`}
              >
                <Utensils size={16} aria-hidden="true" /> Non-veg
              </button>
            </div>
            {foodPreferenceError && <p id={`${ids.foodPreference}-error`} role="alert" className={errorClass}>{foodPreferenceError}</p>}
          </>
        ) : (
          <>
            <label htmlFor={ids.vegCount} className="block text-sm font-medium text-dark mb-1">Food Preference — how many prefer Veg? *</label>
            <input
              id={ids.vegCount}
              type="number"
              inputMode="numeric"
              min={0}
              max={groupSize}
              aria-describedby={`${ids.vegCount}-hint`}
              value={vegCountInput}
              onChange={e => {
                const raw = e.target.value;
                // Same fix as Number of People below: don't force a number
                // back into the field the instant it's emptied, so the
                // user can actually clear it and type a replacement digit.
                setVegCountInput(raw);
                if (raw !== '' && !Number.isNaN(Number(raw))) {
                  setGroupVegCount(Math.min(Math.max(Math.round(Number(raw)), 0), groupSize));
                }
              }}
              onBlur={() => {
                const parsed = Math.round(Number(vegCountInput));
                const clamped = vegCountInput === '' || Number.isNaN(parsed)
                  ? 0
                  : Math.min(Math.max(parsed, 0), groupSize);
                setGroupVegCount(clamped);
                setVegCountInput(String(clamped));
              }}
              className={inputClass}
            />
            <p id={`${ids.vegCount}-hint`} className="text-xs text-dark-muted mt-1">
              {Math.min(groupVegCount, groupSize)} Veg · {groupSize - Math.min(groupVegCount, groupSize)} Non-veg out of {groupSize} {groupSize === 1 ? 'person' : 'people'}.
            </p>
          </>
        )}
      </div>

      {/* Message */}
      <div>
        <label htmlFor={ids.message} className="block text-sm font-medium text-dark mb-1">Message (Optional)</label>
        <textarea
          id={ids.message}
          {...register('message')}
          rows={3}
          placeholder="Any questions or special requirements..."
          className={`${inputClass} resize-none`}
        />
      </div>

      {/* Terms & Conditions */}
      <div className="bg-background-warm rounded-lg p-3">
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            {...register('terms_accepted', { required: 'You must agree to the Terms & Conditions to continue' })}
            aria-invalid={!!errors.terms_accepted}
            aria-describedby={errors.terms_accepted ? 'terms-accepted-error' : undefined}
            className="w-4 h-4 mt-0.5 accent-primary shrink-0"
          />
          <span className="text-sm text-dark">
            I have read and agree to the{' '}
            <button
              type="button"
              onClick={() => setTermsOpen(true)}
              className="text-primary font-medium hover:underline"
            >
              Terms & Conditions
            </button>
          </span>
        </label>
        {errors.terms_accepted && <p id="terms-accepted-error" role="alert" className={errorClass}>{errors.terms_accepted.message}</p>}
      </div>

      {/* Error */}
      {status === 'error' && (
        <div role="alert" className="flex items-start gap-2 text-red-600 bg-red-50 rounded-lg p-3">
          <AlertCircle size={18} className="shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-sm">{errorMsg}</p>
        </div>
      )}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        fullWidth
        loading={status === 'loading'}
        className="mt-2"
      >
        {willWaitlist ? 'Join Waitlist' : 'Submit Enquiry'}
      </Button>

      <p className="text-xs text-dark-muted text-center">
        {willWaitlist
          ? "No payment required. We'll notify you the moment seats free up."
          : "No payment required. We'll contact you to confirm your spot."}
      </p>
    </form>

    <Modal isOpen={termsOpen} onClose={() => setTermsOpen(false)} title="Terms & Conditions" size="xl">
      <div className="flex items-start gap-2 -mt-1 mb-4 text-dark-muted">
        <FileText size={16} className="shrink-0 mt-0.5 text-primary" />
        <p className="text-xs leading-relaxed">
          Please read the full policy below before confirming your booking. Tap a number to jump to that section.
        </p>
      </div>

      {/* Quick-jump section chips */}
      <div ref={chipBarRef} role="tablist" aria-label="Terms & Conditions sections" className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-3 mb-3 border-b border-background-warm">
        {termsSections.map(section => (
          <button
            key={section.number}
            ref={el => { chipRefs.current[section.number] = el; }}
            type="button"
            role="tab"
            aria-selected={displayedActiveNum === section.number}
            aria-label={section.title}
            onClick={() => handleChipSelect(section.number)}
            title={section.title}
            className={`shrink-0 text-xs font-semibold w-7 h-7 rounded-full transition-colors flex items-center justify-center ${
              displayedActiveNum === section.number
                ? 'bg-primary text-white'
                : 'bg-background-warm text-dark-muted hover:bg-primary hover:text-white'
            }`}
          >
            {section.number}
          </button>
        ))}
      </div>

      <div className="relative">
        <div ref={scrollBodyRef} className="max-h-[50vh] overflow-y-auto app-scroll pr-2 space-y-5 scroll-smooth">
          {termsSections.length > 0 ? termsSections.map(section => (
            <div
              key={section.number}
              ref={el => { sectionRefs.current[section.number] = el; }}
              className="scroll-mt-1"
            >
              <div className="flex items-start gap-3">
                <span className="shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                  {section.number}
                </span>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-dark mb-1.5">{section.title}</h4>
                  <TermsBlocks blocks={section.blocks} />
                </div>
              </div>
              {section.number !== termsSections[termsSections.length - 1].number && (
                <div className="h-px bg-background-warm mt-5 ml-10" />
              )}
            </div>
          )) : (
            <p className="text-sm text-dark whitespace-pre-line">{termsText}</p>
          )}
        </div>
        {/* Fade hint so it's clear the panel scrolls */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-2 h-8 bg-gradient-to-t from-white to-transparent" />
      </div>

      <div className="flex justify-end mt-4 pt-4 border-t border-background-warm">
        <Button variant="primary" size="md" onClick={() => setTermsOpen(false)}>Close</Button>
      </div>
    </Modal>
    </>
  );
}
