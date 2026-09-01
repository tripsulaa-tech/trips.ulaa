import { supabase } from '../../supabase';
import type { Enquiry, BookingFormData } from '../../../types/types-index';
import { getWaitlistReservedCounts } from '../trips';
import { isAgeNotEligibleError, isSeatsUnavailableError, computeAutoStatus, computeBookingStatus, computeJourneyStage, refreshJourneyStage } from './shared';
import { createKidsForEnquiry } from './kids';

// =============================================
// Enquiries — creation / intake
// =============================================

// The (trip_id, name, phone, email) unique constraint (active enquiries
// only — cancelled ones are excluded) means an exact literal re-submission
// throws a Postgres 23505. Surfaced as a distinct error so the UI can show
// "you've already enquired" instead of a generic failure. Deliberately
// keyed on all three fields together (not email/phone alone) so a family
// booking several seats through one shared contact still works fine.
export async function submitEnquiry(enquiry: BookingFormData): Promise<void> {
  // kid_names isn't a column on `enquiries` — it's the seed data for that
  // kid's own row in the separate `kids` table (see add_kids_table.sql),
  // not something to insert directly onto this row.
  const { kid_names, ...enquiryRow } = enquiry;
  const { data, error } = await supabase.from('enquiries').insert(enquiryRow).select('id').single();
  if (error) {
    // Log the raw Postgrest error so the real cause (bad column, NOT NULL
    // violation, check constraint, RLS, etc.) is visible in devtools instead
    // of only surfacing as a generic "Something went wrong" in the UI.
    console.error('submitEnquiry failed:', error.code, error.message, error.details, error.hint);
    if (error.code === '23505') {
      throw new Error('DUPLICATE_ENQUIRY');
    }
    if (isAgeNotEligibleError(error)) {
      throw new Error('AGE_NOT_ELIGIBLE');
    }
    if (isSeatsUnavailableError(error)) {
      throw new Error('SEATS_UNAVAILABLE');
    }
    // error here is a PostgrestError, not a JS Error instance, so it's
    // wrapped so BookingForm's `err instanceof Error` checks don't silently
    // discard error.message on the way to its generic fallback copy.
    throw new Error(error.message || 'ENQUIRY_INSERT_FAILED');
  }
  if (enquiry.kids_count > 0 && data) {
    await createKidsForEnquiry(data.id, enquiry.kids_count, kid_names);
  }
}

// General "Contact Us" message — not tied to a specific trip (trip_id left
// null), used by ContactPage.tsx. Kept separate from submitEnquiry/
// BookingFormData because a general enquiry doesn't have age/city/
// emergency_contact/food_preference/terms_accepted to collect. Still goes
// through the same enquiries table and the same error-marker conventions as
// every other insert path here, rather than the page hitting supabase
// directly — see enquiries_contact_message_active_unique in
// add_contact_message_dedupe.sql for why this can also throw
// DUPLICATE_ENQUIRY on an accidental double-submit.
export async function submitContactEnquiry(contact: {
  full_name: string;
  email: string;
  phone?: string;
  message: string;
}): Promise<void> {
  const { error } = await supabase.from('enquiries').insert({
    full_name: contact.full_name.trim(),
    email: contact.email.trim(),
    // enquiries.phone is NOT NULL in the schema, so '' is the "not
    // provided" sentinel here (matches the rest of the app, which treats
    // an empty string the same as absent when building tel:/WhatsApp
    // links) — trimmed so accidental whitespace-only input doesn't count
    // as "provided" either.
    phone: contact.phone?.trim() || '',
    message: contact.message.trim(),
    trip_id: null,
  });
  if (error) {
    if (error.code === '23505') {
      throw new Error('DUPLICATE_ENQUIRY');
    }
    throw error;
  }
}

