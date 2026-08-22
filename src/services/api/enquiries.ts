import { supabase } from '../supabase';
import { formatPrice } from '../../utils/utils-index';
import type { Enquiry, BookingFormData, JourneyStage, ContactOutcome, CancellationReason, ActivityLogEntry, Payment, BookingFollowUpType } from '../../types/types-index';
import { getWaitlistReservedCounts } from './trips';

// =============================================
// Enquiries
// =============================================
// True when a Postgres error is the enforce_trip_age_eligibility trigger's
// rejection (see add_trip_age_eligibility_enforcement.sql) rather than some
// other failure. That trigger raises a plain 'AGE_NOT_ELIGIBLE' marker
// message (default SQLSTATE — not a dedicated code like the 23505 unique
// violations below), so it's matched on message text instead of error.code.
export function isAgeNotEligibleError(error: { message?: string }): boolean {
  return !!error.message?.includes('AGE_NOT_ELIGIBLE');
}

// The enforce_enquiry_capacity_or_waitlist() DB trigger (see
// add_enquiry_capacity_enforcement.sql) raises a plain 'SEATS_UNAVAILABLE'
// marker — not a dedicated SQLSTATE — when a plain enquiry insert (or a
// group's worth of them) would exceed the trip's real, live seat count.
// This is the hard backstop behind getTripSeatSnapshot()'s pre-submit
// re-check below: even if two people submit within the same instant, only
// as many as actually fit get through as real enquiries — the rest get
// this error and the caller routes them to the waitlist instead. Matched
// on message text, same pattern as isAgeNotEligibleError above.
function isSeatsUnavailableError(error: { message?: string }): boolean {
  return !!error.message?.includes('SEATS_UNAVAILABLE');
}

// =============================================
// Activity Timeline (CRM spec section 14)
// =============================================
// One append-only insert per meaningful admin action — "Website enquiry
// submitted" is logged separately, straight from the DB (see
// log_enquiry_created_activity() / on_enquiry_created_log_activity in
// add_activity_log.sql), since it has to fire from both the authenticated
// admin portal (createManualEnquiry) and the anonymous public form
// (submitEnquiry/submitGroupEnquiry) — this helper only covers the
// admin-portal side.
//
// Deliberately best-effort: a logging failure is caught and console.error'd
// rather than thrown, so a transient activity_log insert problem can never
// block the real action (recording a payment, checking someone in, ...) it
// was describing. The trade-off is an occasional gap in the timeline rather
// than a blocked booking — the right side to fail open on.
// Local, log-message-only label map — deliberately NOT importing
// INVOICE_TYPE_LABEL from admin/AdminEnquiryCommon.tsx here: that file is UI
// layer (and itself imports from this services file), so pulling it in
// here would be a layering violation risking a circular import. This is
// intentionally a smaller, log-copy-specific set of labels, not a shared
// source of truth for the admin UI's own invoice-type labels.
const PAYMENT_TYPE_LOG_LABEL: Record<string, string> = {
  advance: 'Advance',
  balance: 'Balance payment',
  installment: 'Installment',
  full_payment: 'Full payment',
  booking_amount: 'Booking amount',
  extra_charge: 'Extra charge',
  refund: 'Refund',
};

export async function logActivity(enquiryId: string, action: string, details?: string | null): Promise<void> {
  const { error } = await supabase
    .from('activity_log')
    .insert({ enquiry_id: enquiryId, action, details: details || null });
  if (error) console.error('logActivity failed:', action, error);
}

