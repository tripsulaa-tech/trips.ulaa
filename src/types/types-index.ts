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
  designation?: string;
  description: string;
}

export interface TripConfidenceItem {
  icon: string;
  description: string;
}

// Fixed marketing tag shown in the 4-icon row on the public Trip Card
// (e.g. "Girls-Only" / "Safe & fun", "Luxury Stays" / "Handpicked").
// Admin-managed per trip via Add/Edit Trip → Overview & Itinerary tab; see
// add_trip_card_feature_tags.sql. When a trip has none set, TripCard falls
// back to auto-generated tags built from real trip data (traveler count,
// age range, duration, destination count) instead.
export interface TripCardFeatureTag {
  icon: string;      // icon-library key, see constants/tripHighlightIcons.ts
  label: string;      // bold label shown in the icon row, e.g. "Girls-Only"
  sublabel?: string;   // unused by the current card display; kept optional for older saved data
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
  // Optional advance/reservation amount (in ₹) shown on the public trip page
  // in place of the "Seats available" badge, e.g. "Reserve today with only
  // ₹8,999 — Remaining ₹8,000 payable before the trip." Left null/unset
  // falls back to the old seats-availability badge. See
  // add_trip_advance_amount.sql.
  advance_amount?: number | null;
  // Optional fixed marketing tags (up to 4) shown in the icon row on the
  // public Trip Card, e.g. "Girls-Only" / "Safe & fun". Left unset, the
  // card falls back to auto-generated tags from real trip data (travelers,
  // age range, duration, destination count). See TripCardFeatureTag above
  // and add_trip_card_feature_tags.sql.
  card_feature_tags?: TripCardFeatureTag[] | null;
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
  // Single lifecycle status, replacing the old independent is_published /
  // is_coming_soon booleans — see add_trip_status_lifecycle.sql.
  //   draft       - hidden everywhere on the public site
  //   coming_soon - public, but TripCard renders a stripped-down teaser (no
  //                 price/date/seats/booking CTA) and TripDetailPage shows
  //                 only the hero banner + a short "Coming Soon" message,
  //                 hiding itinerary/pricing/booking content
  //   published   - public, full bookable trip page
  status: 'draft' | 'coming_soon' | 'published';
  // When true, hides the "Download itinerary PDF" option from the public
  // Trip Detail page for this trip (all three entry points — hero button,
  // header icon, and booking-panel link). Admin's own itinerary PDF
  // download (Admin → Upcoming Trips) is unaffected. Defaults to false
  // (shown) so existing trips keep working with no migration. See
  // add_trip_hide_pdf_download.sql.
  hide_pdf_download?: boolean;
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

export interface GalleryImage {
  id: string;
  image_url: string;
  alt_text?: string;
  destination?: string;
  sort_order: number;
  is_featured: boolean;
  created_at: string;
}

// 'cancelled' is kept in the union only for backward compatibility with
// rows written before add_booking_state.sql — computeJourneyStage() no
// longer produces it going forward. Whether a booking is cancelled now
// lives entirely in Enquiry.booking_state, kept independent so journey_stage
// always reports the highest legitimate stage actually reached, even after
// cancellation (see add_booking_state.sql for the full rationale).
export type JourneyStage = 'new_enquiry' | 'contacted' | 'advance_pending' | 'advance_paid'
  | 'confirmed' | 'balance_pending' | 'fully_paid' | 'checked_in' | 'completed' | 'cancelled' | 'not_interested';

// Why a lead was closed out before ever becoming a booking — only ever set
// alongside status: 'closed' (see updateEnquiryStatus in services/api.ts,
// which clears this back to null on every non-closed status change,
// including reopening). Deliberately doesn't include a bare "not_interested"
// value — the closing action itself is already called "Not Interested"
// throughout the UI (journey_stage, badge, button label), so a same-named
// reason would just restate that without adding anything; "Other" covers
// the generic/unspecified case instead. Optional/nullable since older
// closed rows predate this column — see add_closed_reason.sql.
export type ClosedReason =
  | 'no_response' | 'price_too_high' | 'date_conflict' | 'destination_changed'
  | 'booked_elsewhere' | 'personal_reason' | 'wrong_number' | 'other';

// Outcome picked in the "Record Contact Outcome" popup shown when an admin
// moves a lead from New to Contacted — see recordContactOutcome() in
// services/api.ts and ContactOutcomeModal.tsx. Distinct from ClosedReason:
// several outcomes (interested/needs_time/call_later/no_response) don't
// close the lead at all. See add_contact_outcome.sql.
export type ContactOutcome =
  | 'interested' | 'needs_time' | 'call_later' | 'payment_arrangement'
  | 'no_response' | 'not_interested' | 'wrong_number';

// Why a booking was cancelled — captured in the Cancel Booking popup (CRM
// spec section 10). Distinct from ClosedReason: this only ever applies to a
// booking that had already started the Booking Journey (money on it, a
// booking_id assigned), whereas ClosedReason is for a lead that never got
// that far. No 'no_show' entry here — attendance is its own independent
// axis (Enquiry.is_no_show, CRM spec section 4), captured via the separate
// no-show checkbox in the same popup rather than folded into the reason
// list. See add_cancellation_reason.sql.
export type CancellationReason =
  | 'medical' | 'personal' | 'emergency' | 'visa' | 'price' | 'other';

// What a Booking Follow-up reminder is actually about — see
// add_booking_follow_up.sql (CRM spec section 8B). Distinct from
// ContactOutcome/ClosedReason: this only ever applies once a booking has
// started (past Advance Pending), whereas those apply before one exists.
// Also distinct from the plain lead follow_up_at date, which carries no
// type at all — a bare date doesn't say whether the admin needs to chase a
// balance payment or a passport copy.
export type BookingFollowUpType =
  | 'balance_payment' | 'document' | 'passport'
  | 'medical_declaration' | 'final_itinerary' | 'other';

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
  // Only meaningful when status === 'closed'; null/undefined for a closed
  // row that predates add_closed_reason.sql or was bulk-closed without
  // picking one. See ClosedReason above.
  closed_reason?: ClosedReason | null;
  source: 'website' | 'whatsapp' | 'phone' | 'instagram' | 'walk_in' | 'other';
  is_paid: boolean;
  package_type: 'early_bird' | 'normal';
  total_amount?: number;
  amount_paid: number;
  terms_accepted?: boolean;
  cancelled_at?: string | null;
  // Why this booking was cancelled — only ever set alongside cancelled_at
  // (see CancellationReason above). Null for bookings cancelled before
  // add_cancellation_reason.sql, and cleared back to null on reactivation
  // via uncancelEnquiry(), same pattern as closed_reason.
  cancellation_reason?: CancellationReason | null;
  // Free-text detail entered alongside cancellation_reason in the Cancel
  // Booking popup — e.g. which document is missing for a visa cancellation.
  // Also cleared on reactivation.
  cancellation_notes?: string | null;
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
  // Human-readable booking reference (e.g. "ULAA-2026-000123"), assigned by
  // a DB trigger the first time amount_paid goes above 0 — see
  // add_booking_id_invoice.sql. Null until then, and never re-issued or
  // cleared afterwards (including on cancellation). Drives the "Download
  // Invoice" feature in AdminEnquiries.
  booking_id?: string | null;
  // Single derived "Booking Journey" stage — supersedes reading `status` +
  // `booking_status` together for display purposes. Computed client-side by
  // computeJourneyStage() in src/services/api.ts and written on every
  // mutating call, same pattern as status/booking_status. 'cancelled'
  // overrides every other stage. See add_booking_journey_stage.sql.
  journey_stage: JourneyStage;
  // Independent "Booking State" — active vs cancelled (CRM spec section 3).
  // Deliberately separate from journey_stage: cancelling a booking never
  // overwrites which stage it had reached (journey_stage keeps reporting
  // e.g. 'fully_paid'); booking_state is what flips to 'cancelled'.
  // cancelled_at remains the authoritative timestamp — this is a synced
  // label for filtering/display. Defaults to 'active' in the DB, so it's
  // always present on rows fetched after add_booking_state.sql. See
  // bookingState() in AdminEnquiryCommon.tsx.
  booking_state: 'active' | 'cancelled';
  // Stamped when an admin marks the traveller checked in for the trip via
  // checkInEnquiry(). Null means not checked in yet.
  checked_in_at?: string | null;
  // Reminder date for a still-warm Contacted lead that isn't ready to be
  // closed either way ("checking with family, call back Aug 15") — a
  // layer on top of the Contacted stage, not a terminal status. Only ever
  // set while status === 'contacted' (see
  // supabase/migration/add_enquiry_follow_up.sql's check constraint) and
  // cleared automatically by refreshJourneyStage() in services/api.ts the
  // moment the lead moves past that stage. 'YYYY-MM-DD', no time component.
  follow_up_at?: string | null;
  // Companion time-of-day for follow_up_at above, 'HH:MM' 24-hour. Only
  // ever set alongside a follow_up_at date — see
  // add_contact_outcome.sql.
  follow_up_time?: string | null;
  // What was recorded the last time an admin logged a "Record Contact
  // Outcome" call against this lead — see ContactOutcome above,
  // ContactOutcomeModal.tsx, and recordContactOutcome() in services/api.ts.
  // Reflects only the most recent call, not a full history.
  last_contact_outcome?: ContactOutcome | null;
  last_contact_notes?: string | null;
  last_contact_at?: string | null;
  // Booking Follow-up (CRM spec section 8B) — a reminder for something that
  // needs chasing after the booking has started (balance payment,
  // passport, documents, etc.), completely separate from the Lead
  // Follow-up fields above. See canSetBookingFollowUp/bookingFollowUpStatus
  // in AdminEnquiryCommon.tsx and add_booking_follow_up.sql for the DB
  // constraint keeping the two windows from overlapping on the same row.
  booking_follow_up_at?: string | null;
  booking_follow_up_time?: string | null;
  booking_follow_up_type?: BookingFollowUpType | null;
  booking_follow_up_notes?: string | null;
}

