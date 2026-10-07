import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { motion } from 'framer-motion';
import {
  CheckCircle,
  WarningCircle as AlertCircle,
  FileText,
  User,
  Users,
  Clock as Clock3,
  AirplaneTilt,
  CalendarBlank,
  Scissors,
  ArrowRight,
  Minus,
  Plus,
} from '@phosphor-icons/react';
import type { BookingFormData, BookingMode, BookingFormDraft, WaitlistFormData, TripOptionsConfig } from '../../types/types-index';
import { submitEnquiry, submitGroupEnquiry, submitWaitlist, getTripSeatSnapshot } from '../../services/api';
import { useBotTrap } from '../../utils/botProtection';
import HoneypotField from './HoneypotField';
import { DEFAULT_TERMS_AND_CONDITIONS } from '../../constants/terms';
import { parseTerms } from '../../utils/parseTerms';
import { validateFullName, validateCity, validateEmail, validatePhone, validateOptionalPhone, validateAge, DEFAULT_MIN_AGE, DEFAULT_MAX_AGE } from '../../utils/formValidation';
import { MIN_GROUP_SIZE, MAX_GROUP_SIZE } from '../../utils/bookingDraft';
import { INDIAN_CITIES } from '../../constants/indianCities';
import { getEmailDomainSuggestions } from '../../constants/emailDomains';
import ChickenLegIcon from '../icons/ChickenLegIcon';
import LeafIcon from '../icons/LeafIcon';
import Button from './Button';
import Modal from './Modal';
import TermsBlocks from './TermsBlocks';
import BookingPackagePicker from './BookingPackagePicker';
import { hasPackages, packageOptionIds, seatPackageAssignments, noPackageBase, type PackageBase } from '../../utils/tripOptions';
import KeyboardNavSuggestionDropdown from './KeyboardNavSuggestionDropdown';
import { handleSuggestionKeyDown } from './suggestionKeyNav';
import { CONTACT_PHONE_DISPLAY } from '../../constants/site';
import { formatDate } from '../../utils/utils-index';

// How many rows to show at once in the City / Email-domain suggestion
// dropdowns — enough to be useful without the list itself needing to
// scroll inside the (already scrollable) modal.
const MAX_SUGGESTIONS = 6;

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
  // Restores an in-progress (never submitted) entry — e.g. the user opened
  // this form, typed some details, then closed the modal without
  // submitting. Undefined/omitted means start blank, same as before this
  // existed.
  initialDraft?: BookingFormDraft | null;
  // Fired whenever anything in the form changes, so the caller can hold
  // onto the latest draft (see initialDraft above) for as long as the
  // modal around this form might get closed and reopened. Called with
  // null right after a successful submit, once the form has actually been
  // cleared, so a stale draft doesn't get restored into the next booking.
  onDraftChange?: (draft: BookingFormDraft | null) => void;
  // The trip's public packages (Basic / Premium / ...). When it has any,
  // a package choice is shown and sent along with the enquiry — ids only,
  // the DB prices it. Omitted/empty = plain single-price trip, form
  // behaves exactly as before.
  tripOptions?: TripOptionsConfig | null;
  // Today's price for the plain trip, used only to show each package's
  // price and an estimated total in the picker.
  packageBase?: PackageBase | null;
  // Package to preselect (e.g. the card the visitor tapped on the trip
  // page). Wins over a restored draft's package, since it's the most
  // recent thing the visitor chose.
  initialPackageId?: string | null;
  // Trip start date, shown on the boarding-pass stub. Optional — the date
  // row and the barcode caption simply drop it when it isn't passed.
  tripDate?: string | null;
}

// Deterministic pseudo-barcode: the same trip always prints the same bars,
// so the ticket looks "issued" for that trip rather than random per open.
function barcodeBars(seed: string): { x: number; w: number }[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  const bars: { x: number; w: number }[] = [];
  let x = 0;
  while (x < 200) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const w = 1 + (h % 3);
    const gap = 1 + ((h >>> 5) % 3);
    if (x + w > 200) break;
    bars.push({ x, w });
    x += w + gap;
  }
  return bars;
}

