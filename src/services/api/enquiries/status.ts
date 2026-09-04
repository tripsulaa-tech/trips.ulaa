import { supabase } from '../../supabase';
import type { Enquiry, ContactOutcome, BookingFollowUpType } from '../../../types/types-index';
import { isAgeNotEligibleError, refreshJourneyStage } from './shared';
import { logActivity } from './activity';
import { formatPrice } from '../../../utils/utils-index';

// =============================================
// Enquiries — status / lifecycle
// =============================================

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
//
// total_amount is the one exception to "never touches money": it's only
// ever passed alongside a package_type change (Traveller & Trip's own
// Package field, editable pre-booking only — see useEditEnquiry), so the
// list price on the enquiry row stays in sync with whichever package was
// just picked instead of silently going stale until Track Payment is
// opened.
export async function updateEnquiryDetails(
  id: string,
  current: Enquiry,
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
    food_preference?: 'veg' | 'non_veg' | null;
    package_type?: 'early_bird' | 'normal';
    total_amount?: number | null;
  }
): Promise<Enquiry> {
  const patch: Record<string, unknown> = {};
  // Every field that actually changes gets recorded on the Activity
  // Timeline (CRM spec section 14 — "whatever changed in the Traveller
  // card should show up there") as one combined entry, rather than one
  // logActivity call per field, so a single Save doesn't spam the
  // timeline with five separate rows. Each entry reads "Field: old → new"
  // so it's clear what actually changed, not just that something did.
  const changes: string[] = [];
  const FOOD_LABEL: Record<string, string> = { veg: 'Veg', non_veg: 'Non-veg' };
  const PACKAGE_LABEL: Record<string, string> = { early_bird: 'Early Bird', normal: 'Normal' };
  const SOURCE_LABEL: Record<string, string> = {
    website: 'Website', whatsapp: 'WhatsApp', phone: 'Phone Call', instagram: 'Instagram', walk_in: 'Walk-in', other: 'Other',
  };
  const track = (label: string, oldVal: string, newVal: string) => {
    if (oldVal !== newVal) changes.push(`${label}: ${oldVal || '—'} → ${newVal || '—'}`);
  };

  if (fields.full_name !== undefined) {
    const trimmed = fields.full_name.trim();
    if (!trimmed) throw new Error('Name cannot be empty.');
    track('Name', current.full_name, trimmed);
    patch.full_name = trimmed;
  }
  if (fields.email !== undefined) {
    const trimmed = fields.email.trim();
    track('Email', current.email || '', trimmed);
    patch.email = trimmed;
  }
  if (fields.phone !== undefined) {
    const trimmed = fields.phone.trim();
    if (!trimmed) throw new Error('Phone cannot be empty.');
    track('Phone', current.phone, trimmed);
    patch.phone = trimmed;
  }
  if (fields.city !== undefined) {
    const val = fields.city || null;
    track('City', current.city || '', val || '');
    patch.city = val;
  }
  if (fields.age !== undefined) {
    track('Age', current.age != null ? String(current.age) : '', fields.age != null ? String(fields.age) : '');
    patch.age = fields.age;
  }
  if (fields.trip_id !== undefined) {
    const val = fields.trip_id || null;
    if (val !== (current.trip_id || null)) {
      changes.push(`Trip: ${current.trip_title || '—'} → ${fields.trip_title || '—'}`);
    }
    patch.trip_id = val;
  }
  if (fields.trip_title !== undefined) patch.trip_title = fields.trip_title || null;
  if (fields.source !== undefined) {
    track('Source', SOURCE_LABEL[current.source] || current.source, SOURCE_LABEL[fields.source] || fields.source);
    patch.source = fields.source;
  }
  if (fields.food_preference !== undefined) {
    const oldLabel = current.food_preference ? (FOOD_LABEL[current.food_preference] || current.food_preference) : '';
    const newLabel = fields.food_preference ? (FOOD_LABEL[fields.food_preference] || fields.food_preference) : '';
    track('Food Preference', oldLabel, newLabel);
    patch.food_preference = fields.food_preference;
  }
  if (fields.package_type !== undefined) {
    track('Package', PACKAGE_LABEL[current.package_type] || current.package_type, PACKAGE_LABEL[fields.package_type] || fields.package_type);
    patch.package_type = fields.package_type;
  }
  if (fields.total_amount !== undefined) {
    track('List Price', current.total_amount != null ? formatPrice(current.total_amount) : '', fields.total_amount != null ? formatPrice(fields.total_amount) : '');
    patch.total_amount = fields.total_amount;
  }

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
  if (changes.length > 0) {
    await logActivity(id, 'Details updated', changes.join('; '));
  }
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
export async function setEnquiryFollowUp(
  id: string,
  followUpAt: string | null,
  followUpTime?: string | null
): Promise<void> {
  const { error } = await supabase
    .from('enquiries')
    // Clearing the date must also clear the time (see
    // enquiries_follow_up_time_requires_date in add_contact_outcome.sql).
    // followUpTime is optional — undefined leaves whatever time is already
    // on the row untouched (e.g. a caller that only ever meant to edit the
    // date), while null explicitly clears it.
    .update(
      followUpAt
        ? { follow_up_at: followUpAt, ...(followUpTime !== undefined ? { follow_up_time: followUpTime || null } : {}) }
        : { follow_up_at: null, follow_up_time: null }
    )
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
