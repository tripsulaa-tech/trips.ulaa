import type {
  ItineraryDay, FAQ, CancellationPolicy,
  TripHighlightCard, TripInclusionItem, TripIncludedGroup, TripGalleryItem,
  TripConfidenceItem, TripCardFeatureTag, TripEndBanner, CoverImageCrop,
  TripFinance,
} from '../../types/types-index';
import { DEFAULT_TERMS_AND_CONDITIONS } from '../../constants/terms';
import { DEFAULT_CANCELLATION_POLICY } from '../../constants/cancellationPolicy';
import { emptyTripFinance } from '../../utils/tripFinance';

export interface TripForm {
  title: string;
  destination: string;
  start_date: string;
  end_date: string;
  duration: string;
  description: string;
  itinerary: ItineraryDay[];
  not_included: string[];
  meeting_point: string;
  meeting_point_map_url: string;
  meeting_time: string;
  meeting_terminal: string;
  meeting_details: string;
  faqs: FAQ[];
  total_seats: number;
  seats_booked: number;
  // Optional age eligibility range. Blank ('') means no restriction on
  // that side — see the DB check constraints in add_trip_age_range.sql.
  min_age: number | '';
  max_age: number | '';
  price: number | '';
  early_bird_price: number | '';
  early_bird_deadline: string;
  strike_through_price: number | '';
  // Optional advance/reservation amount (₹) shown on the public trip page's
  // booking panel instead of the "Seats available" badge. '' means "not
  // set" (stored as null) — see add_trip_advance_amount.sql.
  advance_amount: number | '';
  // Up to 4 fixed marketing tags shown in the icon row on the public Trip
  // Card, e.g. "Girls-Only" / "Safe & fun". Empty array falls back to
  // TripCard's auto-generated tags — see add_trip_card_feature_tags.sql.
  card_feature_tags: TripCardFeatureTag[];
  // '' means "not set" (stored as null) — see UpcomingTrip.trip_type in
  // types-index.ts for why this matters to the DB's refund logic.
  trip_type: 'domestic' | 'international' | '';
  cover_image: string;
  // Saved position/zoom for cover_image (see CoverImageCrop in
  // types-index.ts). null means "no crop saved" — every layout falls back
  // to its plain centered object-cover, so existing trips are unaffected.
  cover_image_crop: CoverImageCrop | null;
  // Separately-uploaded image for the Mobile Hero banner (see
  // hero_mobile_image in types-index.ts). '' means "not set" — falls
  // back to the cropped cover_image on mobile.
  hero_mobile_image: string;
  terms_and_conditions: string;
  cancellation_policy: CancellationPolicy;
  // Single lifecycle status — see status in types-index.ts.
  status: 'draft' | 'coming_soon' | 'published';
  // ── Extended content blocks ──────────────────────────────────────────
  highlight_cards: TripHighlightCard[];
  accommodation_description: string;
  accommodation_photos: string[];
  included_groups: TripIncludedGroup[];
  gallery_items: TripGalleryItem[];
  gallery_description: string;
  fashion_photos: string[];
  fashion_description: string;
  things_to_carry_items: TripInclusionItem[];
  // '' means "not linked to a directory entry" (stored as null) — see
  // TripLeader in types-index.ts and AdminTripLeaders.tsx for the
  // directory this is assigned from. The public page/PDF render the
  // linked leader's photo/name/designation/description live — there's no
  // per-trip override to type here anymore.
  trip_leader_id: string;
  confidence_items: TripConfidenceItem[];
  confidence_description: string;
  meeting_address: string;
  end_banner: TripEndBanner;
  // Internal-only cost/profit record — see TripFinance and the "Finances &
  // Profit" tab. Never rendered on the public site.
  trip_finance: TripFinance;
}

export const emptyEndBanner: TripEndBanner = { image: '', heading: '', description: '', cta_label: '', cta_url: '' };

export const emptyForm: TripForm = {
  title: '', destination: '', start_date: '', end_date: '', duration: '',
  description: '', itinerary: [], not_included: [],
  meeting_point: '', meeting_point_map_url: '',
  meeting_time: '', meeting_terminal: '', meeting_details: '', faqs: [], total_seats: 15, seats_booked: 0,
  min_age: '', max_age: '', price: '',
  early_bird_price: '', early_bird_deadline: '', strike_through_price: '', advance_amount: '', card_feature_tags: [], trip_type: '',
  cover_image: '', cover_image_crop: null, hero_mobile_image: '', terms_and_conditions: DEFAULT_TERMS_AND_CONDITIONS,
  cancellation_policy: DEFAULT_CANCELLATION_POLICY, status: 'draft',
  // Extended
  highlight_cards: [], accommodation_description: '', accommodation_photos: [],
  included_groups: [], gallery_items: [], gallery_description: "Views worth every post. Memories worth even more.",
  fashion_photos: [], fashion_description: 'Styles that speaks, moments that stay.', things_to_carry_items: [],
  confidence_items: [], confidence_description: 'We take care of Everything, so you can Enjoy Every Moment!',
  trip_leader_id: '',
  meeting_address: '', end_banner: emptyEndBanner,
  trip_finance: emptyTripFinance,
};

// Computes a "X Days / Y Nights" string from two yyyy-mm-dd date strings.
// Falls back to '' if either date is missing/invalid, and never returns a negative duration.
export const computeDuration = (startDate: string, endDate: string): string => {
  if (!startDate || !endDate) return '';
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return '';
  const msPerDay = 1000 * 60 * 60 * 24;
  const nights = Math.round((end.getTime() - start.getTime()) / msPerDay);
  if (nights < 0) return '';
  const days = nights + 1;
  return `${days} Day${days !== 1 ? 's' : ''} / ${nights} Night${nights !== 1 ? 's' : ''}`;
};