// Compact − [n] + control used in the ticket stub for the group counts.
// The number is still a real <input type="number"> (typing works, same
// handlers as before); the buttons just nudge it by one.
function Stepper({ id, value, min, max, current, onChange, onBlur, onStep, decLabel, incLabel, describedBy, invalid }: {
  id: string;
  value: string;
  min: number;
  max: number;
  current: number;
  onChange: (raw: string) => void;
  onBlur: () => void;
  onStep: (delta: number) => void;
  decLabel: string;
  incLabel: string;
  describedBy?: string;
  invalid?: boolean;
}) {
  const btn = 'w-9 md:w-8 h-full shrink-0 flex items-center justify-center text-dark-muted hover:bg-primary/10 disabled:opacity-40 disabled:hover:bg-transparent transition-colors';
  return (
    <div className="flex items-stretch h-9 w-full md:w-auto md:min-w-[6.5rem] rounded-md border-2 border-[#D5C29A] bg-white/70 overflow-hidden focus-within:border-primary">
      <button type="button" onClick={() => onStep(-1)} disabled={current <= min} aria-label={decLabel} className={btn}>
        <Minus size={14} weight="bold" aria-hidden="true" />
      </button>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="min-w-0 flex-1 w-8 text-center bg-transparent outline-none font-semibold text-dark [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button type="button" onClick={() => onStep(1)} disabled={current >= max} aria-label={incLabel} className={btn}>
        <Plus size={14} weight="bold" aria-hidden="true" />
      </button>
    </div>
  );
}