// Group booking — the public form's "Group" option. Inserts one enquiry row
// per seat (groupSize of them), all carrying the same submitted
// name/phone/email/etc, so each seat still counts individually toward trip
// capacity and can have its own payment/status/cancellation tracked in
// Admin. Rows are tied together with a shared group_id and group_size, and
// group_seq (1..groupSize) is what lets otherwise-identical rows coexist
// under the duplicate-submission unique index — see
// add_group_bookings.sql.
// food_preference is the one exception to "same details on every row" —
// a group can be a mix of veg/non-veg, so it's collected per-seat on the
// form (see BookingForm's group food-preference stepper) and passed here
// as an array of length groupSize, one entry per seat.
export async function submitGroupEnquiry(enquiry: BookingFormData, groupSize: number, foodPreferences: ('veg' | 'non_veg')[]): Promise<void> {
  const groupId = crypto.randomUUID();
  // Same reasoning as submitEnquiry above — kid_names seeds the `kids`
  // table separately, it's never a column on the `enquiries` rows below.
  const { kid_names, ...enquiryFields } = enquiry;
  const rows = Array.from({ length: groupSize }, (_, i) => ({
    ...enquiryFields,
    food_preference: foodPreferences[i],
    group_id: groupId,
    group_size: groupSize,
    group_seq: i + 1,
    // Kids travelling with the group are a single shared headcount for
    // the whole booking, not per-seat — only the lead row (group_seq = 1)
    // carries it, so the DB's auto-pricing trigger (see
    // add_trip_kids_option.sql) prices it once instead of once per seat.
    kids_count: i === 0 ? enquiry.kids_count : 0,
  }));
  const { data, error } = await supabase.from('enquiries').insert(rows).select('id, group_seq');
  if (error) {
    if (error.code === '23505') {
      throw new Error('DUPLICATE_ENQUIRY');
    }
    if (isAgeNotEligibleError(error)) {
      throw new Error('AGE_NOT_ELIGIBLE');
    }
    if (isSeatsUnavailableError(error)) {
      throw new Error('SEATS_UNAVAILABLE');
    }
    throw error;
  }
  // Same lead-row-only rule as kids_count/kids_amount above — the kid
  // records live on whichever inserted row actually carries the headcount.
  const leadRow = data?.find(r => r.group_seq === 1);
  if (enquiry.kids_count > 0 && leadRow) {
    await createKidsForEnquiry(leadRow.id, enquiry.kids_count, kid_names);
  }
}

// Live, uncached snapshot of one trip's seat numbers — queried right before
// a booking submission decides enquiry-vs-waitlist, instead of trusting
// whatever was true when the trip page first loaded. Mirrors the same
// total/booked/waitlist-reserved math getUpcomingTrips() and
// getUpcomingTripBySlug() use for the public "seats left" figure (see
// publicSeatsLeft() in utils/utils-index.ts), just re-fetched fresh at
// submit time. This closes most of the "two people submit against the same
// stale seats-left number" race; the SEATS_UNAVAILABLE DB trigger (see
// add_enquiry_capacity_enforcement.sql) is the hard backstop for whatever's
// left of that window. Returns null on any fetch failure so callers can
// fall back to their existing cached number rather than blocking submission.
export async function getTripSeatSnapshot(
  tripId: string
): Promise<{ totalSeats: number | null; seatsBooked: number; waitlistReserved: number } | null> {
  const [{ data, error }, reservedCounts] = await Promise.all([
    supabase.from('upcoming_trips').select('total_seats, seats_booked').eq('id', tripId).single(),
    getWaitlistReservedCounts(),
  ]);
  if (error || !data) return null;
  return {
    totalSeats: data.total_seats,
    seatsBooked: data.seats_booked,
    waitlistReserved: reservedCounts[tripId] || 0,
  };
}