// One row per individual payment, refund, or raised-but-uncollected invoice
// against an enquiry. This is the source of truth for enquiries.amount_paid
// / refund_amount, which are kept in sync via a DB trigger (only rows with
// status = 'paid' count towards either sum) — never write those columns
// directly once you're recording a real payment event; insert here instead.
//
// Every row doubles as an "invoice": invoice_number is assigned
// automatically on insert (e.g. 'INV-2026-00101'), and status distinguishes
// money actually collected ('paid') from an invoice that's been raised but
// not yet paid ('pending') — e.g. a balance/installment invoice generated
// ahead of collection, or an extra charge not yet settled. See
// add_invoice_generation.sql.
export interface Payment {
  id: string;
  enquiry_id: string;
  amount: number;
  payment_type: 'booking_amount' | 'balance' | 'installment' | 'refund' | 'full_payment' | 'advance' | 'extra_charge';
  payment_method?: string;
  // Bank/UPI transaction reference, manually entered by the admin — N/A for
  // cash. Distinct from invoice_number (ULAA's own auto-assigned per-
  // transaction identifier). See add_payment_utr_reference.sql.
  utr_number?: string | null;
  paid_at: string;
  notes?: string;
  created_at: string;
  invoice_number?: string | null;
  status: 'paid' | 'pending';
}

