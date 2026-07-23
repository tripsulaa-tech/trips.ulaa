import { supabase } from './supabase';
import type { UpcomingTrip, CompletedTrip, Enquiry, GalleryImage, Testimonial, BookingFormData, AdminNotification, Payment } from '../types';

// =============================================
// Upcoming Trips
// =============================================
export async function getUpcomingTrips(): Promise<UpcomingTrip[]> {
  const { data, error } = await supabase
    .from('upcoming_trips')
    .select('*')
    .eq('is_published', true)
    .order('start_date', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getUpcomingTripBySlug(slug: string): Promise<UpcomingTrip | null> {
  const { data, error } = await supabase
    .from('upcoming_trips')
    .select('*')
    .eq('slug', slug)
    .eq('is_published', true)
    .single();
  if (error) return null;
  return data;
}

export async function getAllUpcomingTripsAdmin(): Promise<UpcomingTrip[]> {
  const { data, error } = await supabase
    .from('upcoming_trips')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createUpcomingTrip(trip: Partial<UpcomingTrip>): Promise<UpcomingTrip> {
  const { data, error } = await supabase
    .from('upcoming_trips')
    .insert(trip)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateUpcomingTrip(id: string, trip: Partial<UpcomingTrip>): Promise<UpcomingTrip> {
  const { data, error } = await supabase
    .from('upcoming_trips')
    .update(trip)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteUpcomingTrip(id: string): Promise<void> {
  const { error } = await supabase.from('upcoming_trips').delete().eq('id', id);
  if (error) throw error;
}

// =============================================
// Completed Trips
// =============================================
export async function getCompletedTrips(): Promise<CompletedTrip[]> {
  const { data, error } = await supabase
    .from('completed_trips')
    .select('*')
    .eq('is_published', true)
    .order('trip_date', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getCompletedTripBySlug(slug: string): Promise<CompletedTrip | null> {
  const { data, error } = await supabase
    .from('completed_trips')
    .select('*')
    .eq('slug', slug)
    .eq('is_published', true)
    .single();
  if (error) return null;
  return data;
}

export async function getAllCompletedTripsAdmin(): Promise<CompletedTrip[]> {
  const { data, error } = await supabase
    .from('completed_trips')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createCompletedTrip(trip: Partial<CompletedTrip>): Promise<CompletedTrip> {
  const { data, error } = await supabase
    .from('completed_trips')
    .insert(trip)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCompletedTrip(id: string, trip: Partial<CompletedTrip>): Promise<CompletedTrip> {
  const { data, error } = await supabase
    .from('completed_trips')
    .update(trip)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCompletedTrip(id: string): Promise<void> {
  const { error } = await supabase.from('completed_trips').delete().eq('id', id);
  if (error) throw error;
}

// =============================================
// Gallery
// =============================================
export async function getGalleryImages(): Promise<GalleryImage[]> {
  const { data, error } = await supabase
    .from('gallery')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function uploadImage(bucket: string, file: File, path: string): Promise<string> {
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

export async function deleteImage(bucket: string, path: string): Promise<void> {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
}

// =============================================
// Enquiries
// =============================================
export async function submitEnquiry(enquiry: BookingFormData): Promise<void> {
  const { error } = await supabase.from('enquiries').insert(enquiry);
  if (error) throw error;
}

export async function getEnquiries(): Promise<Enquiry[]> {
  const { data, error } = await supabase
    .from('enquiries')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function updateEnquiryStatus(id: string, status: Enquiry['status']): Promise<void> {
  const { error } = await supabase.from('enquiries').update({ status }).eq('id', id);
  if (error) throw error;
}

// Manual enquiry entry — for walk-ins, phone calls, WhatsApp messages, etc.
// that never came through the website's booking form. If an amount is paid
// up front, this books a seat, logs it to the payments ledger, and sets
// status/booking_status/is_paid the same way recordPayment does above.
export async function createManualEnquiry(enquiry: Partial<Enquiry>): Promise<Enquiry> {
  const amountPaid = enquiry.amount_paid || 0;
  const totalAmount = enquiry.total_amount ?? null;
  const isPaidFull = !!totalAmount && amountPaid >= totalAmount;
  const status = computeAutoStatus(amountPaid, totalAmount, enquiry.status || 'new');
  const bookingStatus = computeBookingStatus(
    amountPaid,
    totalAmount,
    enquiry.booking_amount || 0,
    enquiry.balance_due_date,
    undefined
  );

  // Don't insert amount_paid directly if we're about to log it to the
  // ledger — let the trigger set it, so the two never drift apart.
  const { amount_paid: _omit, ...rest } = enquiry;
  const { data, error } = await supabase
    .from('enquiries')
    .insert({ ...rest, amount_paid: 0, is_paid: isPaidFull, status, booking_status: bookingStatus })
    .select()
    .single();
  if (error) throw error;

  if (amountPaid > 0) {
    const { error: paymentError } = await supabase.from('payments').insert({
      enquiry_id: data.id,
      amount: amountPaid,
      payment_type: 'booking_amount',
      notes: 'Initial payment recorded at enquiry creation',
    });
    if (paymentError) throw paymentError;
    if (enquiry.trip_id) {
      await adjustTripSeats(enquiry.trip_id, 1);
    }
    // Re-fetch since the trigger just updated amount_paid out from under
    // the row we already have in hand.
    const { data: refreshed, error: refetchError } = await supabase
      .from('enquiries')
      .select('*')
      .eq('id', data.id)
      .single();
    if (refetchError) throw refetchError;
    return refreshed;
  }

  return data;
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

async function adjustTripSeats(tripId: string, delta: 1 | -1): Promise<void> {
  const { data: trip, error: tripError } = await supabase
    .from('upcoming_trips')
    .select('seats_booked, total_seats')
    .eq('id', tripId)
    .single();
  if (tripError) throw tripError;

  const newSeatsBooked = Math.max(0, Math.min(trip.seats_booked + delta, trip.total_seats));
  const { error: seatsError } = await supabase
    .from('upcoming_trips')
    .update({ seats_booked: newSeatsBooked })
    .eq('id', tripId);
  if (seatsError) throw seatsError;
}

// Fetches the payment history for one enquiry (booking amount, balance,
// installments, refunds) — this is the source of truth; enquiries.amount_paid
// and refund_amount are just a cached rollup kept in sync via DB trigger.
export async function getPayments(enquiryId: string): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('enquiry_id', enquiryId)
    .order('paid_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Records a new payment (delta from what's already been paid, not an
// absolute total) against an enquiry. Inserting into the payments ledger
// triggers a DB-side recalculation of enquiries.amount_paid — this function
// never writes amount_paid directly, to avoid it drifting from the ledger.
//
// `newAmountPaid` is the *running total* the admin enters in the UI (kept
// this way so the form still just shows one "amount paid so far" field);
// this function does the delta math and inserts one ledger row for the
// difference. Passing a newAmountPaid equal to current.amount_paid is a
// no-op (e.g. saving the form after only changing total_amount/package_type).
export async function recordPayment(
  current: Enquiry,
  payment: {
    amount_paid: number; // new running total, not a delta
    total_amount?: number | null;
    package_type?: Enquiry['package_type'];
    payment_method?: string;
    notes?: string;
  }
): Promise<Enquiry> {
  const newTotal = payment.total_amount !== undefined ? payment.total_amount : current.total_amount;
  const delta = payment.amount_paid - (current.amount_paid || 0);

  if (delta !== 0) {
    const isFirstPayment = (current.amount_paid || 0) <= 0;
    const { error: paymentError } = await supabase.from('payments').insert({
      enquiry_id: current.id,
      amount: delta,
      payment_type: isFirstPayment ? 'booking_amount' : 'installment',
      payment_method: payment.payment_method,
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

  const wasBooked = (current.amount_paid || 0) > 0;
  const willBeBooked = refreshed.amount_paid > 0;
  const isPaidFull = !!newTotal && newTotal > 0 && refreshed.amount_paid >= newTotal;
  const status = computeAutoStatus(refreshed.amount_paid, newTotal, current.status);
  const bookingStatus = computeBookingStatus(
    refreshed.amount_paid,
    newTotal,
    refreshed.booking_amount,
    refreshed.balance_due_date,
    refreshed.booking_status
  );

  if (current.trip_id && wasBooked !== willBeBooked) {
    await adjustTripSeats(current.trip_id, willBeBooked ? 1 : -1);
  }

  const { data, error } = await supabase
    .from('enquiries')
    .update({
      total_amount: newTotal,
      package_type: payment.package_type ?? current.package_type,
      is_paid: isPaidFull,
      status,
      booking_status: bookingStatus,
    })
    .eq('id', current.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Cancels an enquiry / booking. Frees the trip seat immediately if one was
// held (amount_paid > 0 and not already cancelled). amount_paid itself is
// untouched — that's the historical record of what they actually paid,
// separate from refund_amount which tracks what's been paid back.
//
// Setting cancelled_at fires a DB trigger that auto-computes
// suggested_refund_amount and sets booking_status to 'cancelled' — this is
// a SUGGESTION only, never authoritative; the admin still enters the real
// refund_amount via recordRefund. Pass thirdPartyCharges if known at
// cancellation time (airline/hotel penalties aren't derivable from stored
// data) so the suggestion accounts for them.
export async function cancelEnquiry(enquiry: Enquiry, thirdPartyCharges?: number): Promise<Enquiry> {
  const hadSeat = !enquiry.cancelled_at && enquiry.amount_paid > 0;

  if (thirdPartyCharges !== undefined) {
    const { error: chargesError } = await supabase
      .from('enquiries')
      .update({ third_party_charges: thirdPartyCharges })
      .eq('id', enquiry.id);
    if (chargesError) throw chargesError;
  }

  const { data, error } = await supabase
    .from('enquiries')
    .update({ cancelled_at: new Date().toISOString() })
    .eq('id', enquiry.id)
    .select()
    .single();
  if (error) throw error;

  if (enquiry.trip_id && hadSeat) {
    await adjustTripSeats(enquiry.trip_id, -1);
  }

  return data;
}

// Reverses a cancellation (person changed their mind / cancelled by mistake).
// Re-books the seat if they'd already paid something, and resets
// booking_status back to whatever it would be given the current amount
// paid (rather than leaving it stuck on 'cancelled').
export async function uncancelEnquiry(enquiry: Enquiry): Promise<Enquiry> {
  const bookingStatus = computeBookingStatus(
    enquiry.amount_paid,
    enquiry.total_amount,
    enquiry.booking_amount,
    enquiry.balance_due_date,
    undefined // force recompute rather than trusting the 'cancelled' value
  );

  const { data, error } = await supabase
    .from('enquiries')
    .update({ cancelled_at: null, booking_status: bookingStatus, suggested_refund_amount: null })
    .eq('id', enquiry.id)
    .select()
    .single();
  if (error) throw error;

  if (enquiry.trip_id && enquiry.amount_paid > 0) {
    await adjustTripSeats(enquiry.trip_id, 1);
  }

  return data;
}

// Logs how much has been refunded so far for a cancelled booking.
// `newRefundAmount` is the running total (matching recordPayment's pattern)
// — this inserts a ledger row for the delta rather than overwriting
// refund_amount directly, so refund_amount stays in sync via the same DB
// trigger that maintains amount_paid.
export async function recordRefund(
  current: Enquiry,
  newRefundAmount: number,
  options?: { payment_method?: string; notes?: string }
): Promise<Enquiry> {
  const delta = newRefundAmount - (current.refund_amount || 0);
  if (delta !== 0) {
    const { error: refundError } = await supabase.from('payments').insert({
      enquiry_id: current.id,
      amount: delta,
      payment_type: 'refund',
      payment_method: options?.payment_method,
      notes: options?.notes,
    });
    if (refundError) throw refundError;
  }

  const { data, error } = await supabase
    .from('enquiries')
    .select('*')
    .eq('id', current.id)
    .single();
  if (error) throw error;
  return data;
}

// =============================================
// Testimonials
// =============================================
export async function getTestimonials(): Promise<Testimonial[]> {
  const { data, error } = await supabase
    .from('testimonials')
    .select('*')
    .eq('is_published', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getAllTestimonialsAdmin(): Promise<Testimonial[]> {
  const { data, error } = await supabase
    .from('testimonials')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createTestimonial(testimonial: Partial<Testimonial>): Promise<Testimonial> {
  const { data, error } = await supabase
    .from('testimonials')
    .insert(testimonial)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTestimonial(id: string, testimonial: Partial<Testimonial>): Promise<Testimonial> {
  const { data, error } = await supabase
    .from('testimonials')
    .update(testimonial)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTestimonial(id: string): Promise<void> {
  const { error } = await supabase.from('testimonials').delete().eq('id', id);
  if (error) throw error;
}

// =============================================
// Site Content (editable copy for pages like About)
// =============================================
export async function getSiteContent<T = unknown>(key: string): Promise<T | null> {
  const { data, error } = await supabase
    .from('site_content')
    .select('content')
    .eq('key', key)
    .maybeSingle();
  if (error || !data) return null;
  return data.content as T;
}

export async function upsertSiteContent(key: string, content: unknown): Promise<void> {
  const { error } = await supabase
    .from('site_content')
    .upsert({ key, content }, { onConflict: 'key' });
  if (error) throw error;
}

// =============================================
// Notifications
// =============================================
export async function getNotifications(limit = 20): Promise<AdminNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function getUnreadNotificationCount(): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('is_read', false);
  if (error) throw error;
  return count || 0;
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  if (error) throw error;
}

export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('is_read', false);
  if (error) throw error;
}
