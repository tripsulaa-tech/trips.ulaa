// =============================================
// ULAA - TypeScript Types & Interfaces
// =============================================

export interface UpcomingTrip {
  id: string;
  title: string;
  destination: string;
  slug: string;
  start_date: string;
  end_date: string;
  duration: string;
  description: string;
  highlights: string[];
  itinerary: ItineraryDay[];
  included: string[];
  not_included: string[];
  things_to_carry: string[];
  meeting_point?: string;
  meeting_point_map_url?: string;
  faqs: FAQ[];
  total_seats: number;
  seats_booked: number;
  // Not a DB column — merged in client-side (see getUpcomingTrips /
  // getUpcomingTripBySlug) from get_waitlist_reserved_counts(). Counts
  // people still active on the waitlist (waiting/notified) so the public
  // site doesn't let a new visitor book a seat that's next in line for
  // someone who's already been waiting.
  waitlist_reserved?: number;
  price?: number;
  early_bird_price?: number;
  early_bird_deadline?: string;
  // Optional "was ₹X" marketing price, shown crossed out next to whichever
  // of price/early_bird_price is currently active. Independent of the
  // early-bird mechanism itself — see getStrikeThroughPrice in utils/index.ts
  // for how it combines with (and falls back around) early-bird pricing.
  strike_through_price?: number;
  cover_image?: string;
  gallery_images: string[];
  terms_and_conditions?: string;
  cancellation_policy?: CancellationPolicy;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface CompletedTrip {
  id: string;
  title: string;
  destination: string;
  map_url?: string;
  slug: string;
  trip_date: string;
  description: string;
  story?: string;
  batch?: string;
  participants: number;
  cover_image?: string;
  gallery_images: string[];
  is_published: boolean;
  created_at: string;
  updated_at: string;
  // Snapshot of the upcoming trip's planning content, copied over
  // automatically when the album is created. Admin reference only — never
  // rendered on the public album page (AlbumPage.tsx).
  original_itinerary?: ItineraryDay[];
  original_highlights?: string[];
  original_included?: string[];
  original_not_included?: string[];
}

export interface TripImage {
  id: string;
  trip_id: string;
  trip_type: 'upcoming' | 'completed' | 'gallery';
  image_url: string;
  alt_text?: string;
  sort_order: number;
  is_cover: boolean;
  created_at: string;
}

export interface GalleryImage {
  id: string;
  image_url: string;
  alt_text?: string;
  destination?: string;
  sort_order: number;
  is_featured: boolean;
  created_at: string;
}

export interface Enquiry {
  id: string;
  full_name: string;
  age?: number;
  phone: string;
  email: string;
  city?: string;
  emergency_contact?: string;
  message?: string;
  trip_id?: string;
  trip_title?: string;
  status: 'new' | 'contacted' | 'closed';
  source: 'website' | 'whatsapp' | 'phone' | 'instagram' | 'walk_in' | 'other';
  is_paid: boolean;
  package_type: 'early_bird' | 'normal';
  total_amount?: number;
  amount_paid: number;
  terms_accepted?: boolean;
  cancelled_at?: string | null;
  refund_amount: number;
  created_at: string;
  updated_at: string;
  // Booking/payment lifecycle — independent of `status` above, which only
  // tracks lead follow-up (new/contacted/closed). A 'closed' lead can mean
  // either "went nowhere" or "fully paid booking"; booking_status
  // disambiguates that.
  trip_type?: 'domestic' | 'international';
  departure_date?: string; // snapshotted at booking time, doesn't move if the trip's dates change later
  booking_amount: number; // non-refundable deposit (T&C clause 1); defaults to 0 until set
  third_party_charges?: number; // manually entered at cancellation time
  is_no_show: boolean;
  booking_status?: 'booking_confirmed' | 'balance_pending' | 'fully_paid' | 'cancelled' | 'completed';
  suggested_refund_amount?: number; // auto-computed suggestion only — never authoritative, admin sets refund_amount independently
  balance_due_date?: string; // auto-derived from departure_date + trip_type, read-only
  // Group bookings: a "Group" submission from the public booking form
  // creates one row per seat, all sharing group_id/group_size. group_seq is
  // this row's 1-based position within the group. Solo bookings are always
  // group_seq = 1 with group_id/group_size left null.
  group_id?: string | null;
  group_size?: number | null;
  group_seq: number;
  // Dietary preference for meals on the trip. Optional/nullable so existing
  // rows (created before this field existed) and admin-logged enquiries
  // where it wasn't asked don't break — the public booking form itself
  // requires a choice.
  food_preference?: 'veg' | 'non_veg' | null;
}

// One row per individual payment or refund against an enquiry. This is the
// source of truth for enquiries.amount_paid / refund_amount, which are kept
// in sync via a DB trigger — never write those columns directly once you're
// recording a real payment event; insert here instead.
export interface Payment {
  id: string;
  enquiry_id: string;
  amount: number;
  payment_type: 'booking_amount' | 'balance' | 'installment' | 'refund';
  payment_method?: string;
  paid_at: string;
  notes?: string;
  created_at: string;
}

export interface AdminNotification {
  id: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  is_read: boolean;
  created_at: string;
}

export interface Testimonial {
  id: string;
  name: string;
  photo?: string;
  review: string;
  rating: number;
  destination?: string;
  is_published: boolean;
  sort_order: number;
  created_at: string;
}

export interface ItineraryDay {
  day: number;
  title: string;
  description: string;
  images?: string[];
}

export interface FAQ {
  question: string;
  answer: string;
}

// =============================================
// Cancellation Policy (editable per-trip via Admin)
// The day thresholds below are what typically change from trip to trip
// (domestic vs international, different vendors, etc). Each tier describes
// the refund treatment for cancellations made in a given window before
// departure. Tiers should be ordered from the most days-before-departure to
// the fewest — the editor and display both assume that order.
// =============================================
export interface CancellationTier {
  // Minimum days-before-departure required to fall in this tier (inclusive).
  // null = no lower bound, i.e. this is the closest-to-departure tier
  // ("Within X days of departure").
  min_days: number | null;
  // Maximum days-before-departure for this tier (inclusive).
  // null = no upper bound, i.e. this is the furthest-out tier
  // ("More than X days before departure").
  max_days: number | null;
  description: string;
}

export interface CancellationPolicy {
  // Days before departure the remaining balance is due.
  payment_due_days: number;
  // Refund windows for participant-initiated cancellations, ordered furthest
  // to nearest departure.
  tiers: CancellationTier[];
  // Approved refunds are processed within this many working days.
  refund_min_days: number;
  refund_max_days: number;
}

export interface BookingFormData {
  full_name: string;
  age: number;
  phone: string;
  email: string;
  city: string;
  emergency_contact: string;
  message?: string;
  trip_id?: string;
  trip_title?: string;
  terms_accepted: boolean;
  food_preference: 'veg' | 'non_veg';
}

// Not part of BookingFormData itself (that's the react-hook-form-managed
// fields, one shared set of details per seat in a group) — this is the
// separate "how many seats" choice the form also collects alongside it.
export type BookingMode = 'solo' | 'group';

// =============================================
// Waitlist (sold-out trips)
// =============================================
export interface WaitlistEntry {
  id: string;
  trip_id: string;
  trip_title?: string;
  full_name: string;
  phone: string;
  email: string;
  age?: number | null;
  city?: string | null;
  emergency_contact?: string | null;
  food_preference?: 'veg' | 'non_veg' | null;
  message?: string;
  status: 'waiting' | 'notified' | 'converted' | 'declined';
  notified_at?: string | null;
  converted_enquiry_id?: string | null;
  created_at: string;
  // How many seats this signup needs. Null/1 = solo. Set when someone
  // joins the waitlist because their group didn't fit in the remaining
  // seats — a group entry only counts as "ready to convert" once at least
  // this many seats are free, not the moment any single seat opens up.
  group_size?: number | null;
}

export interface WaitlistFormData {
  full_name: string;
  phone: string;
  email: string;
  age?: number | null;
  city?: string | null;
  emergency_contact?: string | null;
  food_preference?: 'veg' | 'non_veg' | null;
  message?: string;
  trip_id: string;
  trip_title?: string;
  group_size?: number | null;
}

// =============================================
// About Page (editable via Admin)
// =============================================
export interface AboutValue {
  icon: string;
  title: string;
  description: string;
}

export interface AboutTimelineItem {
  year: string;
  title: string;
  description: string;
}

export interface AboutContent {
  hero: {
    label: string;
    title: string;
    subtitle: string;
  };
  mission: {
    label: string;
    title: string;
    text: string;
  };
  vision: {
    label: string;
    title: string;
    text: string;
  };
  philosophy: {
    label: string;
    quote_line1: string;
    quote_line2: string;
    text: string;
  };
  values: AboutValue[];
  timeline: AboutTimelineItem[];
}

// =============================================
// Why ULAA / "Why Choose Us" cards (editable via Admin)
// =============================================
export interface WhyUlaaFeature {
  image: string;
  title: string;
  description: string;
}

export interface WhyUlaaContent {
  features: WhyUlaaFeature[];
}

export interface AdminUser {
  id: string;
  email: string;
}