// =============================================
// Activity Timeline (CRM spec section 14)
// =============================================
// One immutable row per meaningful action taken on an enquiry/booking —
// never updated or deleted after insert (see add_activity_log.sql and
// logActivity() in services/api.ts). `action` is a short, already-formatted
// label ("Advance received", "Checked In", ...); `details` is an optional
// one-line elaboration ("₹5,000 via UPI"). Deliberately just two free-text
// columns rather than a typed enum + structured payload — the timeline is
// read-only display, not something other code branches on, so a rigid
// schema would add ceremony without adding safety.
export interface ActivityLogEntry {
  id: string;
  enquiry_id: string;
  action: string;
  details?: string | null;
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

// A snapshot of everything the user has typed/picked into BookingForm so
// far, whether or not it's been submitted yet. Lets the page that owns the
// booking modal (TripDetailPage) hold onto an in-progress entry across the
// modal being closed and reopened — see BookingForm's initialDraft /
// onDraftChange props. All text fields are plain strings (matching what
// the inputs actually hold), not the parsed/typed shape BookingFormData
// expects on submit.
export interface BookingFormDraft {
  bookingMode: BookingMode;
  groupSize: number;
  groupVegCount: number;
  foodPreference: 'veg' | 'non_veg' | null;
  full_name: string;
  age: string;
  phone: string;
  email: string;
  city: string;
  emergency_contact: string;
  message: string;
  terms_accepted: boolean;
}

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
  status: 'waiting' | 'notified' | 'converted' | 'declined' | 'expired';
  notified_at?: string | null;
  // Set automatically alongside notified_at whenever an offer goes out
  // (updateWaitlistStatus('notified')) — see WAITLIST_OFFER_WINDOW_HOURS in
  // services/api.ts. Cleared if the entry moves back to 'waiting' (offer
  // withdrawn) or forward to 'converted'/'declined'/'expired'. Purely
  // advisory: nothing auto-expires the row on its own, an admin still has
  // to act (convert, decline, or explicitly mark Expired) — see
  // add_waitlist_offer_expiry.sql.
  offer_expiry?: string | null;
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
  /** Icon-library key (see constants/tripHighlightIcons.ts). Falls back to a default rotation if unset. */
  icon?: string;
}