// Manual enquiry entry — for walk-ins, phone calls, WhatsApp messages, etc.
// that never came through the website's booking form. If an amount is paid
// up front, this books a seat, logs it to the payments ledger, and sets
// status/booking_status/is_paid the same way recordPayment does above.
export async function createManualEnquiry(
  enquiry: Partial<Enquiry>,
  paymentOptions?: { payment_method?: string; utr_number?: string }
): Promise<Enquiry> {
  const amountPaid = enquiry.amount_paid || 0;
  const totalAmount = enquiry.total_amount ?? null;
  if (amountPaid < 0) {
    throw new Error('Amount paid cannot be negative.');
  }
  if (totalAmount != null && totalAmount > 0 && amountPaid > totalAmount) {
    throw new Error("Amount paid can't exceed the total amount.");
  }
  const isPaidFull = !!totalAmount && amountPaid >= totalAmount;
  const status = computeAutoStatus(amountPaid, totalAmount, enquiry.status || 'new');
  const bookingStatus = computeBookingStatus(
    amountPaid,
    totalAmount,
    enquiry.booking_amount || 0,
    enquiry.balance_due_date,
    undefined
  );
  // journey_stage computed as if amount_paid were already 0 (the ledger
  // insert below, if any, is refreshed via refreshJourneyStage afterwards).
  const journeyStage = computeJourneyStage({
    status,
    amount_paid: 0,
    total_amount: totalAmount,
    booking_amount: enquiry.booking_amount || 0,
    balance_due_date: enquiry.balance_due_date,
    checked_in_at: null,
    booking_status: bookingStatus,
  });

  // Don't insert amount_paid directly if we're about to log it to the
  // ledger — let the trigger set it, so the two never drift apart.
  const rest = { ...enquiry };
  delete rest.amount_paid;
  const { data, error } = await supabase
    .from('enquiries')
    .insert({ ...rest, amount_paid: 0, is_paid: isPaidFull, status, booking_status: bookingStatus, journey_stage: journeyStage, booking_state: 'active' })
    .select()
    .single();
  if (error) {
    if (error.code === '23505') {
      throw new Error('DUPLICATE_ENQUIRY');
    }
    if (isAgeNotEligibleError(error)) {
      throw new Error('AGE_NOT_ELIGIBLE');
    }
    throw error;
  }

  // Same lead-row-only rule as the public booking form's group path —
  // kids_count is only ever meaningful on group_seq 1 (defaults to 1 for
  // a solo manual entry). No per-name collection in this admin flow yet,
  // so these seed as nameless rows (same as a pre-add_kids_table.sql
  // backfilled booking) — an admin can name them from the Kids card
  // afterwards.
  if ((enquiry.kids_count || 0) > 0 && (enquiry.group_seq ?? 1) === 1) {
    await createKidsForEnquiry(data.id, enquiry.kids_count || 0);
  }

  if (amountPaid > 0) {
    const { error: paymentError } = await supabase.from('payments').insert({
      enquiry_id: data.id,
      amount: amountPaid,
      payment_type: isPaidFull ? 'full_payment' : 'advance',
      payment_method: paymentOptions?.payment_method,
      utr_number: paymentOptions?.utr_number || null,
      notes: 'Initial payment recorded at enquiry creation',
    });
    if (paymentError) {
      // The enquiry row above was already committed — it's a separate
      // insert, not one transaction with this payment. If logging the
      // payment fails (most commonly: the trip filled up in between and
      // the enforce_trip_capacity DB trigger rejected it), don't leave
      // that bare, unpaid enquiry behind as an orphan that then shows up
      // in the list on its own. Delete it and surface the real error.
      // Retry the cleanup once if the first attempt fails (e.g. transient
      // network hiccup) — an orphaned unpaid enquiry is worse than a
      // slightly longer error path.
      const cleanup = () => supabase.from('enquiries').delete().eq('id', data.id);
      const { error: deleteError } = await cleanup();
      if (deleteError) {
        console.error('Orphan cleanup failed, retrying:', deleteError);
        await cleanup();
      }
      throw paymentError;
    }
    // Re-fetch: inserting the payment above cascades, via DB triggers, into
    // both enquiries.amount_paid and the trip's seats_booked count being
    // recomputed from real data — no manual seat adjustment needed here.
    // Also brings journey_stage in line with the real amount_paid, which
    // may put it a stage further along than the pre-payment value computed
    // above (e.g. straight to 'confirmed'/'fully_paid').
    return refreshJourneyStage(data.id);
  }

  return data;
}
