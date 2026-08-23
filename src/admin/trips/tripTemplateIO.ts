import type { TripForm } from './tripFormTypes';
import { emptyFounder, emptyEndBanner, emptyForm, computeDuration } from './tripFormTypes';
import { DEFAULT_TERMS_AND_CONDITIONS } from '../../constants/terms';
import { DEFAULT_CANCELLATION_POLICY } from '../../constants/cancellationPolicy';
import { getTripHighlightIcon } from '../../constants/tripHighlightIcons';

// ── Export Template ──────────────────────────────────────────────────────
// Builds and downloads a blank, annotated JSON template mirroring every
// field on the Add Trip form. Meant to be handed to an external tool
// (e.g. ChatGPT, given trip photos) to fill in trip details, which the
// admin can then copy back into the Add Trip form by hand. This is an
// export-only helper — nothing here is read back into the app.
export const handleExportTemplate = () => {
  const template = {
    _instructions:
      'This is a blank template of the ULAA "Add Trip" admin form. Fill in every field ' +
      'with trip details (use the provided trip photos/notes as source material). ' +
      'Keep the JSON structure and key names exactly as-is — only replace the placeholder ' +
      'values. Leave a field as an empty string "" if there is truly nothing to fill in. ' +
      'Fields marked "(leave blank — uploaded manually)" are image uploads and cannot be ' +
      'filled from this template; leave those as empty strings, the admin will upload the ' +
      'actual photos in the app after pasting the rest of this back in.',
    title: '<Trip title, e.g. "Spiti Valley Winter Expedition">',
    destination: '<Destination, e.g. "Spiti, Himachal Pradesh">',
    start_date: '<Start date, format YYYY-MM-DD>',
    end_date: '<End date, format YYYY-MM-DD>',
    duration: '(auto-computed from start_date/end_date — leave blank)',
    description: '<Short 2-4 sentence overview. Day-by-day plan goes in itinerary below, not here>',
    min_age: '<Minimum eligible age as a number, or "" for no restriction>',
    max_age: '<Maximum eligible age as a number, or "" for no restriction>',
    itinerary: [
      {
        day: 1,
        title: '<Short title for this day, e.g. "Arrival & Local Exploration">',
        description: '<What happens this day>',
        images: ['(leave blank — uploaded manually)'],
        icon: '<Optional icon-library key for this day\'s theme, e.g. "palmtree", "coffee", "paw-print", "mountain" — leave "" to just show the day number>',
        bullets: ['<Optional bulleted sub-item for this day, e.g. "Guided trek to the viewpoint">'],
      },
    ],
    not_included: ['<Short line item of what is NOT included, e.g. "Flights to base city">'],
    meeting_point: '<Free-text meeting point label, e.g. "Delhi Airport Terminal 3">',
    meeting_point_map_url: '<Google Maps link for the meeting point, or "">',
    meeting_time: '<Meeting time, e.g. "6:00 AM">',
    meeting_terminal: '<Terminal/gate/landmark detail, or "">',
    meeting_address: '<Full street address of the meeting point, or "">',
    meeting_details: '<Any extra logistics notes for the meeting point, or "">',
    faqs: [
      { question: '<Frequently asked question>', answer: '<Answer>' },
    ],
    total_seats: '<Total number of seats as a number, e.g. 15>',
    seats_booked: 0,
    price: '<Regular price per person in INR as a number>',
    early_bird_price: '<Early bird price per person in INR as a number, or "">',
    early_bird_deadline: '<Early bird deadline, format YYYY-MM-DD, or "">',
    strike_through_price: '<Optional "was ₹X" marketing price as a number, or "">',
    advance_amount: '<Optional advance/reservation amount in INR as a number, or "">',
    card_feature_tags: [
      { icon: '<Icon-library key, NOT an emoji — e.g. "venus", "crown", "map-pinned". See src/constants/tripHighlightIcons.ts.>', label: '<Short bold label, e.g. "Girls-Only">' },
    ],
    trip_type: '<"domestic" or "international", or "" if not set>',
    cover_image: '(leave blank — uploaded manually)',
    hero_mobile_image: '(leave blank — uploaded manually)',
    terms_and_conditions: '(leave as default unless the trip needs custom terms)',
    cancellation_policy: {
      payment_due_days: '<Days before departure the remaining balance is due, as a number>',
      tiers: [
        {
          min_days: '<Minimum days-before-departure for this tier (inclusive), or null for no lower bound>',
          max_days: '<Maximum days-before-departure for this tier (inclusive), or null for no upper bound>',
          description: '<Refund treatment for this window, e.g. "Full refund minus processing fee">',
        },
      ],
      refund_min_days: '<Fastest number of working days an approved refund is processed in>',
      refund_max_days: '<Slowest number of working days an approved refund is processed in>',
    },
    status: 'draft',
    // ── Extended content blocks ──────────────────────────────────────
    // Note: included_items, not_included_items, and gallery_images are
    // deliberately left out of this template. They're legacy fallback
    // fields (see UpcomingTrip in types-index.ts) with no editor in the
    // current Add Trip form — included_groups, the plain "not_included"
    // tag list, and gallery_items replaced them — so there'd be no way
    // to review a filled-in value before saving.
    highlight_cards: [
      { icon: '<Icon-library key, NOT an emoji — same key system as itinerary.icon, e.g. "mountain-snow", "camera", "car", "palmtree". See src/constants/tripHighlightIcons.ts for the full list. An emoji here silently falls back to plain text instead of the colored icon circle used elsewhere on the page. Include at least 6 cards — this section looks sparse with fewer than 6>', heading: '<Short heading>', description: '<1-2 sentence description>' },
    ],
    accommodation_description: '<"Stay. Relax. Repeat." section body — describe the accommodation>',
    accommodation_photos: ['(leave blank — uploaded manually, or paste at least 6 source photo URLs — this gallery looks sparse with fewer than 6)'],
    included_groups: [
      {
        icon: '<Icon-library key, NOT an emoji — e.g. "hotel", "utensils", "car". See src/constants/tripHighlightIcons.ts. Include at least 4 groups — this section looks sparse with fewer than 4>',
        heading: '<Group heading, e.g. "Premium Stay Experience">',
        bullets: ['<Bulleted sub-item under this heading, e.g. "5 Nights accommodation at carefully selected 4-star and beachfront properties">'],
      },
    ],
    gallery_items: [
      { photo: '(leave blank — uploaded manually)', description: '<Caption / place name for this photo>' },
    ],
    gallery_description: '<Short intro paragraph shown below the "Places You\'ll Definitely Post" heading, or "">',
    fashion_photos: ['(leave blank — uploaded manually, or paste at least 6 source photo URLs — this gallery looks sparse with fewer than 6)'],
    fashion_description: '<Short intro paragraph shown below the "Fashion Aesthetics" heading, or "">',
    things_to_carry_items: [
      { icon: '<Icon-library key, NOT an emoji — e.g. "shirt", "footprints", "hand", "glasses", "pill". See src/constants/tripHighlightIcons.ts>', description: '<Item traveller should pack, e.g. "Warm jacket">' },
    ],
    trip_founder: {
      photo: '(leave blank — uploaded manually)',
      name: '<Founder/host name for this trip>',
      designation: '<Designation or role, e.g. "Founder & CEO, ULAA" (optional)>',
      description: '<Short founder bio/description for this trip>',
    },
    confidence_items: [
      { icon: '<Icon-library key, NOT an emoji — e.g. "shield-check", "headset", "users". See src/constants/tripHighlightIcons.ts. Include at least 6 items — this section looks sparse with fewer than 6>', description: '<"Travel with Confidence" point, e.g. "24/7 support during the trip">' },
    ],
    confidence_description: '<Short intro paragraph shown below the "Travel with Confidence" heading, or "">',
    end_banner: {
      image: '(leave blank — uploaded manually)',
      heading: '<End banner heading>',
      description: '<End banner description>',
      cta_label: '<Call-to-action button text, e.g. "Book Now">',
      cta_url: '<Call-to-action link, or "">',
    },
  };

  const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ulaa-add-trip-template.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

// Reads a filled-in export template (e.g. produced by ChatGPT from
// handleExportTemplate's output) and populates the Add Trip form so the
// admin only has to review/adjust and upload photos before saving —
// instead of retyping everything by hand.
export const isPlaceholder = (v: unknown): boolean =>
  typeof v !== 'string' || v.trim() === '' || v.trim().startsWith('<') || v.trim().startsWith('(');

export const asStr = (v: unknown, fallback = ''): string => (isPlaceholder(v) ? fallback : String(v));

// Real numbers (e.g. price: 18999 filled in directly as JSON, not as a
// string) are valid, filled-in values — only strings need the
// isPlaceholder check, since that's the only shape unfilled template
// placeholders ("<...>") ever take. Without this, any correctly-filled
// numeric field was wrongly treated as an unfilled placeholder and wiped
// to '' on import.
export const asNum = (v: unknown): number | '' => {
  if (typeof v === 'number') return isNaN(v) ? '' : v;
  if (isPlaceholder(v)) return '';
  const n = Number(v);
  return isNaN(n) ? '' : n;
};

export const asNumOrNull = (v: unknown): number | null => {
  if (v === null) return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  if (isPlaceholder(v)) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
};

export const asStrArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter(item => !isPlaceholder(item)).map(item => String(item)) : [];

// Imported JSON is a common source of `icon` values that bypass the
// TripHighlightIconPicker (e.g. an externally-drafted template filled in
// with emoji). TripHighlightIconDisplay only renders the colored icon
// circle for a recognized icon-library key — anything else silently
// falls back to plain text/emoji. Map the emoji admins have actually used
// in past templates to their nearest icon-library key on import, so the
// trip renders correctly without the admin having to notice and fix it
// by hand afterwards. Anything already a valid key, or not in this map,
// passes through unchanged (preserving today's fallback behavior).
export const LEGACY_EMOJI_TO_ICON_KEY: Record<string, string> = {
  '🏔️': 'mountain-snow', '🏔': 'mountain-snow', '⛰️': 'mountain', '⛰': 'mountain',
  '🚐': 'car', '🚌': 'car', '🚗': 'car', '🚕': 'car', '✈️': 'plane', '✈': 'plane',
  '🚂': 'train-front', '🚡': 'cable-car', '📸': 'camera', '📷': 'camera',
  '🏨': 'hotel', '🛏️': 'hotel', '🛏': 'hotel', '🍽️': 'utensils', '🍽': 'utensils',
  '🍳': 'utensils', '☕': 'coffee', '🍷': 'wine', '🍺': 'beer',
  '🛡️': 'shield-check', '🛡': 'shield-check', '📞': 'headset', '☎️': 'phone', '☎': 'phone',
  '👭': 'users', '👥': 'users', '🤝': 'handshake', '✅': 'badge-check',
  '🏕️': 'tent', '🏕': 'tent', '⛺': 'tent', '🌲': 'trees', '🌳': 'tree-deciduous',
  '🏖️': 'palmtree', '🏖': 'palmtree', '🌴': 'palmtree', '🌊': 'waves', '⛱️': 'umbrella', '⛱': 'umbrella',
  '🛍️': 'shopping-bag', '🛍': 'shopping-bag', '🎁': 'gift', '🎫': 'ticket', '🎵': 'music',
  '❄️': 'snowflake', '❄': 'snowflake', '☀️': 'sun', '☀': 'sun', '🏛️': 'landmark', '🏛': 'landmark',
  '🏠': 'building-2', '🏡': 'building-2', '🕐': 'clock', '🔒': 'lock',
  '🧥': 'shirt', '🥾': 'footprints', '👢': 'footprints', '🧤': 'hand',
  '🕶️': 'glasses', '🕶': 'glasses', '🧢': 'hat-glasses', '👒': 'hat-glasses',
  '🔋': 'battery-charging', '💊': 'pill', '🆔': 'id-card', '🪪': 'id-card',
  '💧': 'glass-water', '🥤': 'glass-water', '🎒': 'backpack',
};

export const asIconKey = (v: unknown): string => {
  const s = asStr(v);
  if (!s) return s;
  if (getTripHighlightIcon(s)) return s; // already a valid key
  return LEGACY_EMOJI_TO_ICON_KEY[s] ?? s; // map known legacy emoji, else pass through unchanged
};


// ── Import Template ──────────────────────────────────────────────────────
// Reads a filled-in export template (e.g. produced by ChatGPT from
// handleExportTemplate's output) and returns a TripForm so the admin only
// has to review/adjust and upload photos before saving — instead of
// retyping everything by hand. Throws if `raw` isn't parseable JSON shaped
// like the template; the caller is responsible for catching that and
// showing an "Import failed" message.
export function parseImportedTripForm(raw: any): TripForm {
  const imported: TripForm = {
      title: asStr(raw.title),
      destination: asStr(raw.destination),
      start_date: asStr(raw.start_date),
      end_date: asStr(raw.end_date),
      duration: computeDuration(asStr(raw.start_date), asStr(raw.end_date)),
      description: asStr(raw.description),
      itinerary: Array.isArray(raw.itinerary)
        ? raw.itinerary.map((d: Record<string, unknown>, i: number) => ({
            day: asNum(d?.day) || i + 1,
            title: asStr(d?.title),
            description: asStr(d?.description),
            images: asStrArray(d?.images),
            icon: asIconKey(d?.icon),
            bullets: asStrArray(d?.bullets),
          }))
        : [],
      not_included: asStrArray(raw.not_included),
      meeting_point: asStr(raw.meeting_point),
      meeting_point_map_url: asStr(raw.meeting_point_map_url),
      meeting_time: asStr(raw.meeting_time),
      meeting_terminal: asStr(raw.meeting_terminal),
      meeting_details: asStr(raw.meeting_details),
      faqs: Array.isArray(raw.faqs)
        ? raw.faqs
            .filter((f: Record<string, unknown>) => !isPlaceholder(f?.question) || !isPlaceholder(f?.answer))
            .map((f: Record<string, unknown>) => ({ question: asStr(f?.question), answer: asStr(f?.answer) }))
        : [],
      total_seats: asNum(raw.total_seats) || emptyForm.total_seats,
      seats_booked: asNum(raw.seats_booked) || 0,
      min_age: asNum(raw.min_age),
      max_age: asNum(raw.max_age),
      price: asNum(raw.price),
      early_bird_price: asNum(raw.early_bird_price),
      early_bird_deadline: asStr(raw.early_bird_deadline),
      strike_through_price: asNum(raw.strike_through_price),
      advance_amount: asNum(raw.advance_amount),
      trip_type: raw.trip_type === 'domestic' || raw.trip_type === 'international' ? raw.trip_type : '',
      // Imported the same way itinerary images always were: real URLs
      // (e.g. Wikimedia/Unsplash links an admin filled in) come through
      // as-is; leftover template placeholders like "(leave blank —
      // uploaded manually)" still resolve to '' via isPlaceholder/asStr,
      // so an untouched export template still opens with blank fields.
      cover_image: asStr(raw.cover_image),
      cover_image_crop: null,
      hero_mobile_image: asStr(raw.hero_mobile_image),
      terms_and_conditions: isPlaceholder(raw.terms_and_conditions) ? DEFAULT_TERMS_AND_CONDITIONS : raw.terms_and_conditions,
      cancellation_policy: raw.cancellation_policy ? {
        payment_due_days: asNum(raw.cancellation_policy.payment_due_days) || DEFAULT_CANCELLATION_POLICY.payment_due_days,
        tiers: Array.isArray(raw.cancellation_policy.tiers)
          ? raw.cancellation_policy.tiers.map((t: Record<string, unknown>) => ({
              min_days: asNumOrNull(t?.min_days),
              max_days: asNumOrNull(t?.max_days),
              description: asStr(t?.description),
            }))
          : DEFAULT_CANCELLATION_POLICY.tiers,
        refund_min_days: asNum(raw.cancellation_policy.refund_min_days) || DEFAULT_CANCELLATION_POLICY.refund_min_days,
        refund_max_days: asNum(raw.cancellation_policy.refund_max_days) || DEFAULT_CANCELLATION_POLICY.refund_max_days,
      } : DEFAULT_CANCELLATION_POLICY,
      status: 'draft',
      highlight_cards: Array.isArray(raw.highlight_cards)
        ? raw.highlight_cards.map((c: Record<string, unknown>) => ({ icon: asIconKey(c?.icon), heading: asStr(c?.heading), description: asStr(c?.description) }))
        : [],
      card_feature_tags: Array.isArray(raw.card_feature_tags)
        ? raw.card_feature_tags.slice(0, 4).map((t: Record<string, unknown>) => ({ icon: asIconKey(t?.icon), label: asStr(t?.label), sublabel: asStr(t?.sublabel) }))
        : [],
      accommodation_description: asStr(raw.accommodation_description),
      accommodation_photos: asStrArray(raw.accommodation_photos),
      included_groups: Array.isArray(raw.included_groups)
        ? raw.included_groups.map((g: Record<string, unknown>) => ({
            icon: asIconKey(g?.icon),
            heading: asStr(g?.heading),
            bullets: asStrArray(g?.bullets),
          }))
        : [],
      gallery_items: Array.isArray(raw.gallery_items)
        ? raw.gallery_items.map((g: Record<string, unknown>) => ({ photo: asStr(g?.photo), description: asStr(g?.description) }))
        : [],
      gallery_description: asStr(raw.gallery_description),
      fashion_photos: asStrArray(raw.fashion_photos),
      fashion_description: asStr(raw.fashion_description),
      things_to_carry_items: Array.isArray(raw.things_to_carry_items)
        ? raw.things_to_carry_items.map((c: Record<string, unknown>) => ({ icon: asIconKey(c?.icon), description: asStr(c?.description) }))
        : [],
      trip_founder: raw.trip_founder
        ? { photo: asStr(raw.trip_founder.photo), name: asStr(raw.trip_founder.name), designation: asStr(raw.trip_founder.designation), description: asStr(raw.trip_founder.description) }
        : emptyFounder,
      confidence_items: Array.isArray(raw.confidence_items)
        ? raw.confidence_items.map((c: Record<string, unknown>) => ({ icon: asIconKey(c?.icon), description: asStr(c?.description) }))
        : [],
      confidence_description: asStr(raw.confidence_description),
      meeting_address: asStr(raw.meeting_address),
      end_banner: raw.end_banner
        ? {
            image: asStr(raw.end_banner.image),
            heading: asStr(raw.end_banner.heading),
            description: asStr(raw.end_banner.description),
            cta_label: asStr(raw.end_banner.cta_label),
            cta_url: asStr(raw.end_banner.cta_url),
          }
        : emptyEndBanner,
    };
  return imported;
}