// Full, chronological (oldest first) activity timeline for one enquiry —
// powers the read-only "Activity Timeline" section on AdminEnquiryDetail.
// Nothing in this table is ever updated or deleted (enforced by RLS: no
// UPDATE/DELETE policy exists on activity_log at all), so what this
// returns is always the complete, honest history.
export async function getActivityLog(enquiryId: string): Promise<ActivityLogEntry[]> {
  const { data, error } = await supabase
    .from('activity_log')
    .select('*')
    .eq('enquiry_id', enquiryId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

// The (trip_id, name, phone, email) unique constraint (active enquiries
// only — cancelled ones are excluded) means an exact literal re-submission
// throws a Postgres 23505. Surfaced as a distinct error so the UI can show
// "you've already enquired" instead of a generic failure. Deliberately
// keyed on all three fields together (not email/phone alone) so a family
// booking several seats through one shared contact still works fine.
export async function submitEnquiry(enquiry: BookingFormData): Promise<void> {
  const { error } = await supabase.from('enquiries').insert(enquiry);
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
  const rows = Array.from({ length: groupSize }, (_, i) => ({
    ...enquiry,
    food_preference: foodPreferences[i],
    group_id: groupId,
    group_size: groupSize,
    group_seq: i + 1,
  }));
  const { error } = await supabase.from('enquiries').insert(rows);
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

export async function getEnquiries(): Promise<Enquiry[]> {
  const { data, error } = await supabase
    .from('enquiries')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// closedReason is only ever written when status is 'closed'; every other
// status value (including reopening back to 'new') clears closed_reason
// back to null so it never lingers on a re-opened or since-progressed
// enquiry — see add_closed_reason.sql and enquiries_closed_reason_requires_closed_status.
export async function updateEnquiryStatus(
  id: string,
  status: Enquiry['status'],
  closedReason?: Enquiry['closed_reason']
): Promise<void> {
  const { error } = await supabase
    .from('enquiries')
    .update({ status, closed_reason: status === 'closed' ? (closedReason ?? null) : null })
    .eq('id', id);
  if (error) throw error;
  await refreshJourneyStage(id);
  await logActivity(
    id,
    status === 'closed' ? 'Lead closed' : status === 'contacted' ? 'Lead reopened' : `Lead status → ${status}`,
    status === 'closed' && closedReason ? closedReason.replace(/_/g, ' ') : null
  );
}

// The one entry point for the "Record Contact Outcome" popup — this is how
// a lead is meant to move from New to Contacted (see nextManualAction /
// ContactOutcomeModal.tsx), and how a Contacted lead's next call attempt is
// logged. Deliberately a single atomic update, not a call to
// updateEnquiryStatus + setEnquiryFollowUp in sequence, so status never
// visibly settles on 'contacted' with a stale/missing outcome if the second
// call were to fail — the popup only ever reflects "saved" or "not saved",
// never a half-saved state (see the "Status must NEVER become Contacted
// until popup is successfully saved" rule this implements).
//
// Branching mirrors CONTACT_OUTCOME_CONFIG.effect in AdminEnquiryCommon.tsx:
//   - interested            -> status 'contacted', journey_stage advances
//                               towards Advance Pending as soon as the
//                               caller opens Track Payment and total_amount
//                               is set (this call alone only gets it to
//                               Contacted — see computeJourneyStage).
//   - needs_time/call_later/
//     no_response            -> status 'contacted', follow_up_at/time set.
//   - not_interested/
//     wrong_number           -> status 'closed', closed_reason set
//                               ('wrong_number' is forced for that outcome
//                               regardless of what's passed in).
export async function recordContactOutcome(
  id: string,
  args: {
    outcome: ContactOutcome;
    notes?: string | null;
    followUpAt?: string | null;
    followUpTime?: string | null;
    closedReason?: Enquiry['closed_reason'];
  }
): Promise<Enquiry> {
  const isClosed = args.outcome === 'not_interested' || args.outcome === 'wrong_number';
  const patch: Record<string, unknown> = {
    status: isClosed ? 'closed' : 'contacted',
    closed_reason: isClosed
      ? (args.outcome === 'wrong_number' ? 'wrong_number' : (args.closedReason ?? null))
      : null,
    follow_up_at: isClosed ? null : (args.followUpAt || null),
    follow_up_time: isClosed ? null : (args.followUpTime || null),
    last_contact_outcome: args.outcome,
    last_contact_notes: args.notes?.trim() || null,
    last_contact_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('enquiries').update(patch).eq('id', id);
  if (error) throw error;
  const updated = await refreshJourneyStage(id);
  const outcomeLabel = args.outcome.replace(/_/g, ' ');
  await logActivity(
    id,
    'Contact outcome recorded',
    [outcomeLabel, args.notes?.trim() || null].filter(Boolean).join(' · ') || null
  );
  return updated;
}

// Corrects who/what an enquiry is actually about — full name, contact
// details, and which trip it's linked to — for when an admin logged the
// right enquiry against the wrong person (typo'd name/phone/email, picked
// the wrong trip, etc). Deliberately separate from recordPayment/
// createManualEnquiry: this never touches money, status, or journey_stage,
// it only fixes the traveller-identity fields, so it can't accidentally
// re-trigger booking/payment side effects. trip_id is included since
// "wrong trip" is the same class of mistake as "wrong name" here; if it
// changes, any already-tracked total_amount/package_type is left as-is —
// re-open Track Payment afterwards if the new trip's price differs.
export async function updateEnquiryDetails(
  id: string,
  fields: {
    full_name?: string;
    email?: string;
    phone?: string;
    city?: string | null;
    age?: number | null;
    trip_id?: string | null;
    // trip_title is snapshotted on the row at submit time (see
    // AdminEnquiries.tsx), not looked up live from trip_id — so changing
    // trip_id here must also pass the new trip's title, or the row ends up
    // pointing at one trip while displaying another's name everywhere the
    // snapshot (not a join) is what's shown.
    trip_title?: string | null;
    source?: Enquiry['source'];
  }
): Promise<Enquiry> {
  const patch: Record<string, unknown> = {};
  if (fields.full_name !== undefined) {
    const trimmed = fields.full_name.trim();
    if (!trimmed) throw new Error('Name cannot be empty.');
    patch.full_name = trimmed;
  }
  if (fields.email !== undefined) patch.email = fields.email.trim();
  if (fields.phone !== undefined) {
    const trimmed = fields.phone.trim();
    if (!trimmed) throw new Error('Phone cannot be empty.');
    patch.phone = trimmed;
  }
  if (fields.city !== undefined) patch.city = fields.city || null;
  if (fields.age !== undefined) patch.age = fields.age;
  if (fields.trip_id !== undefined) patch.trip_id = fields.trip_id || null;
  if (fields.trip_title !== undefined) patch.trip_title = fields.trip_title || null;
  if (fields.source !== undefined) patch.source = fields.source;

  const { data, error } = await supabase
    .from('enquiries')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error('updateEnquiryDetails failed:', error.code, error.message, error.details, error.hint);
    if (error.code === '23505') {
      throw new Error('DUPLICATE_ENQUIRY');
    }
    if (isAgeNotEligibleError(error)) {
      throw new Error('AGE_NOT_ELIGIBLE');
    }
    throw new Error(error.message || 'Failed to update enquiry details.');
  }
  return data;
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

// Pure derivation of the single "Booking Journey" stage shown in the admin
// table, from the same underlying columns computeAutoStatus/
// computeBookingStatus already read — see add_booking_journey_stage.sql for
// the full rationale on why each branch is ordered the way it is.
//
// Deliberately does NOT special-case cancelled_at (it used to: an earlier
// version returned 'cancelled' as soon as cancelled_at was set, which
// overwrote the stage the booking had actually reached — see
// add_booking_state.sql). Cancellation is tracked independently in
// Enquiry.booking_state instead, so this always reports the highest
// legitimate stage reached, cancelled or not — matching the CRM spec's
// "Fully Paid + Cancelled -> Journey remains Fully Paid, State becomes
// Cancelled" rule. booking_status === 'completed' is checked first (that's
// admin-explicit, never something a payment alone can undo).
function computeJourneyStage(e: {
  status: Enquiry['status'];
  amount_paid: number;
  total_amount?: number | null;
  booking_amount: number;
  balance_due_date?: string | null;
  checked_in_at?: string | null;
  booking_status?: Enquiry['booking_status'];
}): JourneyStage {
  if (e.booking_status === 'completed') return 'completed';
  if (e.checked_in_at) return 'checked_in';
  if (e.total_amount && e.total_amount > 0 && e.amount_paid >= e.total_amount) return 'fully_paid';
  if (
    e.amount_paid > 0 &&
    e.balance_due_date &&
    new Date(e.balance_due_date) < new Date() &&
    (!e.total_amount || e.amount_paid < e.total_amount)
  ) {
    return 'balance_pending';
  }
  if (e.booking_amount > 0 && e.amount_paid >= e.booking_amount) return 'confirmed';
  if (e.amount_paid > 0) return 'advance_paid';
  // A lead an admin closed out as "not interested" after contacting (or
  // without ever contacting) — no money ever landed on it, so it's not a
  // Cancelled booking, and status !== 'contacted' means it can't fall into
  // either of the two branches below either. Without this, a closed lead
  // silently fell all the way through to 'new_enquiry'. See
  // add_not_interested_journey_stage.sql / isNotInterested() in
  // AdminEnquiryCommon.tsx for the full rationale.
  if (e.status === 'closed') return 'not_interested';
  if (e.status === 'contacted' && e.total_amount) return 'advance_pending';
  if (e.status === 'contacted') return 'contacted';
  return 'new_enquiry';
}

// Re-reads an enquiry's current columns and writes the journey_stage they
// derive to, if it's changed. Every mutating enquiry path below that can
// possibly move the journey forward (or back to 'cancelled') calls this
// once it's done, instead of trying to compute the new stage inline from
// values that might not reflect what a DB trigger just wrote.
async function refreshJourneyStage(enquiryId: string): Promise<Enquiry> {
  const { data: e, error } = await supabase
    .from('enquiries')
    .select('*')
    .eq('id', enquiryId)
    .single();
  if (error) throw error;

  const stage = computeJourneyStage(e);
  // booking_state is normally kept in sync by the on_enquiry_cancelled DB
  // trigger the moment cancelled_at changes (see add_booking_state.sql).
  // Recomputed here too, defensively, so a row read before that trigger
  // has run (or a legacy row from before the migration) still shows the
  // right value without needing a second round-trip.
  const bookingState: Enquiry['booking_state'] = e.cancelled_at ? 'cancelled' : 'active';

  // follow_up_at (see add_enquiry_follow_up.sql) is only meaningful while
  // the lead is still a live, pre-booked conversation — the DB's own check
  // constraint enforces status === 'contacted', which covers 'contacted',
  // 'advance_pending', and 'advance_paid' (status only flips off
  // 'contacted' once amount_paid reaches total_amount — see
  // computeAutoStatus above). Kept in sync with canSetFollowUp() in
  // AdminEnquiryCommon.tsx. Every mutating path that can move a lead past that
  // point (booking confirmed, fully paid, closed as Not Interested,
  // reopened, cancelled, etc.) already routes through here, so this is the
  // one place a stale reminder needs clearing rather than every call site
  // remembering to do it individually.
  const stillFollowable = stage === 'contacted' || stage === 'advance_pending' || stage === 'advance_paid';
  const clearFollowUp = (!!e.follow_up_at || !!e.follow_up_time) && !stillFollowable;

  // Booking Follow-up (see add_booking_follow_up.sql) is only meaningful
  // once a booking has actually started (past Advance Pending) and while
  // it's still active — the DB's own check constraint enforces both, this
  // is the same defensive belt-and-suspenders clear as clearFollowUp
  // above, on the mirror-image window.
  const stillBookingFollowable = bookingState === 'active' && (
    stage === 'advance_pending' || stage === 'advance_paid' || stage === 'confirmed'
    || stage === 'balance_pending' || stage === 'fully_paid' || stage === 'checked_in'
  );
  const clearBookingFollowUp = !!e.booking_follow_up_at && !stillBookingFollowable;

  if (stage === e.journey_stage && bookingState === e.booking_state && !clearFollowUp && !clearBookingFollowUp) return e;

  const patch: Record<string, unknown> = {};
  if (stage !== e.journey_stage) patch.journey_stage = stage;
  if (bookingState !== e.booking_state) patch.booking_state = bookingState;
  if (clearFollowUp) {
    patch.follow_up_at = null;
    patch.follow_up_time = null;
  }
  if (clearBookingFollowUp) {
    patch.booking_follow_up_at = null;
    patch.booking_follow_up_time = null;
    patch.booking_follow_up_type = null;
    patch.booking_follow_up_notes = null;
  }

  const { data, error: updateError } = await supabase
    .from('enquiries')
    .update(patch)
    .eq('id', enquiryId)
    .select()
    .single();
  if (updateError) throw updateError;
  return data;
}

// Sets or clears the follow-up reminder date on a Contacted lead that's
// still warm but not ready to act on — "checking with family, call back
// Aug 15". Deliberately separate from updateEnquiryStatus: this never
// touches status/journey_stage itself, it's a reminder layered on top of
// wherever the lead already sits (see canSetFollowUp/followUpStatus in
// AdminEnquiryCommon.tsx). The DB check constraint only allows a non-null value
// while status = 'contacted' — refreshJourneyStage() clears it back to
// null automatically once the lead moves on, so nothing else needs to.
export async function setEnquiryFollowUp(id: string, followUpAt: string | null): Promise<void> {
  const { error } = await supabase
    .from('enquiries')
    // Clearing the date must also clear the time (see
    // enquiries_follow_up_time_requires_date in add_contact_outcome.sql) —
    // this modal only ever edits the date, so a time set earlier via the
    // Contact Outcome popup would otherwise be left dangling.
    .update(followUpAt ? { follow_up_at: followUpAt } : { follow_up_at: null, follow_up_time: null })
    .eq('id', id);
  if (error) throw error;
}

// Sets or clears the Booking Follow-up reminder (CRM spec section 8B) —
// the post-booking counterpart to setEnquiryFollowUp above, for things
// like a balance-payment or passport reminder rather than a warm-lead
// callback. Deliberately its own function/fields (booking_follow_up_*)
// rather than reusing follow_up_at: the two windows (before vs after
// Advance Pending) never overlap, enforced by the DB check constraints in
// add_booking_follow_up.sql, and this never touches journey_stage/status
// either. Passing null for `at` clears all four fields together — a type
// or note without a date is meaningless (see
// enquiries_booking_follow_up_type_requires_date).
export async function setBookingFollowUp(
  id: string,
  at: string | null,
  fields?: { time?: string | null; type?: BookingFollowUpType | null; notes?: string | null }
): Promise<void> {
  const { error } = await supabase
    .from('enquiries')
    .update(
      at
        ? {
            booking_follow_up_at: at,
            booking_follow_up_time: fields?.time || null,
            booking_follow_up_type: fields?.type || null,
            booking_follow_up_notes: fields?.notes || null,
          }
        : {
            booking_follow_up_at: null,
            booking_follow_up_time: null,
            booking_follow_up_type: null,
            booking_follow_up_notes: null,
          }
    )
    .eq('id', id);
  if (error) throw error;
}

// Manually advances an enquiry to 'checked_in' — the one journey stage with
// no payment/status signal to derive it from. Only meaningful once the
// booking is fully paid (checking in someone who still owes money is a
// front-desk/ops decision, not blocked here, but the button that calls this
// only appears once journey_stage is already 'fully_paid').
// Stamps checked_in_at, moving Attendance to "Checked In" (CRM spec section
// 4) without touching Booking Journey or Booking State — those stay exactly
// as they were. Gated per spec section 18's Check-In Rules: only a booking
// that's Active, Fully Paid, and hasn't already started its Attendance
// timeline (not already checked in, not a no-show) can be checked in. The
// UI already hides the Check In action outside these conditions (see
// nextManualAction/buildRowActions), but this is the one choke point every
// check-in path calls, so it's guarded here too rather than trusted to the
// UI alone.
export async function checkInEnquiry(enquiry: Enquiry): Promise<Enquiry> {
  if (enquiry.cancelled_at || enquiry.booking_state === 'cancelled') {
    throw new Error('Cannot check in — this booking has been cancelled.');
  }
  if (enquiry.journey_stage !== 'fully_paid') {
    throw new Error(
      enquiry.journey_stage === 'checked_in' || enquiry.journey_stage === 'completed'
        ? 'This traveller is already checked in.'
        : 'Cannot check in because the balance payment is still pending.'
    );
  }
  if (enquiry.is_no_show) {
    throw new Error('Cannot check in — this booking is marked as a no-show. Undo the no-show first.');
  }
  // §26: trip attendance point must have been reached before check-in is allowed.
  if (enquiry.trip_id) {
    const { data: trip } = await supabase
      .from('upcoming_trips')
      .select('departure_date')
      .eq('id', enquiry.trip_id)
      .single();
    if (trip?.departure_date) {
      const tripDate = new Date(trip.departure_date);
      tripDate.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (tripDate > today) {
        throw new Error('Cannot check in yet — the trip has not started. Check-in is available from the departure date onward.');
      }
    }
  }

  const { error } = await supabase
    .from('enquiries')
    .update({ checked_in_at: new Date().toISOString() })
    .eq('id', enquiry.id);
  if (error) throw error;
  const updated = await refreshJourneyStage(enquiry.id);
  await logActivity(enquiry.id, 'Checked In');
  return updated;
}

// Undoes an accidental check-in. Deliberately no eligibility guard beyond
// "there's a check-in to undo" — this is a correction path (e.g. an admin
// checked in the wrong row, or needs to reverse a check-in specifically so
// they can Mark No Show instead, per spec section 18's "Checked In: Mark No
// Show only if check-in is reversed" rule), not a forward business
// transition, so it doesn't need the same prerequisites checkInEnquiry does.
export async function undoCheckInEnquiry(enquiryId: string): Promise<Enquiry> {
  const { error } = await supabase
    .from('enquiries')
    .update({ checked_in_at: null })
    .eq('id', enquiryId);
  if (error) throw error;
  const updated = await refreshJourneyStage(enquiryId);
  await logActivity(enquiryId, 'Check-in undone');
  return updated;
}

// Any payment — full or partial — reserves a seat, since a deposit is a
// booking in practice. Status auto-advances: fully paid -> closed,
// partially paid -> contacted. Unpaid (0) never auto-downgrades status,
// so an admin's manual "closed"/"contacted" note isn't silently undone.
function computeAutoStatus(
  amountPaid: number,
  totalAmount: number | null | undefined,
  currentStatus: Enquiry['status']
): Enquiry['status'] {
  if (totalAmount && totalAmount > 0 && amountPaid >= totalAmount) return 'closed';
  if (amountPaid > 0) return 'contacted';
  return currentStatus;
}

// Booking/payment lifecycle — a separate dimension from the lead `status`
// above. Never downgrades away from 'cancelled' or 'completed' here; those
// are set explicitly (cancelled via the DB trigger on cancelEnquiry,
// completed manually by an admin after the trip wraps).
function computeBookingStatus(
  amountPaid: number,
  totalAmount: number | null | undefined,
  bookingAmount: number,
  balanceDueDate: string | null | undefined,
  current: Enquiry['booking_status']
): Enquiry['booking_status'] {
  if (current === 'cancelled' || current === 'completed') return current;
  if (amountPaid <= 0) return undefined;
  if (totalAmount && totalAmount > 0 && amountPaid >= totalAmount) return 'fully_paid';
  if (bookingAmount > 0 && amountPaid >= bookingAmount && balanceDueDate) {
    return new Date(balanceDueDate) < new Date() ? 'balance_pending' : 'booking_confirmed';
  }
  return 'booking_confirmed';
}

// NOTE: trips.seats_booked is no longer adjusted manually from here. The
// on_enquiries_seat_sync DB trigger recomputes it straight from real
// enquiries data (count of non-cancelled rows with amount_paid > 0) after
// every insert/update/delete on `enquiries` — including the amount_paid
// updates that cascade in from the `payments` table. Keeping a second,
// manual +/-1 adjustment here double-counted every change (e.g. a
// cancellation would free the seat via the trigger AND get decremented
// again by this function), which is what caused seat counts to drift.

// Manually marks a booking's trip as completed once it's wrapped up.
// booking_status only ever reaches 'completed' through this explicit call —
// computeBookingStatus() (used by every payment-driven update above) never
// advances to it on its own, since "the trip happened" isn't something a
// payment event can infer. Guards against completing a booking that's
// currently cancelled (checked via booking_state — see add_booking_state.sql;
// booking_status itself is no longer set to 'cancelled', so it can't be used
// for this check anymore) or one that was never actually booked (no payment
// recorded, so booking_status is still unset).
export async function markEnquiryCompleted(enquiryId: string): Promise<Enquiry> {
  const { data: current, error: fetchError } = await supabase
    .from('enquiries')
    .select('booking_status, booking_state, cancelled_at, journey_stage')
    .eq('id', enquiryId)
    .single();
  if (fetchError) throw fetchError;

  if (current.booking_state === 'cancelled' || current.cancelled_at) {
    throw new Error('This booking was cancelled and cannot be marked completed. Reactivate it first if this was a mistake.');
  }
  if (!current.booking_status) {
    throw new Error('This enquiry has no booking on it yet (no payment recorded), so it cannot be marked completed.');
  }
  if (current.journey_stage !== 'checked_in') {
    throw new Error('This booking must be checked in before it can be marked completed.');
  }

  const { error } = await supabase
    .from('enquiries')
    .update({ booking_status: 'completed' })
    .eq('id', enquiryId);
  if (error) throw error;
  const updated = await refreshJourneyStage(enquiryId);
  await logActivity(enquiryId, 'Completed');
  return updated;
}

// Records a new payment (delta from what's already been paid, not an
// absolute total) against an enquiry. Inserting into the payments ledger
// triggers a DB-side recalculation of enquiries.amount_paid — this function
// never writes amount_paid directly, to avoid it drifting from the ledger.
//
// `newAmountPaid` is the running total after this transaction is applied —
// every caller (bulk edit, manual-enquiry creation, and the Track Payment
// modal) computes it before calling in, so this function only has to do the
// delta math once. Passing a newAmountPaid equal to current.amount_paid is
// a no-op (e.g. saving the form after only changing total_amount/package_type).
//
// `type`, if passed, is an explicit Full Payment/Advance/Balance/Installment
// override — used by the Track Payment modal, which (like Generate Invoice)
// has the admin pick the label directly rather than inferring it. Omitted,
// the label is auto-classified from isFirstPayment/completesTotal below, as
// every other caller of this function still relies on.
export async function recordPayment(
  current: Enquiry,
  payment: {
    amount_paid: number; // new running total, not a delta
    total_amount?: number | null;
    package_type?: Enquiry['package_type'];
    food_preference?: 'veg' | 'non_veg' | null;
    payment_method?: string;
    utr_number?: string;
    notes?: string;
    type?: 'full_payment' | 'advance' | 'balance' | 'installment';
  }
): Promise<Enquiry> {
  const newTotal = payment.total_amount !== undefined ? payment.total_amount : current.total_amount;

  // Server-side bound-checking: the UI validates this too, but recordPayment
  // is the one choke point every payment path (single edit, bulk edit,
  // manual-enquiry creation) eventually calls, so guard here regardless of
  // what a caller passes in. Without this, a typo'd amount_paid inserts a
  // ledger delta straight into `payments` — the DB's amount_paid <=
  // total_amount CHECK constraint only catches it once the sync trigger
  // tries to write the recomputed total back to `enquiries`, by which point
  // the bad ledger row already exists and the update just fails.
  if (payment.amount_paid < 0) {
    throw new Error('Amount paid cannot be negative.');
  }
  if (newTotal != null && newTotal > 0 && payment.amount_paid > newTotal) {
    throw new Error("Amount paid can't exceed the total amount.");
  }

  const delta = payment.amount_paid - (current.amount_paid || 0);

  // Labels this transaction the way the invoice list shows it: the first
  // money in is 'full_payment' if it settles the whole total in one go,
  // otherwise 'advance'; anything after that is 'balance' if it's the
  // payment that brings the booking to fully paid, otherwise 'installment'.
  // Computed once, outside the `delta !== 0` guard below, so the same
  // label is available for both the ledger insert and the activity-log
  // entry further down without going out of scope between them. Skipped
  // entirely when the caller already supplied an explicit type.
  const isFirstPayment = (current.amount_paid || 0) <= 0;
  const completesTotal = !!newTotal && newTotal > 0 && payment.amount_paid >= newTotal;
  const invoiceType = payment.type ?? (isFirstPayment
    ? (completesTotal ? 'full_payment' : 'advance')
    : (completesTotal ? 'balance' : 'installment'));

  if (delta !== 0) {
    const { error: paymentError } = await supabase.from('payments').insert({
      enquiry_id: current.id,
      amount: delta,
      payment_type: invoiceType,
      payment_method: payment.payment_method,
      utr_number: payment.utr_number || null,
      notes: payment.notes,
    });
    if (paymentError) throw paymentError;
  }

  // Re-read the trigger-updated amount_paid so is_paid/status/booking_status
  // are computed from the actual synced value, not assumed from the delta.
  const { data: refreshed, error: refreshError } = await supabase
    .from('enquiries')
    .select('amount_paid, balance_due_date, booking_amount, booking_status')
    .eq('id', current.id)
    .single();
  if (refreshError) throw refreshError;

  // Seat booking follows automatically: the payment insert above already
  // updated enquiries.amount_paid via a DB trigger, which in turn triggers
  // the trip's seats_booked to be recomputed from real data. No manual
  // adjustment needed here.
  const isPaidFull = !!newTotal && newTotal > 0 && refreshed.amount_paid >= newTotal;
  const status = computeAutoStatus(refreshed.amount_paid, newTotal, current.status);
  const bookingStatus = computeBookingStatus(
    refreshed.amount_paid,
    newTotal,
    refreshed.booking_amount,
    refreshed.balance_due_date,
    refreshed.booking_status
  );

  const { error } = await supabase
    .from('enquiries')
    .update({
      total_amount: newTotal,
      package_type: payment.package_type ?? current.package_type,
      food_preference: payment.food_preference !== undefined ? payment.food_preference : current.food_preference,
      is_paid: isPaidFull,
      status,
      booking_status: bookingStatus,
    })
    .eq('id', current.id);
  if (error) throw error;
  const updated = await refreshJourneyStage(current.id);
  if (delta !== 0) {
    await logActivity(
      current.id,
      delta > 0 ? `${PAYMENT_TYPE_LOG_LABEL[invoiceType] || invoiceType} received` : 'Payment adjusted',
      `${formatPrice(Math.abs(delta))}${payment.payment_method ? ` · ${payment.payment_method}` : ''}`
    );
  }
  return updated;
}

// Full payment ledger for one enquiry (booking_amount / installment /
// balance / refund rows), oldest first — the transaction history section
// of the invoice PDF, and also useful for any future "payment history"
// admin view. Distinct from enquiries.amount_paid/refund_amount, which are
// just the running totals this ledger is the source of truth for.
export async function getPaymentsForEnquiry(enquiryId: string): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('enquiry_id', enquiryId)
    .order('paid_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Records one specific, admin-picked invoice type/amount as money already
// collected (status defaults to 'paid' via the DB column default) — unlike
// recordPayment, `amount` here is this transaction's own amount, not a new
// running total, so the admin doesn't have to do the addition themselves
// when generating e.g. an explicit "Advance" or "Balance" invoice from the
// Invoices list. Powers the "Generate Invoice" action for every type except
// extra_charge (see addExtraCharge) and refund (see recordRefund, which
// already has its own dedicated, cancellation-aware flow).
export async function recordTypedPayment(
  current: Enquiry,
  payment: {
    type: 'full_payment' | 'advance' | 'balance' | 'installment';
    amount: number;
    payment_method?: string;
    utr_number?: string;
    notes?: string;
  }
): Promise<Enquiry> {
  if (payment.amount <= 0) {
    throw new Error('Invoice amount must be greater than zero.');
  }
  const prospectiveTotal = (current.amount_paid || 0) + payment.amount;
  if (current.total_amount != null && current.total_amount > 0 && prospectiveTotal > current.total_amount) {
    throw new Error("This would take amount paid past the booking's total amount.");
  }

  const { error: paymentError } = await supabase.from('payments').insert({
    enquiry_id: current.id,
    amount: payment.amount,
    payment_type: payment.type,
    payment_method: payment.payment_method,
    utr_number: payment.utr_number || null,
    notes: payment.notes,
  });
  if (paymentError) throw paymentError;

  // Re-read the trigger-updated amount_paid, same reasoning as recordPayment
  // above — never assume the new total, read back what the sync trigger
  // actually wrote.
  const { data: refreshed, error: refreshError } = await supabase
    .from('enquiries')
    .select('amount_paid, balance_due_date, booking_amount, booking_status, total_amount')
    .eq('id', current.id)
    .single();
  if (refreshError) throw refreshError;

  const isPaidFull = !!refreshed.total_amount && refreshed.total_amount > 0 && refreshed.amount_paid >= refreshed.total_amount;
  const status = computeAutoStatus(refreshed.amount_paid, refreshed.total_amount, current.status);
  const bookingStatus = computeBookingStatus(
    refreshed.amount_paid,
    refreshed.total_amount,
    refreshed.booking_amount,
    refreshed.balance_due_date,
    refreshed.booking_status
  );

  const { error } = await supabase
    .from('enquiries')
    .update({ is_paid: isPaidFull, status, booking_status: bookingStatus })
    .eq('id', current.id);
  if (error) throw error;
  const updated = await refreshJourneyStage(current.id);
  await logActivity(
    current.id,
    `${PAYMENT_TYPE_LOG_LABEL[payment.type] || payment.type} received`,
    `${formatPrice(payment.amount)}${payment.payment_method ? ` · ${payment.payment_method}` : ''}`
  );
  return updated;
}

// Raises an invoice for money that hasn't been collected yet — e.g. a
// Balance or Installment invoice generated ahead of the customer actually
// paying it (Scenario 2/3 in the invoicing flow). Inserted with
// status = 'pending', so sync_enquiry_amount_paid() leaves
// enquiries.amount_paid untouched until markInvoicePaid flips it later.
export async function generatePendingInvoice(
  enquiryId: string,
  type: 'full_payment' | 'advance' | 'balance' | 'installment',
  amount: number,
  notes?: string
): Promise<Payment> {
  if (amount <= 0) {
    throw new Error('Invoice amount must be greater than zero.');
  }
  const { data, error } = await supabase
    .from('payments')
    .insert({ enquiry_id: enquiryId, amount, payment_type: type, status: 'pending', notes })
    .select()
    .single();
  if (error) throw error;
  await logActivity(enquiryId, `Invoice generated · ${PAYMENT_TYPE_LOG_LABEL[type] || type}`, `${formatPrice(amount)} · pending`);
  return data;
}

// Adds an extra charge to an existing booking (e.g. a hotel upgrade) — bumps
// enquiries.total_amount by the charge amount right away, since that's now
// part of what's owed whether or not it's been collected yet, and logs an
// 'extra_charge' invoice for it. Pass collectedNow: true if the customer
// paid on the spot; otherwise the invoice is raised as 'pending' and can be
// settled later via markInvoicePaid.
export async function addExtraCharge(
  current: Enquiry,
  amount: number,
  options?: { collectedNow?: boolean; payment_method?: string; utr_number?: string; notes?: string }
): Promise<Enquiry> {
  if (amount <= 0) {
    throw new Error('Extra charge amount must be greater than zero.');
  }
  const newTotal = (current.total_amount || 0) + amount;

  const { error: totalError } = await supabase
    .from('enquiries')
    .update({ total_amount: newTotal })
    .eq('id', current.id);
  if (totalError) throw totalError;

  const { error: paymentError } = await supabase.from('payments').insert({
    enquiry_id: current.id,
    amount,
    payment_type: 'extra_charge',
    status: options?.collectedNow ? 'paid' : 'pending',
    payment_method: options?.payment_method,
    utr_number: options?.collectedNow ? (options?.utr_number || null) : null,
    notes: options?.notes,
  });
  if (paymentError) throw paymentError;

  const { data, error } = await supabase.from('enquiries').select('*').eq('id', current.id).single();
  if (error) throw error;
  const updated = await refreshJourneyStage(data.id);
  await logActivity(current.id, 'Extra charge added', `${formatPrice(amount)}${options?.collectedNow ? ' · collected' : ' · pending'}`);
  return updated;
}

// Settles a 'pending' invoice (a balance/installment invoice raised ahead of
// collection, or an extra charge not yet paid) once the money actually comes
// in. Flips status to 'paid' and stamps paid_at — the existing
// sync_amount_paid_on_payments_change trigger fires on this UPDATE the same
// way it does on insert, folding the amount into enquiries.amount_paid.
export async function markInvoicePaid(
  paymentId: string,
  options?: { payment_method?: string; utr_number?: string }
): Promise<Payment> {
  // NOTE: this was previously updating the `enquiries` table by paymentId
  // (a payments.id, not an enquiries.id) with columns (`status: 'paid'`,
  // `paid_at`) that don't exist on `enquiries` — every call would fail
  // (either no matching row, or a column-does-not-exist error). `status`/
  // `paid_at`/`payment_method` are payments columns; the intended target
  // was always this row itself. Fixed in place rather than left broken
  // since it's the "Mark Paid" action the Invoice system (spec section 11)
  // depends on.
  const { data, error } = await supabase
    .from('payments')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      ...(options?.payment_method ? { payment_method: options.payment_method } : {}),
      ...(options?.utr_number ? { utr_number: options.utr_number } : {}),
    })
    .eq('id', paymentId)
    .select()
    .single();
  if (error) throw error;
  await refreshJourneyStage(data.enquiry_id);
  await logActivity(data.enquiry_id, 'Invoice marked paid', `${data.payment_type} · ${formatPrice(data.amount)}${data.invoice_number ? ` · ${data.invoice_number}` : ''}`);
  return data;
}

// Cancels an enquiry / booking. Frees the trip seat immediately if one was
// held (amount_paid > 0 and not already cancelled). amount_paid itself is
// untouched — that's the historical record of what they actually paid,
// separate from refund_amount which tracks what's been paid back.
//
// Setting cancelled_at fires a DB trigger that auto-computes
// suggested_refund_amount and sets booking_state to 'cancelled' (journey_stage
// and booking_status are left untouched — see add_booking_state.sql, and
// computeJourneyStage's doc comment for why cancellation no longer
// overwrites the stage a booking had reached) — this is a SUGGESTION only,
// never authoritative; the admin still enters the real refund_amount via
// recordRefund. Pass thirdPartyCharges if known at cancellation time
// (airline/hotel penalties aren't derivable from stored data) so the
// suggestion accounts for them. Pass isNoShow if the admin is cancelling
// *because* the guest was a no-show — the DB trigger forces the suggested
// refund to 0 in that case, per the site's no-refund-for-no-shows policy,
// overriding the normal cancellation-window math.
//
// Refuses to cancel a booking that's already Completed — per the CRM
// spec's "Completed should never become Cancelled" rule, that's not a
// legitimate transition (a completed trip is in the past; use a refund/
// credit note against it instead of cancelling the booking record).
//
// Also refuses once the traveller has actually checked in — spec section
// 18's Cancellation Rules stop at Fully Paid; Checked In explicitly can't
// Cancel Booking ("If a traveller has physically checked in, cancellation
// is no longer allowed"). Undo Check In first if a check-in needs
// reversing before a cancellation can go through.
//
// The trip's seats_booked count frees up on its own: the
// on_enquiries_seat_sync DB trigger recomputes it from real enquiries data
// right after this update commits, so no manual adjustment is made here.
//
// reason/notes capture *why* the booking was cancelled (CRM spec section
// 10's Cancellation Reason + Notes) — see CancellationReason in
// types-index.ts and add_cancellation_reason.sql. Both are optional so
// existing callers (and a bulk/legacy cancel with no reason picked) keep
// working; the DB constraint only requires they be null when the booking
// isn't cancelled, not that a cancelled booking has one.
export async function cancelEnquiry(
  enquiry: Enquiry,
  thirdPartyCharges?: number,
  isNoShow?: boolean,
  reason?: CancellationReason,
  notes?: string
): Promise<Enquiry> {
  if (enquiry.journey_stage === 'completed' || enquiry.booking_status === 'completed') {
    throw new Error('A completed booking can\u2019t be cancelled.');
  }
  if (enquiry.checked_in_at) {
    throw new Error('This traveller has already checked in — cancellation is no longer allowed. Undo Check In first if that was a mistake.');
  }
  // Spec section 18's Cancellation Rules: cancelling only makes sense once
  // a booking has actually started (past Advance Pending) — a lead that
  // hasn't agreed to book yet has nothing to cancel. Mirrors
  // canCancelBooking() in AdminEnquiryCommon.tsx, which already keeps the
  // button hidden in this state; this is the server-side backstop.
  if (
    enquiry.journey_stage === 'new_enquiry' || enquiry.journey_stage === 'contacted'
    || enquiry.journey_stage === 'not_interested'
  ) {
    throw new Error('Cannot cancel — this lead hasn\u2019t agreed to book yet.');
  }

  if (thirdPartyCharges !== undefined) {
    const { error: chargesError } = await supabase
      .from('enquiries')
      .update({ third_party_charges: thirdPartyCharges })
      .eq('id', enquiry.id);
    if (chargesError) throw chargesError;
  }

  const { error } = await supabase
    .from('enquiries')
    .update({
      cancelled_at: new Date().toISOString(),
      ...(isNoShow !== undefined ? { is_no_show: isNoShow } : {}),
      cancellation_reason: reason ?? null,
      cancellation_notes: notes?.trim() ? notes.trim() : null,
    })
    .eq('id', enquiry.id);
  if (error) throw error;

  const updated = await refreshJourneyStage(enquiry.id);
  await logActivity(
    enquiry.id,
    'Cancelled',
    [reason?.replace(/_/g, ' ') || null, notes?.trim() || null].filter(Boolean).join(' · ') || null
  );
  return updated;
}

// Toggles is_no_show on its own, independent of cancellation — an admin may
// only realize/decide a booking was a no-show after the fact (e.g. once the
// trip has already departed), whether or not the booking was ever formally
// cancelled. The on_enquiry_cancelled DB trigger reacts to this update and
// recomputes suggested_refund_amount: forced to 0 while is_no_show is true,
// or back to the normal cancellation-window math when unmarked.
//
// Marking a no-show (isNoShow: true) is gated per spec section 18's No Show
// Rules — Active + Fully Paid + Attendance not already started (not
// checked in, not already a no-show) + the trip date has actually arrived.
// Un-marking (isNoShow: false) is a correction path, same reasoning as
// undoCheckInEnquiry, so it isn't gated the same way.
export async function setEnquiryNoShow(enquiry: Enquiry, isNoShow: boolean): Promise<Enquiry> {
  if (isNoShow) {
    if (enquiry.cancelled_at || enquiry.booking_state === 'cancelled') {
      throw new Error('Cannot mark no-show — this booking has been cancelled.');
    }
    if (enquiry.journey_stage !== 'fully_paid') {
      throw new Error('Cannot mark no-show — this booking has to be Fully Paid first.');
    }
    if (enquiry.checked_in_at) {
      throw new Error('Cannot mark no-show — this traveller is already checked in. Undo the check-in first.');
    }
    if (enquiry.is_no_show) {
      throw new Error('Already marked as a no-show.');
    }
    if (enquiry.departure_date) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (new Date(enquiry.departure_date) > today) {
        throw new Error("Cannot mark no-show before the trip's departure date.");
      }
    }
  }

  const { data, error } = await supabase
    .from('enquiries')
    .update({ is_no_show: isNoShow })
    .eq('id', enquiry.id)
    .select()
    .single();
  if (error) throw error;

  await logActivity(enquiry.id, isNoShow ? 'Marked No Show' : 'No Show undone');
  return data;
}

// Hard-deletes an enquiry and every piece of data tied to it — matches the
// confirm-dialog copy admins actually see ("permanently removes... cannot
// be undone"). Routed through the delete_enquiry_cascade RPC (see
// add_enquiry_hard_delete_cascade.sql) rather than a plain client-side
// `.delete()`, because that migration's comment explains: activity_log has
// no DELETE policy anywhere (by design, so logged rows are never removable
// through the ordinary API), and payments.enquiry_id/activity_log.enquiry_id
// cascading on the enquiries delete would otherwise get blocked by that
// RLS gap. The RPC runs as SECURITY DEFINER to get past that for this one
// controlled path, deleting:
//  - the enquiry row itself
//  - its payments (cascade)
//  - its activity log (cascade)
//  - unlinking (not deleting) any waitlist entry that had converted into it
//  - freeing its seat, via on_enquiries_seat_sync firing on DELETE
// This is a different, deliberately softer path than
// deleteUpcomingTripCascade/deleteCompletedTripCascade above, which
// soft-delete (deleted_at) enquiries when a whole trip/album is removed
// specifically to keep that accounting ledger recoverable. This function is
// only for an admin explicitly deleting one enquiry (or a bulk selection)
// from the Enquiries screen, where "permanently removes" is what's promised
// and hard-delete is what should happen.
export async function deleteEnquiry(enquiry: Enquiry): Promise<void> {
  const { error } = await supabase.rpc('delete_enquiry_cascade', {
    p_enquiry_id: enquiry.id,
  });
  if (error) throw error;
}


// Re-books the seat if they'd already paid something. Since booking_status
// is no longer overwritten on cancellation (see add_booking_state.sql), it
// still reflects the stage the booking had reached before it was
// cancelled — including 'completed', which computeBookingStatus can't
// derive from amount/dates alone — so this only recomputes it when it
// wasn't already something legitimate (a defensive fallback for legacy
// rows cancelled before this migration, where booking_status really was
// stomped to 'cancelled'). Re-booking a seat this way is still
// capacity-checked by the enforce_trip_capacity DB trigger, and
// seats_booked is recomputed by on_enquiries_seat_sync right after — no
// manual adjustment needed here.
export async function uncancelEnquiry(enquiry: Enquiry): Promise<Enquiry> {
  const bookingStatus = enquiry.booking_status && enquiry.booking_status !== 'cancelled'
    ? enquiry.booking_status
    : computeBookingStatus(
        enquiry.amount_paid,
        enquiry.total_amount,
        enquiry.booking_amount,
        enquiry.balance_due_date,
        undefined // force recompute rather than trusting the legacy 'cancelled' value
      );

  const { error } = await supabase
    .from('enquiries')
    .update({
      cancelled_at: null,
      booking_state: 'active',
      booking_status: bookingStatus,
      suggested_refund_amount: null,
      // Cleared on reactivation, same pattern as closed_reason on reopening
      // — a reason for a cancellation that no longer stands shouldn't
      // linger (see add_cancellation_reason.sql).
      cancellation_reason: null,
      cancellation_notes: null,
    })
    .eq('id', enquiry.id);
  if (error) throw error;

  const updated = await refreshJourneyStage(enquiry.id);
  await logActivity(enquiry.id, 'Reactivated (cancellation reversed)');
  return updated;
}

// Logs how much has been refunded so far for a cancelled booking.
// `newRefundAmount` is the running total (matching recordPayment's pattern)
// — this inserts a ledger row for the delta rather than overwriting
// refund_amount directly, so refund_amount stays in sync via the same DB
// trigger that maintains amount_paid.
export async function recordRefund(
  current: Enquiry,
  newRefundAmount: number,
  options?: { payment_method?: string; utr_number?: string; notes?: string; paid_at?: string }
): Promise<Enquiry> {
  // Same reasoning as the guard at the top of recordPayment above — this is
  // the one choke point every refund path calls, so bound-check here even
  // though the UI already does too.
  if (newRefundAmount < 0) {
    throw new Error('Refund amount cannot be negative.');
  }
  if (newRefundAmount > (current.amount_paid || 0)) {
    throw new Error("Refund amount can't exceed what was actually paid.");
  }
  // No-shows forfeit the full amount paid, no exceptions — the UI already
  // locks this field to 0, but guard here too since this is the one choke
  // point every refund path calls.
  if (current.is_no_show && newRefundAmount > 0) {
    throw new Error('No refund is permitted for a no-show.');
  }

  const delta = newRefundAmount - (current.refund_amount || 0);
  if (delta !== 0) {
    const { error: refundError } = await supabase.from('payments').insert({
      enquiry_id: current.id,
      amount: delta,
      payment_type: 'refund',
      payment_method: options?.payment_method,
      utr_number: options?.utr_number || null,
      notes: options?.notes,
      // Refund Date from the popup (CRM spec section 7) — falls back to the
      // payments table's own now() default when not supplied, same as
      // every other payment path.
      ...(options?.paid_at ? { paid_at: options.paid_at } : {}),
    });
    if (refundError) throw refundError;
  }

  const { data, error } = await supabase
    .from('enquiries')
    .select('*')
    .eq('id', current.id)
    .single();
  if (error) throw error;
  if (delta !== 0) {
    await logActivity(
      current.id,
      'Refund processed',
      `${formatPrice(Math.abs(delta))}${options?.payment_method ? ` · ${options.payment_method}` : ''}`
    );
  }
  return data;
}