export interface AboutFounderSocialLink {
  platform: string;
  url: string;
}

// =============================================
// Home Page Hero Carousel (editable via its own Admin tab, stored under the
// 'home_hero' site_content key). Each slide is an admin-uploaded photo;
// order in the `slides` array is the display/rotation order, controlled by
// the admin's Move Up/Down buttons in AdminHomeHero.tsx.
// =============================================
export interface HomeHeroSlide {
  /** Stable id (not the array index) so React keys survive reordering. */
  id: string;
  image: string;
  /** Optional tall crop for phone screens; falls back to `image` if empty. */
  mobile_image: string;
  /** Inactive slides are kept (not deleted) but skipped on the live site. */
  active: boolean;
  // Headline is split into 3 parts rather than one free-text field so the
  // middle segment can always render in the accent color + italic (e.g.
  // "Girls-only" / "travel" / "experiences.") without the admin needing to
  // hand-write markup. Each slide carries its own copy so the headline can
  // change alongside the photo as the carousel rotates — see
  // HeroSection.tsx and AdminHomeHero.tsx.
  heading_line1: string;
  heading_highlight: string;
  heading_line2: string;
  subheading: string;
}

export interface HomeHeroContent {
  slides: HomeHeroSlide[];
  autoplay: boolean;
  /** Seconds between automatic slide changes. */
  interval_seconds: number;
  // Fallback headline used only when there are zero active slides (the
  // hard-coded static hero image case — see heroImg in HeroSection.tsx) and
  // as the starting text pre-filled onto newly added slides in
  // AdminHomeHero.tsx. Not directly editable in the admin UI; per-slide
  // headline text above is what admins actually manage.
  heading_line1: string;
  heading_highlight: string;
  heading_line2: string;
  subheading: string;
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
  // 3. To Unforgettable Journeys (contains Have You Ever... and Welcome to Ulaa)
  journey_intro: {
    /** Small italic line above the heading, e.g. "From Worries" */
    sub_heading: string;
    /** Main heading, e.g. "To Unforgettable Journeys" */
    heading: string;
    /** Supporting sentence under the heading, e.g. "We turn your travel worries into beautiful experiences." */
    description: string;
    have_you_ever: {
      heading: string;
      items: AboutHaveYouEverItem[];
    };
    welcome_to_ulaa: {
      heading: string;
      subheading: string;
      items: AboutWelcomeItem[];
    };
  };
  // 5. Why Ulaa is Different (up to 6 cards)
  why_different: {
    /** Small script line above the heading, e.g. "Beyond the Ordinary" */
    sub_heading: string;
    heading: string;
    subheading: string;
    cards: AboutWhyDifferentCard[];
  };
  // 6. Our Community
  community: {
    /** Small script line above the heading, e.g. "Together We Thrive" */
    sub_heading: string;
    heading: string;
    subheading: string;
    photos: string[];
  };
  // 7. Statistics (Girls Travelled, Trips Completed, Destinations)
  // The three numbers are always derived live from real completed-trip data
  // (see AboutPage.tsx / CompletedTripsPage.tsx) — only the labels below are
  // admin-editable, and are shared by both pages so they always match.
  stats: {
    girls_travelled: number;
    destinations: number;
    friendships_made: number;
    avg_trip_rating: number;
    /** Label under the "girls travelled" number, e.g. "Girls travelled" */
    girls_travelled_label: string;
    /** Label under the "trips completed" number, e.g. "Trips completed" */
    trips_completed_label: string;
    /** Label under the "destinations" number, e.g. "Destinations" */
    destinations_label: string;
  };
  // 8. What Our Girls Say — fetched from existing Testimonials module
  testimonials: {
    /** Small script line above the heading, e.g. "Stories That Inspire" */
    sub_heading: string;
    heading: string;
    subheading: string;
  };
  // 9. Your Ulaa Journey (5 steps)
  journey: {
    /** Small script line above the heading, e.g. "One Step Closer" */
    sub_heading: string;
    heading: string;
    subheading: string;
    steps: AboutJourneyStep[];
  };
}

