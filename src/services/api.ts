import { supabase } from './supabase';
import type { UpcomingTrip, CompletedTrip, Enquiry, GalleryImage, Testimonial, BookingFormData, AdminNotification } from '../types';

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
// up front, this books a seat and sets status/is_paid the same way
// recordPayment does below.
export async function createManualEnquiry(enquiry: Partial<Enquiry>): Promise<Enquiry> {
  const amountPaid = enquiry.amount_paid || 0;
  const totalAmount = enquiry.total_amount ?? null;
  const isPaidFull = !!totalAmount && amountPaid >= totalAmount;
  const status = computeAutoStatus(amountPaid, totalAmount, enquiry.status || 'new');

  const { data, error } = await supabase
    .from('enquiries')
    .insert({ ...enquiry, amount_paid: amountPaid, is_paid: isPaidFull, status })
    .select()
    .single();
  if (error) throw error;

  if (enquiry.trip_id && amountPaid > 0) {
    await adjustTripSeats(enquiry.trip_id, 1);
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

// Updates how much has actually been paid so far (and, optionally, the total
// amount owed / which package they booked). Any amount > 0 books a seat if
// one wasn't already booked (going from 0 -> some amount); dropping back to
// 0 frees the seat again. Status auto-advances per computeAutoStatus above.
export async function recordPayment(
  current: Enquiry,
  payment: { amount_paid: number; total_amount?: number | null; package_type?: Enquiry['package_type'] }
): Promise<Enquiry> {
  const newTotal = payment.total_amount !== undefined ? payment.total_amount : current.total_amount;
  const wasBooked = (current.amount_paid || 0) > 0;
  const willBeBooked = payment.amount_paid > 0;
  const isPaidFull = !!newTotal && newTotal > 0 && payment.amount_paid >= newTotal;
  const status = computeAutoStatus(payment.amount_paid, newTotal, current.status);

  if (current.trip_id && wasBooked !== willBeBooked) {
    await adjustTripSeats(current.trip_id, willBeBooked ? 1 : -1);
  }

  const { data, error } = await supabase
    .from('enquiries')
    .update({ ...payment, is_paid: isPaidFull, status })
    .eq('id', current.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Cancels an enquiry / booking. Frees the trip seat immediately if one was
// held (amount_paid > 0 and not already cancelled), but deliberately leaves
// amount_paid untouched — that's the historical record of what they actually
// paid, separate from refund_amount which tracks what's been paid back.
export async function cancelEnquiry(enquiry: Enquiry): Promise<Enquiry> {
  const hadSeat = !enquiry.cancelled_at && enquiry.amount_paid > 0;

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
// Re-books the seat if they'd already paid something.
export async function uncancelEnquiry(enquiry: Enquiry): Promise<Enquiry> {
  const { data, error } = await supabase
    .from('enquiries')
    .update({ cancelled_at: null })
    .eq('id', enquiry.id)
    .select()
    .single();
  if (error) throw error;

  if (enquiry.trip_id && enquiry.amount_paid > 0) {
    await adjustTripSeats(enquiry.trip_id, 1);
  }

  return data;
}

// Logs how much has been refunded so far for a cancelled booking. Tracked
// independently from amount_paid so the original payment record never gets
// overwritten as refunds are processed (which may happen in installments).
export async function recordRefund(id: string, refund_amount: number): Promise<void> {
  const { error } = await supabase.from('enquiries').update({ refund_amount }).eq('id', id);
  if (error) throw error;
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
