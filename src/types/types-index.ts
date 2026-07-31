// =============================================
// ULAA - TypeScript Types & Interfaces
// =============================================

// =============================================
// Trip Detail Page — extended content blocks (Admin-managed, optional)
// =============================================

export interface TripHighlightCard {
  icon: string;        // emoji or short icon label
  heading: string;
  description: string;
}

export interface TripInclusionItem {
  icon: string;        // emoji or icon label shown next to the item
  description: string;
}

export interface TripIncludedGroup {
  icon: string;        // emoji or icon-library key shown next to the heading
  heading: string;     // e.g. "Premium Stay Experience"
  bullets: string[];   // sub-items shown as a bulleted list below the heading
}

export interface TripGalleryItem {
  photo: string;       // uploaded image URL
  description: string; // caption / place name
}

export interface TripFounder {
  photo: string;
  name: string;
  description: string;
}

export interface TripConfidenceItem {
  icon: string;
  description: string;
}

export interface TripEndBanner {
  image: string;
  heading: string;
  description: string;
  cta_label: string;
  cta_url: string;
}

// Saved position/zoom for a trip's cover_image, set via the Cover Image
// Editor (Admin → Add/Edit Trip → Media → CoverImageCropEditor). A single
// focal point + zoom is stored — not a separate crop per layout — and gets
// applied on top of each layout's own object-fit: cover container, so the
// same composition holds across the Trip Card, Desktop Hero, and Mobile
// Hero. See getCoverImageStyle in utils/utils-index.ts.
export interface CoverImageCrop {
  x: number;    // 0-100, focal point as % of image width (object-position x)
  y: number;    // 0-100, focal point as % of image height (object-position y)
  zoom: number; // >=1, extra scale on top of object-fit: cover (1 = no zoom)
}