// =============================================
// Meet the Founder (editable via its own Admin tab, stored under the
// 'founder' site_content key). Previously nested inside AboutContent, now
// its own shared source so the Home page, About page, and Upcoming Trips
// page all read/render the exact same data instead of each keeping their
// own copy.
// =============================================
export interface FounderContent {
  photo: string;
  name: string;
  designation: string;
  description: string;
  social_links: AboutFounderSocialLink[];
}

// =============================================
// Why ULAA / "Why Choose Us" cards (editable via Admin)
// =============================================
interface WhyUlaaFeature {
  image: string;
  title: string;
  description: string;
}

export interface WhyUlaaContent {
  sub_heading: string;
  heading: string;
  subheading: string;
  features: WhyUlaaFeature[];
}

// =============================================
// Testimonials section heading text (editable via Admin)
// =============================================
export interface TestimonialsSectionContent {
  sub_heading: string;
  heading: string;
  subheading: string;
}

// =============================================
// Mobile bottom nav bar tabs (editable via Admin)
// =============================================
export interface BottomNavItemConfig {
  /** Stable identifier — used as the React key and framer-motion layoutId anchor. */
  id: string;
  label: string;
  /** Route path, e.g. "/trips". */
  to: string;
  /** Icon library key from tripHighlightIcons.ts (e.g. "home", "calendar"). */
  icon: string;
}

// =============================================
// Trip CTA button text (editable via Admin — see AdminButtonLabels.tsx).
// Drives the main "Pack Your Bags" style buttons on TripDetailPage AND the
// equivalent CTA button on the generated trip itinerary PDF, so an admin
// only has to change the wording in one place for it to show everywhere.
// =============================================
export interface ButtonLabelsConfig {
  /** Shown on the main booking CTA when seats are available, e.g. "Pack Your Bags". */
  primaryCta: string;
  /** Shown on the same CTA once the trip is full, e.g. "Join Waitlist". */
  waitlistCta: string;
}
