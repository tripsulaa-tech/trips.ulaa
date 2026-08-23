import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { createManualEnquiry, markWaitlistConverted, getAllUpcomingTripsAdmin } from '../../services/api';
import type { Enquiry, UpcomingTrip } from '../../types/types-index';
import {
  phoneSignature, emailSignature, emptyForm, emptyWaitlistPerson,
  validateEnquiryForm, validateWaitlistPersonForm,
} from './AdminEnquiriesShared';
import type { EnquiryForm, WaitlistPersonForm } from './AdminEnquiriesShared';
import { useAlert } from '../../components/ui/useAlert';

/** Owns the "Log an Enquiry" modal — its form state, the waitlist-conversion
 *  handoff (both the single-seat and multi-seat "group" flows), possible-
 *  duplicate detection, and the suggested-amount prefill.
 *
 *  The waitlist "Convert to Enquiry" flow arrives here via router navigation
 *  state (set by AdminWaitlist's navigate() call) — that's genuinely effect
 *  territory, not a simple prop-driven reset, since it also has to clear
 *  that state via navigate() once consumed. See the effect below for the
 *  slots/group_size bookkeeping this involves.
 *
 *  `getTripPrice` stays owned by AdminEnquiries.tsx and is passed in, since
 *  the Track Payment flow (not yet extracted) also depends on it — pulling
 *  it in here would mean that flow importing this hook just for a pure
 *  `trips`-lookup function.
 *
 *  Extracted from AdminEnquiries.tsx (see that file's history for the
 *  original single-component version). */