export interface UpcomingTrip {
  id: string;
  title: string;
  destination: string;
  slug: string;
  start_date: string;
  end_date: string;
  duration: string;
  description: string;
  itinerary: ItineraryDay[];
  not_included: string[];
  meeting_point?: string;
  meeting_point_map_url?: string;
  // Optional structured assembly-point logistics, shown on the public trip
  // page and the itinerary PDF's Meeting Point section. All optional and
  // independent of meeting_point (which stays the free-text location line)
  // — see add_trip_meeting_point_details.sql.
  meeting_time?: string;
  meeting_terminal?: string;
  meeting_details?: string;
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
  early_bird_price?: number | null;
  early_bird_deadline?: string | null;
  // Optional "was ₹X" marketing price, shown crossed out next to whichever
  // of price/early_bird_price is currently active. Independent of the
  // early-bird mechanism itself — see getStrikeThroughPrice in utils/index.ts
  // for how it combines with (and falls back around) early-bird pricing.
  strike_through_price?: number | null;
  // Domestic vs. international, used by the DB's set_enquiry_trip_type()
  // trigger to auto-fill enquiries.trip_type on new bookings, which in turn
  // drives calculate_suggested_refund()'s domestic/international-specific
  // cancellation windows. Left null means "not set" — the trigger then
  // leaves enquiries.trip_type null too, so set it for accurate refund
  // suggestions.
  trip_type?: 'domestic' | 'international' | null;
  // Optional age eligibility range for this trip. Either side can be left
  // unset (no restriction on that side); if both are unset, the public
  // forms fall back to the app's default 18-65 rule — see validateAge in
  // src/utils/formValidation.ts.
  min_age?: number | null;
  max_age?: number | null;
  cover_image?: string;
  // Optional saved position/zoom for cover_image, set via the Cover Image
  // Editor in Admin → Add/Edit Trip → Media. Stores a single focal point +
  // zoom level (not per-layout crops) that TripCard and the desktop hero
  // in TripDetailPage apply on top of their own object-fit: cover
  // container — see getCoverImageStyle in utils/utils-index.ts. Optional so
  // existing trips with no saved crop keep using plain object-cover
  // (unchanged default behaviour), no migration required. The mobile hero
  // does NOT use this crop — see hero_mobile_image below.
  cover_image_crop?: CoverImageCrop | null;
  // Optional separate image for the mobile hero banner on the trip detail
  // page (Admin → Add/Edit Trip → Media). Same pattern as About page's
  // hero.mobile_image — an independently uploaded tall/portrait photo
  // rather than a crop of cover_image. Falls back to the cropped
  // cover_image on mobile when left empty, so existing trips with no
  // separate mobile image keep working unchanged.
  hero_mobile_image?: string;
  gallery_images: string[];
  terms_and_conditions?: string;
  cancellation_policy?: CancellationPolicy;
  // ── Extended content blocks (Admin → Upcoming Trips → Add/Edit Trip) ──
  // Each field is optional so existing trips keep working with no migration.
  highlight_cards?: TripHighlightCard[];        // Rich highlight cards (icon+heading+desc)
  accommodation_description?: string;           // "Stay. Relax. Repeat." section body
  accommodation_photos?: string[];              // Accommodation photo gallery
  included_items?: TripInclusionItem[];         // Included items with icons
  included_groups?: TripIncludedGroup[];        // Grouped "What's Included" — heading + bulleted sub-items; preferred over included_items when present
  not_included_items?: TripInclusionItem[];     // Not-included items with icons
  gallery_items?: TripGalleryItem[];            // "Places You'll Post" — photo + caption
  gallery_description?: string;                 // "Places You'll Definitely Post" section intro paragraph
  fashion_photos?: string[];                    // Fashion aesthetics inspiration photos
  fashion_description?: string;                 // "Fashion Aesthetics" section intro paragraph
  things_to_carry_items?: TripInclusionItem[];  // Things to Carry with icon (rich variant of things_to_carry)
  trip_founder?: TripFounder;                   // Per-trip founder block
  confidence_items?: TripConfidenceItem[];      // "Travel with Confidence" items
  confidence_description?: string;              // "Travel with Confidence" section body
  meeting_address?: string;                     // Street/full address for meeting point
  end_banner?: TripEndBanner;                   // End-of-page full-width banner
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
  // Public-facing like count on the album page (AlbumPage.tsx). Stored
  // server-side (not per-browser) so it persists across devices and shows
  // a real total — see incrementCompletedTripLikes/decrementCompletedTripLikes
  // in api.ts and add_completed_trip_likes.sql.
  likes_count: number;
  // Snapshot of the upcoming trip's planning content, copied over
  // automatically when the album is created. Admin reference only — never
  // rendered on the public album page (AlbumPage.tsx).
  original_itinerary?: ItineraryDay[];
  // Rich (icon-based) snapshot, fed from upcoming_trips' highlight_cards /
  // included_items. Preferred over the legacy plain-text fields below when
  // present — see AdminAlbums.tsx and fix_completed_trip_snapshot_source.sql.
  original_highlight_cards?: TripHighlightCard[];
  original_included_items?: TripInclusionItem[];
  // Legacy plain-text snapshot. Only trips completed before
  // fix_completed_trip_snapshot_source.sql have real data here — kept as a
  // fallback so their history isn't lost, not written to for new albums.
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
  // Admin-only escape hatch from enforce_enquiry_capacity_or_waitlist() —
  // always false/omitted on the public booking form. Used when converting a
  // waitlist entry into a booking, since the seat was already accounted for
  // on the waitlist rather than being a fresh request against live capacity.
  bypass_capacity_check?: boolean;
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
  // Optional icon-library key (see src/constants/tripHighlightIcons.ts), e.g.
  // "coffee" or "paw-print". Shown in the day's badge on the trip page and
  // in admin; falls back to just showing the day number when unset.
  icon?: string;
  // Optional bulleted sub-items for this day (e.g. "Breakfast at the resort",
  // "Guided trek to the viewpoint") — same "heading + bullets" pattern used
  // by TripIncludedGroup, shown below the day's description when present.
  bullets?: string[];
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
  // Legacy single-conversion field — no longer written to (superseded by
  // converted_enquiry_ids below), kept only so old rows still type-check.
  converted_enquiry_id?: string | null;
  // Every enquiry converted from this waitlist signup so far. For a group
  // entry (group_size > 1), this can hold fewer entries than group_size
  // while the rest of the group is still waiting — status only becomes
  // 'converted' once this array covers the whole group.
  converted_enquiry_ids?: string[] | null;
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

export interface AboutHaveYouEverItem {
  text: string;
  /** Icon library key (see constants/tripHighlightIcons.ts). Optional for legacy items saved before the picker existed. */
  icon?: string;
}

export interface AboutWelcomeItem {
  icon: string;
  title: string;
  description: string;
}

export interface AboutWhyDifferentCard {
  heading: string;
  description: string;
  /** Optional image shown on the card — either uploaded or a pasted external URL (e.g. Unsplash). */
  image?: string;
}

export interface AboutJourneyStep {
  heading: string;
  description: string;
}

export interface AboutFounderSocialLink {
  platform: string;
  url: string;
}

export interface AboutContent {
  // 1. Hero Banner
  hero: {
    image: string;
    mobile_image: string;
    heading: string;
    subheading: string;
    cta_label: string;
    cta_url: string;
  };
  // 2. Our Story
  our_story: {
    heading: string;
    description: string;
    image: string;
  };
  // 3. Have You Ever...
  have_you_ever: {
    heading: string;
    items: AboutHaveYouEverItem[];
  };
  // 4. Welcome to Ulaa
  welcome_to_ulaa: {
    heading: string;
    subheading: string;
    items: AboutWelcomeItem[];
  };
  // 5. Why Ulaa is Different (up to 6 cards)
  why_different: {
    heading: string;
    subheading: string;
    cards: AboutWhyDifferentCard[];
  };
  // 6. Our Community
  community: {
    heading: string;
    subheading: string;
    photos: string[];
  };
  // 7. Statistics (Girls Travelled, Destinations, Friendships Made, Avg Rating)
  stats: {
    girls_travelled: number;
    destinations: number;
    friendships_made: number;
    avg_trip_rating: number;
  };
  // 8. What Our Girls Say — fetched from existing Testimonials module
  testimonials_heading: string;
  // 9. Your Ulaa Journey (5 steps)
  journey: {
    heading: string;
    subheading: string;
    steps: AboutJourneyStep[];
  };
  // 10. Meet the Founder
  founder: {
    photo: string;
    name: string;
    designation: string;
    description: string;
    social_links: AboutFounderSocialLink[];
  };
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