export default function BookingForm({ tripId, tripTitle, terms, onSuccess, remainingSeats, minAge, maxAge, initialDraft, onDraftChange, tripOptions, packageBase, initialPackageId, tripDate }: BookingFormProps) {
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
  // Best-effort bot mitigation (honeypot field + minimum fill time) — see
  // src/utils/botProtection.ts. Checked first thing in onSubmit below.
  const { honeypotRef, isLikelyBot } = useBotTrap();
  const [bookingMode, setBookingMode] = useState<BookingMode>(initialDraft?.bookingMode ?? 'solo');
  const [groupSize, setGroupSize] = useState(initialDraft?.groupSize ?? MIN_GROUP_SIZE);
  // Raw text the user is typing into the "Number of People" input. Kept
  // separate from the numeric groupSize so the field can be emptied out
  // (e.g. via backspace) while the user is mid-edit, instead of snapping
  // back to a number on every keystroke. Reconciled into groupSize on blur.
  const [groupSizeInput, setGroupSizeInput] = useState(String(initialDraft?.groupSize ?? MIN_GROUP_SIZE));
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
  const [foodPreference, setFoodPreference] = useState<'veg' | 'non_veg' | null>(initialDraft?.foodPreference ?? null);
  const [foodPreferenceError, setFoodPreferenceError] = useState('');
  // Group: a group can be a mix, so this collects how many of the
  // groupSize seats are veg — the rest are treated as non-veg. Clamped to
  // [0, groupSize] whenever groupSize changes (see the Number of People
  // input below).
  const [groupVegCount, setGroupVegCount] = useState(initialDraft?.groupVegCount ?? MIN_GROUP_SIZE);
  // Raw text for the veg-count input — same reasoning as groupSizeInput
  // above. Kept in sync with groupVegCount whenever it changes elsewhere
  // (e.g. clamped down when groupSize shrinks) via the effect below.
  const [vegCountInput, setVegCountInput] = useState(String(initialDraft?.groupVegCount ?? MIN_GROUP_SIZE));

  // Package choice (only when the trip has packages). Solo: one package id,
  // defaulting to the first (usually the base/"Basic" one). Group: people
  // per package — the first package takes the remainder, same idea as the
  // veg/non-veg split above.
  const packagesOn = hasPackages(tripOptions);
  const validPackageId = (id?: string | null) =>
    id && tripOptions?.packages.some(p => p.id === id) ? id : null;
  const [packageId, setPackageId] = useState<string | null>(
    validPackageId(initialPackageId) ?? validPackageId(initialDraft?.packageId) ?? tripOptions?.packages[0]?.id ?? null
  );
  const [groupPackageCounts, setGroupPackageCounts] = useState<Record<string, number>>(
    initialDraft?.groupPackageCounts ?? {}
  );

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

  // City / email-domain suggestion dropdown state — declared up here
  // (rather than next to the handlers that use them, further down) since
  // this component has an early `return` below for the success screen,
  // and hooks can't be called conditionally after that.
  const [citySuggestionsOpen, setCitySuggestionsOpen] = useState(false);
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [citySuggestionIndex, setCitySuggestionIndex] = useState(-1);
  const [emailSuggestionsOpen, setEmailSuggestionsOpen] = useState(false);
  const [emailSuggestions, setEmailSuggestions] = useState<string[]>([]);
  const [emailSuggestionIndex, setEmailSuggestionIndex] = useState(-1);

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
    watch,
    getValues,
    setValue,
  } = useForm<BookingFormData>({
    // Default is 'onSubmit', which only runs validation (and shows errors)
    // after the first Save attempt. 'onChange' validates on every keystroke
    // instead, so a bad phone/email/name shows its error message live as
    // the user types rather than only surfacing on save.
    mode: 'onChange',
    defaultValues: {
      full_name: initialDraft?.full_name ?? '',
      // BookingFormData types age as a number, but the input itself never
      // parses it (see the Age field below) — it's really just text at
      // this layer, same as everywhere else age is handled in this file.
      age: (initialDraft?.age ?? '') as unknown as number,
      phone: initialDraft?.phone ?? '',
      email: initialDraft?.email ?? '',
      city: initialDraft?.city ?? '',
      emergency_contact: initialDraft?.emergency_contact ?? '',
      message: initialDraft?.message ?? '',
      terms_accepted: initialDraft?.terms_accepted ?? false,
    },
  });

  // Bundles the RHF-managed text fields with the non-RHF choices tracked
  // above (bookingMode/groupSize/foodPreference/groupVegCount) and hands
  // the result to the caller, so it can hold onto it as `initialDraft` the
  // next time this form is mounted (see the prop docs above).
  const reportDraft = () => {
    if (!onDraftChange) return;
    const values = getValues();
    onDraftChange({
      bookingMode,
      groupSize,
      groupVegCount,
      foodPreference,
      packageId,
      groupPackageCounts,
      full_name: values.full_name ?? '',
      age: values.age != null ? String(values.age) : '',
      phone: values.phone ?? '',
      email: values.email ?? '',
      city: values.city ?? '',
      emergency_contact: values.emergency_contact ?? '',
      message: values.message ?? '',
      terms_accepted: !!values.terms_accepted,
    });
  };

  // Re-reports the draft whenever a non-RHF choice changes, and (re)opens
  // a watch subscription — closing over that same fresh state — so a
  // keystroke in any RHF-registered field reports the draft too. The
  // subscription is cheap to recreate and only happens when one of these
  // four values actually changes, not on every keystroke.
  useEffect(() => {
    reportDraft();
    // eslint-disable-next-line react-hooks/incompatible-library -- react-hook-form's watch() is inherently unmemoizable; only used locally here, never passed to a memoized child
    const subscription = watch(() => reportDraft());
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingMode, groupSize, groupVegCount, foodPreference, packageId, groupPackageCounts, watch]);

  // Shared shape behind both the group and solo submit paths below: try
  // the real enquiry/booking submission when the live seat count says it
  // should fit; if the DB's own capacity check disagrees (the hard
  // backstop behind the earlier live re-check), fall back to a waitlist
  // signup instead of failing outright. When it doesn't fit live to begin
  // with, skip straight to the waitlist.
  const submitWithWaitlistFallback = async (
    fitsLive: boolean,
    primarySubmit: () => Promise<void>,
    waitlistPayload: WaitlistFormData
  ) => {
    if (fitsLive) {
      try {
        await primarySubmit();
        setSubmittedAsWaitlist(false);
        return;
      } catch (err) {
        if (err instanceof Error && err.message === 'SEATS_UNAVAILABLE') {
          await submitWaitlist(waitlistPayload);
          setSubmittedAsWaitlist(true);
          setJustMissedSeats(true);
          return;
        }
        throw err;
      }
    }
    await submitWaitlist(waitlistPayload);
    setSubmittedAsWaitlist(true);
  };

  const onSubmit = async (data: BookingFormData) => {
    // Best-effort bot mitigation: a filled honeypot or a suspiciously
    // instant submit is a strong signal this isn't a real person filling
    // out the form. Silently no-op (pretend success) rather than showing
    // an error, so a scripted submitter gets no useful signal back about
    // why it failed.
    if (isLikelyBot()) {
      setStatus('success');
      return;
    }
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
        const seatPackages = packagesOn ? seatPackageAssignments(tripOptions!, groupSize, groupPackageCounts) : undefined;
        // Same for the package split — the waitlist row has no package
        // columns, so it travels in the message for whoever follows up.
        const packageNote = seatPackages
          ? tripOptions!.packages
              .map(p => `${seatPackages.filter(s => s.package_id === p.id).length}× ${p.name}`)
              .join(', ') + '.'
          : '';
        const foodNote = `${groupVegCountClamped} veg / ${groupSize - groupVegCountClamped} non-veg.${packageNote ? ` Packages: ${packageNote}` : ''}`;
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

        await submitWithWaitlistFallback(
          groupFitsLive,
          () => submitGroupEnquiry({ ...d, trip_id: tripId, trip_title: tripTitle }, groupSize, foodPreferences, seatPackages),
          waitlistPayload
        );
        setSuccessCount(groupSize);
      } else {
        const chosenPackage = packagesOn ? tripOptions!.packages.find(p => p.id === packageId) ?? tripOptions!.packages[0] : null;
        const soloPackageNote = chosenPackage ? `Package: ${chosenPackage.name}.` : '';
        const waitlistPayload = {
          full_name: d.full_name,
          phone: d.phone,
          email: d.email,
          age: d.age,
          city: d.city,
          emergency_contact: d.emergency_contact,
          food_preference: foodPreference,
          message: soloPackageNote ? (d.message ? `${soloPackageNote} ${d.message}` : soloPackageNote) : d.message,
          trip_id: tripId!,
          trip_title: tripTitle,
          group_size: null,
        };

        await submitWithWaitlistFallback(
          soloFitsLive,
          () => submitEnquiry({
            ...d,
            food_preference: foodPreference as 'veg' | 'non_veg',
            trip_id: tripId,
            trip_title: tripTitle,
            ...(chosenPackage ? { package_id: chosenPackage.id, selected_option_ids: packageOptionIds(chosenPackage, tripOptions) } : {}),
          }),
          waitlistPayload
        );
        setSuccessCount(1);
      }
      setStatus('success');
      // Reset to genuinely blank values (not the initialDraft this form
      // may have mounted with) now that the entry's been submitted — an
      // old draft should never come back after a successful submission.
      reset({
        full_name: '',
        age: '' as unknown as number,
        phone: '',
        email: '',
        city: '',
        emergency_contact: '',
        message: '',
        terms_accepted: false,
      });
      setBookingMode('solo');
      setGroupSize(MIN_GROUP_SIZE);
      setGroupSizeInput(String(MIN_GROUP_SIZE));
      setGroupVegCount(MIN_GROUP_SIZE);
      setFoodPreference(null);
      setPackageId(tripOptions?.packages[0]?.id ?? null);
      setGroupPackageCounts({});
      onDraftChange?.(null);
      onSuccess?.();
    } catch (err) {
      setStatus('error');
      if (err instanceof Error && err.message === 'DUPLICATE_ENQUIRY') {
        setErrorMsg("Looks like you've already submitted an enquiry for this trip with these exact details. We'll be in touch shortly — or message us on WhatsApp if you need to change something.");
      } else if (err instanceof Error && err.message === 'DUPLICATE_WAITLIST_ENTRY') {
        setErrorMsg("You're already on the waitlist for this trip with these exact details — we'll reach out the moment enough seats open up.");
      } else if (err instanceof Error && err.message === 'RATE_LIMITED') {
        setErrorMsg("We've received a lot of submissions from these contact details in the last few minutes. Please wait about 10 minutes and try again, or message us on WhatsApp.");
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
        className="text-center py-12 px-6 bg-cream"
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
    w-full min-w-0 px-3 sm:px-4 py-3 rounded-md border-2 bg-white/70
    font-body text-dark placeholder-dark-muted/60
    transition-all duration-200 outline-none
    focus:border-primary focus:bg-white
    border-[#D5C29A]
  `;

  const errorClass = 'text-red-500 text-xs mt-1';

  // City suggestions — filters INDIAN_CITIES against whatever's typed so
  // far. validateCity enforces this same list: picking a suggestion (or
  // typing the exact name out) is required whenever this dropdown has
  // matches; once nothing matches, free text is accepted instead.
  const handleCityInput = (value: string) => {
    const trimmed = value.trim().toLowerCase();
    if (trimmed.length === 0) {
      setCitySuggestionsOpen(false);
      return;
    }
    const matches = INDIAN_CITIES
      .filter(c => c.toLowerCase().startsWith(trimmed))
      .slice(0, MAX_SUGGESTIONS);
    setCitySuggestions(matches);
    setCitySuggestionIndex(-1);
    setCitySuggestionsOpen(matches.length > 0);
  };

  const selectCitySuggestion = (city: string) => {
    setValue('city', city, { shouldValidate: true, shouldDirty: true });
    setCitySuggestionsOpen(false);
    setCitySuggestionIndex(-1);
  };

  // Email domain suggestions — once the user's typed "@", offers the
  // common domains that match what (if anything) they've typed after it,
  // so "priya@gm" can become "priya@gmail.com" in one tap instead of
  // typing the rest out. Purely a convenience for the domain half; the
  // field still accepts any domain the user finishes typing themselves —
  // validateEmail only constrains the local part (before the "@").
  const handleEmailInput = (value: string) => {
    const matches = getEmailDomainSuggestions(value, MAX_SUGGESTIONS);
    setEmailSuggestions(matches);
    setEmailSuggestionIndex(-1);
    setEmailSuggestionsOpen(matches.length > 0);
  };

  const selectEmailSuggestion = (email: string) => {
    setValue('email', email, { shouldValidate: true, shouldDirty: true });
    setEmailSuggestionsOpen(false);
    setEmailSuggestionIndex(-1);
  };

  const emailReg = register('email', { required: 'Email is required', validate: validateEmail });
  const cityReg = register('city', { required: 'City is required', validate: validateCity });

  const tripDateShort = tripDate ? formatDate(tripDate, { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  const bars = barcodeBars(tripId ?? tripTitle ?? 'ulaa');
  const barcodeCaption = `ULAA${tripDate ? ` · ${formatDate(tripDate, { day: 'numeric', month: 'short', year: undefined }).toUpperCase()}` : ''}`;

  return (
    <>
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid grid-cols-1 md:grid-cols-[17rem_1fr] bg-cream">
      <HoneypotField inputRef={honeypotRef} />

      {/* ── Ticket stub (left on desktop, top on phones) ── */}
      <aside className="relative flex flex-col gap-3.5 md:gap-5 p-4 md:p-6 bg-[#F3E3BF] border-b-2 border-dashed border-[#D2B986] md:border-b-0 md:border-r-2">
        <Scissors
          size={22}
          aria-hidden="true"
          className="absolute z-10 text-dark-muted bg-cream rounded-full p-0.5 -bottom-[13px] left-6 md:bottom-auto md:left-auto md:top-3 md:-right-[13px] md:rotate-0"
        />

        <div className="flex items-center gap-2 text-primary font-bold text-xs tracking-[0.2em] uppercase">
          <AirplaneTilt size={18} weight="fill" aria-hidden="true" /> Boarding pass
        </div>

        {tripTitle && (
          <div>
            <p className="text-[10px] md:text-[11px] font-semibold uppercase tracking-[0.14em] text-dark-muted/80 mb-1">Booking for</p>
            <p className="font-display text-lg font-bold leading-snug text-dark">{tripTitle}</p>
          </div>
        )}

        {(tripDateShort || remainingSeats !== undefined) && (
          <div className="grid grid-cols-2 gap-3">
            {tripDateShort && (
              <div>
                <p className="text-[10px] md:text-[11px] font-semibold uppercase tracking-[0.14em] text-dark-muted/80 mb-1">Date</p>
                <p className="flex items-center gap-1.5 text-sm font-semibold text-dark">
                  <CalendarBlank size={15} className="text-primary shrink-0" aria-hidden="true" /> {tripDateShort}
                </p>
              </div>
            )}
            {remainingSeats !== undefined && (
              <div>
                <p className="text-[10px] md:text-[11px] font-semibold uppercase tracking-[0.14em] text-dark-muted/80 mb-1">Seats</p>
                <p className="flex items-center gap-1.5 text-sm font-semibold text-dark">
                  <Clock3 size={15} className="text-primary shrink-0" aria-hidden="true" />
                  {remainingSeats > 0 ? `${remainingSeats} left` : 'Waitlist'}
                </p>
              </div>
            )}
          </div>
        )}

        <div className="border-t border-dashed border-[#D2B986]" />

        {/* Booking type + food preference: side by side on phones in Solo
            mode (compact), stacked in the narrow desktop stub. */}
        <div className={bookingMode === 'solo' ? 'grid grid-cols-2 md:grid-cols-1 gap-3 md:gap-5 items-start' : 'contents'}>
        {/* Solo vs Group */}
        <div>
          <label id={ids.bookingType} className="block text-[10px] md:text-[11px] font-semibold uppercase tracking-[0.14em] text-dark-muted/80 mb-1.5">Booking type</label>
          <div className="flex rounded-md border-2 border-[#D2B986] overflow-hidden" role="group" aria-labelledby={ids.bookingType}>
            <button
              type="button"
              onClick={() => setBookingMode('solo')}
              aria-pressed={bookingMode === 'solo'}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs md:text-sm font-semibold transition-colors ${
                bookingMode === 'solo' ? 'bg-primary text-white' : 'text-dark-muted hover:bg-primary/10'
              }`}
            >
              <User size={16} aria-hidden="true" /> Solo
            </button>
            <button
              type="button"
              onClick={() => setBookingMode('group')}
              aria-pressed={bookingMode === 'group'}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs md:text-sm font-semibold transition-colors border-l-2 border-[#D2B986] ${
                bookingMode === 'group' ? 'bg-primary text-white' : 'text-dark-muted hover:bg-primary/10'
              }`}
            >
              <Users size={16} aria-hidden="true" /> Group
            </button>
          </div>
          {bookingMode === 'solo' && !soloFits && (
            <p className="flex items-start gap-1.5 text-xs text-dark-muted mt-2">
              <Clock3 size={13} className="text-primary shrink-0 mt-0.5" aria-hidden="true" />
              Trip is full — you'll join the waitlist.
            </p>
          )}
        </div>

        {/* Group: people count + veg count share one row on phones (stacked
            in the narrow desktop stub); Solo: just the food buttons. */}
        <div className={bookingMode === 'group' ? 'grid grid-cols-2 md:grid-cols-1 gap-3 md:gap-3.5 items-start' : ''}>
      {bookingMode === 'group' && (
        <div>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-1.5">
            <label htmlFor={ids.groupSize} className="text-[10px] md:text-[11px] font-semibold uppercase tracking-[0.14em] text-dark-muted/80">Number of people *</label>
            <Stepper
              id={ids.groupSize}
              value={groupSizeInput}
              min={MIN_GROUP_SIZE}
              max={MAX_GROUP_SIZE}
              current={groupSize}
              invalid={!!groupSizeError}
              describedBy={groupSizeError ? `${ids.groupSize}-error` : !groupFits ? `${ids.groupSize}-hint` : undefined}
              decLabel="Fewer people"
              incLabel="More people"
              onChange={raw => {
                setGroupSizeError('');
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
              onStep={delta => {
                setGroupSizeError('');
                const next = Math.min(Math.max(groupSize + delta, MIN_GROUP_SIZE), MAX_GROUP_SIZE);
                setGroupSize(next);
                setGroupSizeInput(String(next));
                setGroupVegCount(prev => Math.min(prev, next));
              }}
            />
          </div>
          {!groupFits && (
            <p id={`${ids.groupSize}-hint`} className="flex items-start gap-1.5 text-xs text-dark-muted mt-1.5">
              <Clock3 size={13} className="text-primary shrink-0 mt-0.5" aria-hidden="true" />
              Not enough seats for this group — you'll join the waitlist.
            </p>
          )}
          {groupSizeError && <p id={`${ids.groupSize}-error`} role="alert" className={errorClass}>{groupSizeError}</p>}
        </div>
      )}

        {/* Food preference */}
        <div>
          {bookingMode === 'solo' ? (
            <>
              <label id={ids.foodPreference} className="block text-[10px] md:text-[11px] font-semibold uppercase tracking-[0.14em] text-dark-muted/80 mb-1.5">Food preference *</label>
              <div
                className="flex gap-2"
                role="group"
                aria-labelledby={ids.foodPreference}
                aria-describedby={foodPreferenceError ? `${ids.foodPreference}-error` : undefined}
              >
                <button
                  type="button"
                  onClick={() => { setFoodPreference('veg'); setFoodPreferenceError(''); }}
                  aria-pressed={foodPreference === 'veg'}
                  className={`relative flex-1 flex flex-col md:flex-row items-center justify-center gap-1 md:gap-1.5 px-1 py-2 rounded-md border-2 text-xs md:text-sm whitespace-nowrap transition-colors ${
                    foodPreference === 'veg'
                      ? 'border-green-600 bg-[#EBD7A8] text-dark font-bold'
                      : 'border-green-600/50 text-dark-muted font-medium hover:border-green-600'
                  }`}
                >
                  <span className="w-6 h-6 shrink-0 rounded-full bg-green-600 text-white flex items-center justify-center" aria-hidden="true">
                    <LeafIcon size={14} />
                  </span>
                  Veg
                  {foodPreference === 'veg' && (
                    <CheckCircle size={16} weight="fill" className="absolute -top-2 -right-2 text-dark bg-cream rounded-full" aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => { setFoodPreference('non_veg'); setFoodPreferenceError(''); }}
                  aria-pressed={foodPreference === 'non_veg'}
                  className={`relative flex-1 flex flex-col md:flex-row items-center justify-center gap-1 md:gap-1.5 px-1 py-2 rounded-md border-2 text-xs md:text-sm whitespace-nowrap transition-colors ${
                    foodPreference === 'non_veg'
                      ? 'border-red-600 bg-[#EBD7A8] text-dark font-bold'
                      : 'border-red-600/50 text-dark-muted font-medium hover:border-red-600'
                  }`}
                >
                  <span className="w-6 h-6 shrink-0 rounded-full bg-red-600 text-white flex items-center justify-center" aria-hidden="true">
                    <ChickenLegIcon size={14} />
                  </span>
                  Non-veg
                  {foodPreference === 'non_veg' && (
                    <CheckCircle size={16} weight="fill" className="absolute -top-2 -right-2 text-dark bg-cream rounded-full" aria-hidden="true" />
                  )}
                </button>
              </div>
              {foodPreferenceError && <p id={`${ids.foodPreference}-error`} role="alert" className={errorClass}>{foodPreferenceError}</p>}
            </>
          ) : (
            <>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-1.5">
                <label htmlFor={ids.vegCount} className="text-[10px] md:text-[11px] font-semibold uppercase tracking-[0.14em] text-dark-muted/80">How many prefer Veg? *</label>
                <Stepper
                  id={ids.vegCount}
                  value={vegCountInput}
                  min={0}
                  max={groupSize}
                  current={groupVegCount}
                  describedBy={`${ids.vegCount}-hint`}
                  decLabel="Fewer veg"
                  incLabel="More veg"
                  onChange={raw => {
                    // Don't force a number back in the instant it's emptied,
                    // so the user can clear it and type a replacement digit.
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
                  onStep={delta => {
                    const next = Math.min(Math.max(groupVegCount + delta, 0), groupSize);
                    setGroupVegCount(next);
                    setVegCountInput(String(next));
                  }}
                />
              </div>
              <p id={`${ids.vegCount}-hint`} className="flex items-center gap-3 text-xs text-dark-muted mt-1.5">
                <span className="inline-flex items-center gap-1">
                  <span className="w-4 h-4 rounded-full bg-green-600 text-white flex items-center justify-center" aria-hidden="true"><LeafIcon size={10} /></span>
                  {Math.min(groupVegCount, groupSize)} Veg
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-4 h-4 rounded-full bg-red-600 text-white flex items-center justify-center" aria-hidden="true"><ChickenLegIcon size={10} /></span>
                  {groupSize - Math.min(groupVegCount, groupSize)} Non-veg
                </span>
              </p>
            </>
          )}
        </div>
        </div>
        </div>

        {/* Barcode */}
        <div className="mt-auto pt-2 hidden md:block" aria-hidden="true">
          <svg viewBox="0 0 200 48" preserveAspectRatio="none" className="w-full h-12 text-dark">
            {bars.map((b, i) => <rect key={i} x={b.x} y={0} width={b.w} height={48} fill="currentColor" />)}
          </svg>
          <p className="text-2xs tracking-[0.2em] text-dark-muted mt-1">{barcodeCaption}</p>
        </div>
      </aside>

      {/* ── Main ticket body ── */}
      <div className="p-5 md:p-6 space-y-4 min-w-0">
        <h2 className="font-display text-2xl font-bold text-dark pr-10">Pack your bags</h2>

      {/* Phones: 2-col grid so short fields (Age, City) pair up; desktop: 6-col
          so Name+Age, City+Phone, Email+Emergency each fill a row. DOM order
          matches the visual order at every breakpoint (tab order stays sane). */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-x-3 sm:gap-x-4 gap-y-4">
        {/* Full name */}
        <div className="col-span-2 sm:col-span-4">
          <label htmlFor={ids.fullName} className="block text-sm font-medium text-dark mb-1">Full name *</label>
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
        <div className="col-span-1 sm:col-span-2">
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
            placeholder={`Age ${effectiveMinAge}–${effectiveMaxAge}`}
            autoComplete="off"
            aria-invalid={!!errors.age}
            aria-describedby={errors.age ? `${ids.age}-error` : undefined}
            className={inputClass}
          />
          {errors.age && <p id={`${ids.age}-error`} role="alert" className={errorClass}>{errors.age.message}</p>}
        </div>

        {/* City */}
        <div className="relative col-span-1 sm:col-span-3">
          <label htmlFor={ids.city} className="block text-sm font-medium text-dark mb-1">City *</label>
          <input
            id={ids.city}
            {...cityReg}
            onChange={e => { cityReg.onChange(e); handleCityInput(e.target.value); }}
            onBlur={e => { cityReg.onBlur(e); setCitySuggestionsOpen(false); }}
            onKeyDown={e => handleSuggestionKeyDown(e, citySuggestions, citySuggestionsOpen, citySuggestionIndex, setCitySuggestionIndex, selectCitySuggestion, setCitySuggestionsOpen)}
            placeholder="Your city"
            autoComplete="address-level2"
            aria-invalid={!!errors.city}
            aria-describedby={errors.city ? `${ids.city}-error` : undefined}
            className={inputClass}
          />
          {errors.city && <p id={`${ids.city}-error`} role="alert" className={errorClass}>{errors.city.message}</p>}
          {citySuggestionsOpen && <KeyboardNavSuggestionDropdown items={citySuggestions} activeIndex={citySuggestionIndex} onSelect={selectCitySuggestion} />}
        </div>

        {/* Phone */}
        <div className="col-span-2 sm:col-span-3">
          <label htmlFor={ids.phone} className="block text-sm font-medium text-dark mb-1">Phone number *</label>
          <input
            id={ids.phone}
            type="tel"
            inputMode="tel"
            {...register('phone', { required: 'Phone number is required', validate: validatePhone })}
            placeholder={CONTACT_PHONE_DISPLAY}
            autoComplete="tel"
            aria-invalid={!!errors.phone}
            aria-describedby={errors.phone ? `${ids.phone}-error` : undefined}
            className={inputClass}
          />
          {errors.phone && <p id={`${ids.phone}-error`} role="alert" className={errorClass}>{errors.phone.message}</p>}
        </div>

        {/* Email */}
        <div className="relative col-span-2 sm:col-span-3">
          <label htmlFor={ids.email} className="block text-sm font-medium text-dark mb-1">Email *</label>
          <input
            id={ids.email}
            type="email"
            {...emailReg}
            onChange={e => { emailReg.onChange(e); handleEmailInput(e.target.value); }}
            onBlur={e => { emailReg.onBlur(e); setEmailSuggestionsOpen(false); }}
            onKeyDown={e => handleSuggestionKeyDown(e, emailSuggestions, emailSuggestionsOpen, emailSuggestionIndex, setEmailSuggestionIndex, selectEmailSuggestion, setEmailSuggestionsOpen)}
            placeholder="you@example.com"
            autoComplete="email"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? `${ids.email}-error` : undefined}
            className={inputClass}
          />
          {errors.email && <p id={`${ids.email}-error`} role="alert" className={errorClass}>{errors.email.message}</p>}
          {emailSuggestionsOpen && <KeyboardNavSuggestionDropdown items={emailSuggestions} activeIndex={emailSuggestionIndex} onSelect={selectEmailSuggestion} />}
        </div>

        {/* Emergency Contact */}
        <div className="col-span-2 sm:col-span-3">
          <label htmlFor={ids.emergencyContact} className="block text-sm font-medium text-dark mb-1">Emergency contact <span className="text-xs font-normal text-dark-muted/70">Optional</span></label>
          <input
            id={ids.emergencyContact}
            type="tel"
            inputMode="tel"
            {...register('emergency_contact', { validate: validateOptionalPhone })}
            placeholder="Emergency contact no."
            autoComplete="off"
            aria-invalid={!!errors.emergency_contact}
            aria-describedby={errors.emergency_contact ? `${ids.emergencyContact}-error` : undefined}
            className={inputClass}
          />
          {errors.emergency_contact && <p id={`${ids.emergencyContact}-error`} role="alert" className={errorClass}>{errors.emergency_contact.message}</p>}
        </div>
      </div>

      {/* Package (only for trips that offer packages) */}
      {packagesOn && (
        <BookingPackagePicker
          config={tripOptions!}
          base={packageBase ?? noPackageBase}
          mode={bookingMode}
          groupSize={groupSize}
          packageId={packageId}
          onPackageChange={setPackageId}
          groupCounts={groupPackageCounts}
          onGroupCountsChange={setGroupPackageCounts}
        />
      )}

      {/* Message */}
      <div>
        <label htmlFor={ids.message} className="block text-sm font-medium text-dark mb-1">Message <span className="text-xs font-normal text-dark-muted/70">Optional</span></label>
        <textarea
          id={ids.message}
          {...register('message')}
          rows={3}
          placeholder="Any questions or special requirements..."
          className={`${inputClass} resize-none`}
        />
      </div>

      {/* Terms & Conditions */}
      <div className="rounded-md p-1">
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
        {willWaitlist ? 'Join waitlist' : 'Submit enquiry'}
        <ArrowRight size={18} weight="bold" aria-hidden="true" />
      </Button>

      <p className="text-xs text-dark-muted text-center">
        {willWaitlist
          ? "No payment required. We'll notify you the moment seats free up."
          : "No payment required. We'll contact you to confirm your spot."}
      </p>
      </div>
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