export function useAddEnquiry(params: {
  trips: UpcomingTrip[];
  enquiries: Enquiry[];
  setTrips: (trips: UpcomingTrip[]) => void;
  load: () => void;
  loadWaitlistCounts: () => void;
  showToast: (message: string) => void;
  getTripPrice: (tripId: string | undefined, packageType: Enquiry['package_type']) => number | undefined;
}) {
  const { trips, enquiries, setTrips, load, loadWaitlistCounts, showToast, getTripPrice } = params;
  const alert = useAlert();
  const location = useLocation();
  const navigate = useNavigate();

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<EnquiryForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  // Set when we arrived here via "Convert to Enquiry" from the Waitlist page —
  // once the enquiry below is actually saved, this waitlist row gets marked
  // 'converted' too, instead of the moment the admin merely navigates here.
  // groupId/groupSize/groupSeq let a multi-seat waitlist group (group_size
  // > 1) end up linked the same way a public "Group" booking is: every
  // enquiry converted from the same waitlist row shares one group_id, so
  // they render together (shared color, "Group X/Y" badge) in the list
  // below instead of looking like unrelated solo bookings. The waitlist
  // row's own id is reused as the group_id — stable across however many
  // separate Convert & Save passes it takes to seat the whole group, with
  // no extra column or coordination needed.
  const [convertingWaitlist, setConvertingWaitlist] = useState<{ id: string; name: string; groupId: string | null; groupSize: number | null; groupSeq: number; slots: number } | null>(null);
  // Filled in whenever slots > 1 — one entry per seat being converted in
  // this pass, so admins can seat everyone that fits in the seats actually
  // available right now instead of repeating the whole flow per person.
  // Left empty for solo/single-slot conversions, which still use the plain
  // `form` fields below exactly as before.
  const [waitlistPeople, setWaitlistPeople] = useState<WaitlistPersonForm[]>([]);

  const openAdd = () => {
    setForm(emptyForm);
    setConvertingWaitlist(null);
    setWaitlistPeople([]);
    setModalOpen(true);
  };

  const closeAddModal = () => {
    setModalOpen(false);
    setConvertingWaitlist(null);
    setWaitlistPeople([]);
  };

  const updateWaitlistPerson = (index: number, patch: Partial<WaitlistPersonForm>) => {
    setWaitlistPeople(prev => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  };

  // Someone hit "Convert to Enquiry" on the Waitlist page — a seat opened up
  // (usually from a cancellation) and this person is next in line. Prefill
  // the add-enquiry form with what we already know about them so the admin
  // only has to fill in the payment.
  // Syncs local state FROM router navigation state (external system, set by
  // AdminWaitlist's navigate() call) and also calls navigate() itself to
  // clear that state once consumed — genuinely effect territory, not a
  // simple prop-driven reset.
  useEffect(() => {
    const incoming = (location.state as { convertWaitlist?: { id: string; full_name: string; phone: string; email: string; age?: number | null; city?: string | null; food_preference?: 'veg' | 'non_veg' | null; trip_id?: string; trip_title?: string; message?: string; group_size?: number | null; already_converted?: number; slots?: number } } | null)?.convertWaitlist;
    if (!incoming) return;
    // This can now be a partial group conversion — some of the group may
    // already have been converted in an earlier pass (see
    // AdminWaitlist.handleConvert / markWaitlistConverted), so the note
    // should only ask the admin to log whatever's genuinely still
    // outstanding after this pass, not the original group size.
    const alreadyConverted = incoming.already_converted ?? 0;
    // How many people AdminWaitlist determined we can actually seat right
    // now (never more than what's still needed, never more than what's
    // physically free) — 1 for a solo entry or when only one seat is open.
    const slots = Math.max(incoming.slots ?? 1, 1);
    const stillToLog = incoming.group_size && incoming.group_size > 1
      ? Math.max(incoming.group_size - alreadyConverted - slots, 0)
      : 0;
    const groupNote = incoming.group_size && incoming.group_size > 1
      ? [
          `Converted from waitlist (group of ${incoming.group_size}`,
          alreadyConverted > 0 ? ` — ${alreadyConverted} already logged, logging ${slots} more now` : ` — logging ${slots} now`,
          stillToLog > 0 ? `, ${stillToLog} seat${stillToLog === 1 ? '' : 's'} still to go after this` : ', completes the group',
          ').',
        ].join('')
      : 'Converted from waitlist.';
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm({
      ...emptyForm,
      full_name: incoming.full_name,
      phone: incoming.phone,
      email: incoming.email || '',
      age: incoming.age ?? '',
      city: incoming.city ?? '',
      food_preference: incoming.food_preference ?? '',
      trip_id: incoming.trip_id || '',
      source: 'other',
      message: incoming.message
        ? `${groupNote} ${incoming.message}`
        : groupNote,
    });
    // Bulk mode (slots > 1): one editable row per seat, first one prefilled
    // with the contact who actually signed up for the waitlist, the rest
    // blank for the admin to fill in with the other group members' details
    // (the waitlist signup itself only ever captures one contact for the
    // whole group).
    setWaitlistPeople(
      slots > 1
        ? [
            {
              full_name: incoming.full_name,
              phone: incoming.phone,
              email: incoming.email || '',
              age: incoming.age ?? '',
              city: incoming.city ?? '',
              food_preference: incoming.food_preference ?? '',
              amount_paid: '',
            },
            ...Array.from({ length: slots - 1 }, () => ({ ...emptyWaitlistPerson })),
          ]
        : []
    );
    setConvertingWaitlist({
      id: incoming.id,
      name: incoming.full_name,
      // Only a real group (size > 1) needs linking — a solo waitlist entry
      // stays group_id: null, same as any other solo enquiry.
      groupId: incoming.group_size && incoming.group_size > 1 ? incoming.id : null,
      groupSize: incoming.group_size && incoming.group_size > 1 ? incoming.group_size : null,
      // alreadyConverted people already hold seats 1..alreadyConverted in
      // the group, so this pass starts at the next open slot.
      groupSeq: alreadyConverted + 1,
      slots,
    });
    setModalOpen(true);
    // Clear the handoff state so refreshing or navigating back doesn't
    // reopen the modal with stale data.
    navigate(location.pathname, { replace: true });
  }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps

  // Suggests the trip's active price (early-bird or normal) as a starting
  // point for total_amount whenever the trip or package changes. The admin
  // can still type over it — this is just to save a lookup.
  const applySuggestedAmount = (tripId: string, packageType: Enquiry['package_type']) => {
    const suggested = getTripPrice(tripId, packageType);
    if (suggested != null) {
      setForm(f => ({ ...f, total_amount: suggested }));
    }
  };

  // Trip prices load asynchronously, separately from the handoff above, so
  // fill in the suggested total once both the converting entry and the
  // trip list are available. Depends on the combination of three pieces of
  // state settling together (not a single prop change), so this isn't a
  // good fit for the render-time-adjustment pattern used elsewhere in this
  // file — an effect is the right tool here.
  useEffect(() => {
    if (!convertingWaitlist || !form.trip_id || trips.length === 0 || form.total_amount !== '') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    applySuggestedAmount(form.trip_id, form.package_type);
  }, [convertingWaitlist, trips, form.trip_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Being typed into the manual "Log an Enquiry" form against every
  // existing enquiry, so the admin can catch an accidental re-entry before
  // saving instead of after.
  const possibleDuplicates = (() => {
    if (convertingWaitlist) return []; // this flow is already tied to one specific waitlist signup
    const phoneSig = phoneSignature(form.phone);
    const emailSig = emailSignature(form.email);
    if (!phoneSig && !emailSig) return [];
    return enquiries.filter(e =>
      (phoneSig && phoneSignature(e.phone) === phoneSig) ||
      (emailSig && emailSignature(e.email) === emailSig)
    );
  })();

  // Seats every person entered for this pass in one click — up to
  // convertingWaitlist.slots people (never more than the seats that were
  // actually free when this flow started). Each becomes its own enquiry,
  // sharing convertingWaitlist.groupId/groupSize so they render together
  // afterwards, same as any other group booking.
  //
  // Runs sequentially rather than Promise.all — markWaitlistConverted does
  // a fetch-then-update on the waitlist row's converted_enquiry_ids array,
  // so parallel calls would race and could silently drop an id. It also
  // means if the trip fills up partway through (e.g. someone else grabbed
  // a seat at the same time), whatever was already saved stays saved
  // instead of the whole batch failing.
  const handleSaveWaitlistGroup = async () => {
    if (!convertingWaitlist) return;

    const totalAmount = form.total_amount === '' ? undefined : Number(form.total_amount);
    // Same shared validator the modal uses live for each seat's card — this
    // is the defense-in-depth save-time gate, checked here up front so a
    // bad row partway through the batch doesn't fail after some people are
    // already seated.
    for (const p of waitlistPeople) {
      const errors = validateWaitlistPersonForm(p, totalAmount ?? '');
      const firstError = errors.full_name || errors.phone || errors.amount_paid;
      if (firstError) {
        const name = p.full_name.trim() || 'One person';
        alert(errors.full_name || errors.phone ? 'Every person needs at least a name and phone number.' : `${name}: ${firstError}`);
        return;
      }
    }

    setSaving(true);
    const trip = trips.find(t => t.id === form.trip_id);
    let seated = 0;
    try {
      for (let i = 0; i < waitlistPeople.length; i++) {
        const p = waitlistPeople[i];
        const amountPaid = p.amount_paid === '' ? 0 : Number(p.amount_paid);
        const created = await createManualEnquiry({
          full_name: p.full_name.trim(),
          phone: p.phone.trim(),
          email: p.email.trim() || 'not-provided@ulaa.local',
          age: p.age === '' ? undefined : p.age,
          city: p.city.trim() || undefined,
          trip_id: form.trip_id || undefined,
          trip_title: trip?.title,
          source: form.source,
          message: form.message.trim() || undefined,
          food_preference: p.food_preference || undefined,
          status: 'new',
          package_type: form.package_type,
          total_amount: totalAmount,
          amount_paid: amountPaid,
          group_id: convertingWaitlist.groupId ?? undefined,
          group_size: convertingWaitlist.groupSize ?? undefined,
          group_seq: convertingWaitlist.groupSeq + i,
        }, { payment_method: form.payment_method || undefined, utr_number: form.payment_utr || undefined });
        await markWaitlistConverted(convertingWaitlist.id, created.id);
        seated++;
      }
      setConvertingWaitlist(null);
      setWaitlistPeople([]);
      setModalOpen(false);
      loadWaitlistCounts();
      const freshTrips = await getAllUpcomingTripsAdmin();
      setTrips(freshTrips);
      load();
      showToast(`Seated ${seated} of ${waitlistPeople.length} people from this group.`);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : (err as { message?: string } | null)?.message;
      const partial = seated > 0 ? ` ${seated} of ${waitlistPeople.length} were saved before this happened.` : '';
      if (message === 'DUPLICATE_ENQUIRY') {
        alert(`There's already an active enquiry for this trip with that exact name, phone, and email.${partial} Tweak that person's details and try the remaining seats again.`);
      } else if (message === 'AGE_NOT_ELIGIBLE') {
        alert(`That person's age falls outside this trip's age range.${partial} Adjust their age (or the trip's age range in Admin → Trips) and try the remaining seats again.`);
      } else if (message && /no seats left/i.test(message)) {
        alert(`Ran out of free seats partway through this batch.${partial}`);
      } else {
        alert((message || 'Failed to save one of the enquiries.') + partial);
      }
      // Whatever did get saved is real — reflect it immediately rather than
      // leaving the admin looking at stale counts after a partial failure.
      if (seated > 0) {
        loadWaitlistCounts();
        const freshTrips = await getAllUpcomingTripsAdmin();
        setTrips(freshTrips);
        load();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (convertingWaitlist && convertingWaitlist.slots > 1) {
      return handleSaveWaitlistGroup();
    }
    // The modal already shows every one of these live, field-by-field, and
    // disables Save while any are present — this is just the defense-in-
    // depth gate in case Save is reached some other way. Same shared
    // validator as AdminAddEnquiryModal.tsx, so the rules can't drift
    // between "what the admin sees live" and "what actually blocks the
    // save".
    const formErrors = validateEnquiryForm(form, !!convertingWaitlist);
    const firstError = formErrors.full_name || formErrors.phone || formErrors.amount_paid;
    if (firstError) {
      alert(firstError);
      return;
    }
    const totalAmount = form.total_amount === '' ? undefined : Number(form.total_amount);
    const amountPaid = form.amount_paid === '' ? 0 : Number(form.amount_paid);
    try {
      setSaving(true);
      const trip = trips.find(t => t.id === form.trip_id);
      const created = await createManualEnquiry({
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || 'not-provided@ulaa.local',
        age: form.age === '' ? undefined : form.age,
        city: form.city.trim() || undefined,
        trip_id: form.trip_id || undefined,
        trip_title: trip?.title,
        source: form.source,
        message: form.message.trim() || undefined,
        food_preference: form.food_preference || undefined,
        status: 'new',
        package_type: form.package_type,
        total_amount: totalAmount,
        amount_paid: amountPaid,
        // Link this seat to the rest of its waitlist group (if any) so it
        // renders grouped in the list below instead of as a standalone
        // enquiry — see the convertingWaitlist state comment above.
        ...(convertingWaitlist?.groupId
          ? { group_id: convertingWaitlist.groupId, group_size: convertingWaitlist.groupSize ?? undefined, group_seq: convertingWaitlist.groupSeq }
          : {}),
      }, amountPaid > 0 ? { payment_method: form.payment_method || undefined, utr_number: form.payment_utr || undefined } : undefined);
      if (convertingWaitlist) {
        await markWaitlistConverted(convertingWaitlist.id, created.id).catch(console.error);
        setConvertingWaitlist(null);
        loadWaitlistCounts();
      }
      setModalOpen(false);
      const freshTrips = await getAllUpcomingTripsAdmin();
      setTrips(freshTrips);
      load();
    } catch (err) {
      console.error(err);
      // Supabase throws plain PostgrestError objects for DB-rejected
      // inserts (e.g. the enforce_trip_capacity trigger), not instances of
      // Error — so `err instanceof Error` was false for those and this
      // always fell through to the generic fallback below, hiding the
      // trigger's actual message from the admin.
      const message = err instanceof Error ? err.message : (err as { message?: string } | null)?.message;
      if (message === 'DUPLICATE_ENQUIRY') {
        alert('There\'s already an active enquiry for this trip with this exact name, phone, and email. If this is meant to be a different traveler, tweak one of those fields — a shared family phone/email with a different name is fine.');
      } else if (message === 'AGE_NOT_ELIGIBLE') {
        alert('The age entered falls outside this trip\'s age range (set in Admin → Trips → Basic Info). Adjust the age or the trip\'s age range and try again.');
      } else if (message && /no seats left/i.test(message)) {
        alert(convertingWaitlist
          ? 'All slots are filled. Unable to complete the conversion.'
          : 'This trip is fully booked — there are no seats left to log this enquiry against.');
      } else {
        alert(message || 'Failed to save enquiry.');
      }
    } finally {
      setSaving(false);
    }
  };

  return {
    modalOpen, setModalOpen,
    form, setForm,
    saving,
    convertingWaitlist,
    waitlistPeople,
    possibleDuplicates,
    openAdd, closeAddModal, updateWaitlistPerson,
    applySuggestedAmount,
    handleSave,
  };
}
