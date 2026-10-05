import type { TripForm } from './tripFormTypes';
import { emptyEndBanner, emptyForm, computeDuration } from './tripFormTypes';
import type { TripFinance, TripCostItem, TripOrganiserExpense, TripCostBasis, TripOptionsConfig, TripOption, TripPackage } from '../../types/types-index';
import { emptyTripFinance } from '../../utils/tripFinance';
import { emptyTripOptions, newOptionId } from '../../utils/tripOptions';
import { DEFAULT_TERMS_AND_CONDITIONS } from '../../constants/terms';
import { DEFAULT_CANCELLATION_POLICY } from '../../constants/cancellationPolicy';
import { getTripHighlightIcon } from '../../constants/tripHighlightIcons';

// ── Export Template ──────────────────────────────────────────────────────
// Builds and downloads a blank, annotated JSON template mirroring the
// Add/Edit Trip form. Keys are ordered exactly like the form's tabs (Basic
// Info → Pricing & Availability → Finances & Profit → Media → Overview &
// Itinerary → Inclusions & Prep → Accommodation → Meeting Point → End Banner
// → FAQs → Cancellation Policy → Publish), so a person or tool filling it in
// can follow the form top to bottom. Meant to be handed to an external tool
// (e.g. ChatGPT, given trip photos) to fill in trip details, then loaded back
// through Import Template (see parseImportedTripForm below).
//
// Not part of the template: Trip Leader (a link to the Trip Leaders
// directory, not free text — assign it from the Trip Leader tab after
// importing) and Terms & Conditions (the default is kept unless the template
// supplies custom text).
export const handleExportTemplate = () => {
  const template = {
    _instructions:
      'This is a blank template of the Ulaa "Add/Edit Trip" admin form. Keys follow the form\'s tabs ' +
      'from top to bottom. Fill in every field with trip details (use the provided trip photos/notes ' +
      'as source material). Keep the JSON structure and key names exactly as-is — only replace the ' +
      'placeholder values. Leave a field as an empty string "" if there is truly nothing to fill in. ' +
      'Fields marked "(leave blank — uploaded manually)" are image uploads and cannot be filled from ' +
      'this template; leave those as empty strings, the admin will upload the actual photos in the app ' +
      'after importing. The "trip_finance" block is INTERNAL (never shown on the public site) — fill it ' +
      'only if cost details are provided, otherwise leave its values blank.',

    // ── Tab: Basic Info ─────────────────────────────────────────────
    title: '<Trip Title, e.g. "Spiti Valley Winter Expedition">',
    destination: '<Destination, e.g. "Spiti, Himachal Pradesh">',
    duration: '(auto-computed from start_date/end_date — leave blank)',
    start_date: '<Start Date, format YYYY-MM-DD>',
    end_date: '<End Date, format YYYY-MM-DD>',
    min_age: '<Min Age as a number, or "" for no limit>',
    max_age: '<Max Age as a number, or "" for no limit>',
    description: '<Short 2-4 sentence overview. Day-by-day plan goes in itinerary below, not here>',

    // ── Tab: Pricing & Availability ─────────────────────────────────
    total_seats: '<Total Seats as a number, e.g. 15>',
    seats_booked: 0,
    trip_type: '<"domestic" or "international", or "" if not set. Sets the default cancellation rules>',
    early_bird_deadline: '<Early-Bird Deadline, format YYYY-MM-DD, or "">',
    price: '<Regular Price per person in INR as a number>',
    strike_through_price: '<Strikeout Price per person in INR (old price shown crossed out), or "">',
    early_bird_price: '<Early-Bird Price per person in INR as a number, or "">',
    advance_amount: '<Advance/Reservation Amount in INR as a number, or "" to show seats left instead>',
    special_offer_name: '<Optional flash offer name, e.g. "Diwali Dhamaka", or "">',
    special_offer_price: '<Offer Price per person in INR as a number, or "">',
    special_offer_date: '<Offer Start Date, format YYYY-MM-DD, or "">',
    special_offer_end_date: '<Offer End Date (inclusive), format YYYY-MM-DD, e.g. 3 days after special_offer_date for a 3-day sale, or "" to run it for the start date only>',
    card_feature_tags: [
      { icon: '<Icon-library key, NOT an emoji — e.g. "venus", "crown", "map-pinned". See src/constants/tripHighlightIcons.ts. Up to 4 tags>', label: '<Short bold label, e.g. "Girls-Only">' },
    ],
    // Packages & add-ons travelers can choose from. Leave both lists empty
    // for a plain single-price trip. A package's price is either its own
    // "price" or, when blank, derived as the trip price + its options. The
    // "id" values below are just local names used to link packages to
    // options (e.g. "water") — real ids are generated on import.
    trip_options: {
      options: [
        { id: '<Short local id, e.g. "water">', name: '<Option name, e.g. "Water Activities">', description: '<Short public blurb, or "">', price: '<Extra price per person in INR as a number, or "">' },
      ],
      packages: [
        {
          name: '<Package name, e.g. "Basic" or "Premium">',
          description: '<Short public blurb, or "">',
          option_ids: ['<id of an option above that this package includes — leave the list empty for the base trip only>'],
          highlight: false,
          early_bird: false,
          price: '<Package price per person in INR, or "" to derive it from the trip price + options>',
          early_bird_price: '<Package early-bird price in INR (only used when early_bird is true and price is set), or "">',
        },
      ],
    },

    // ── Tab: Finances & Profit (INTERNAL — never shown publicly) ────
    trip_finance: {
      // Ulaa's Costs — one line per cost (ads, tickets, kits, transport, stay, food...)
      cost_items: [
        {
          name: '<Cost name, e.g. "Transport", "Ad / Promotion", "Entry Ticket">',
          basis: '<"fixed" (lump sum), "per_traveler" (rate × every booked traveler) or "per_selected" (rate × a headcount)>',
          rate: '<INR — the lump sum for "fixed", otherwise INR per person>',
          quantity: '<Headcount, only for "per_selected" lines not linked to an option, or "">',
          option_id: '<Optional: id of a trip_options option to count the headcount from real bookings, or "">',
        },
      ],
      // On-Ground Agency
      agency_name: '<Agency Name, e.g. "Spiceland Holidays">',
      agency_amount_type: '<"fixed" (one total) or "per_traveler" (a rate per person)>',
      agency_amount: '<Amount Paid to the agency in INR (total or per person, per agency_amount_type), or "">',
      // Child Fare — one flat rate for the whole trip
      child_fare_amount: '<Child Fare Amount charged to the traveler per child, in INR, or "">',
      child_fare_vendor_amount: '<Vendor Amount Ulaa pays the agency per child, in INR, or "">',
      child_fare_entry_ticket_cost: '<Entry Ticket Cost per child, in INR, or "">',
      child_fare_kit_cost: '<Kit Cost per child, in INR (0 only if no kit is given), or "">',
      // Trip Organiser's Expenses — one line per expense, actual amounts, not multiplied by traveler count
      organiser_name: '<Organiser Name, the person running the trip on the ground, or "">',
      organiser_expenses: [
        {
          name: '<Expense name, e.g. "Travel Tickets", "Agency Payment", "Miscellaneous", "Own Entry Ticket">',
          amount: '<Actual amount spent in INR (not multiplied by traveler count)>',
        },
      ],
      notes: '<Internal notes — payment terms, receipts, or "">',
    },

    // ── Tab: Media ──────────────────────────────────────────────────
    cover_image: '(leave blank — uploaded manually)',
    hero_mobile_image: '(leave blank — uploaded manually)',
    // Note: included_items, not_included_items, and gallery_images are
    // deliberately left out of this template. They're legacy fallback
    // fields (see UpcomingTrip in types-index.ts) with no editor in the
    // current form — included_groups, the plain "not_included" tag list,
    // and gallery_items replaced them — so there'd be no way to review a
    // filled-in value before saving.
    gallery_description: '<Short intro paragraph shown below the "Places You\'ll Definitely Post" heading, or "">',
    gallery_items: [
      { photo: '(leave blank — uploaded manually)', description: '<Caption / Place Name for this photo>' },
    ],
    fashion_description: '<Short intro paragraph shown below the "Fashion Aesthetics" heading, or "">',
    fashion_photos: ['(leave blank — uploaded manually, or paste at least 6 source photo URLs — this gallery looks sparse with fewer than 6)'],

    // ── Tab: Overview & Itinerary ───────────────────────────────────
    highlight_cards: [
      { icon: '<Icon-library key, NOT an emoji — same key system as itinerary.icon, e.g. "mountain-snow", "camera", "car", "palmtree". See src/constants/tripHighlightIcons.ts for the full list. An emoji here silently falls back to plain text instead of the colored icon circle used elsewhere on the page. Include at least 6 cards — this section looks sparse with fewer than 6>', heading: '<Short heading>', description: '<1-2 sentence description>' },
    ],
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

    // ── Tab: Inclusions & Prep ──────────────────────────────────────
    included_groups: [
      {
        icon: '<Icon-library key, NOT an emoji — e.g. "hotel", "utensils", "car". See src/constants/tripHighlightIcons.ts. Include at least 4 groups — this section looks sparse with fewer than 4>',
        heading: '<Group heading, e.g. "Premium Stay Experience">',
        bullets: ['<Bulleted sub-item under this heading, e.g. "5 Nights accommodation at carefully selected 4-star and beachfront properties">'],
      },
    ],
    not_included: ['<Short line item of what is NOT included, e.g. "Flights to base city">'],
    things_to_carry_items: [
      { icon: '<Icon-library key, NOT an emoji — e.g. "shirt", "footprints", "hand", "glasses", "pill". See src/constants/tripHighlightIcons.ts>', description: '<Item traveller should pack, e.g. "Warm jacket">' },
    ],
    confidence_description: '<Short intro paragraph shown below the "Travel with Confidence" heading, or "">',
    confidence_items: [
      { icon: '<Icon-library key, NOT an emoji — e.g. "shield-check", "headset", "users". See src/constants/tripHighlightIcons.ts. Include at least 6 items — this section looks sparse with fewer than 6>', description: '<"Travel with Confidence" point, e.g. "24/7 support during the trip">' },
    ],

    // ── Tab: Accommodation ──────────────────────────────────────────
    accommodation_description: '<Section Description for the "Stay. Relax. Repeat." section — describe the accommodation>',
    accommodation_photos: ['(leave blank — uploaded manually, or paste at least 6 source photo URLs — this gallery looks sparse with fewer than 6)'],

    // ── Tab: Meeting Point ──────────────────────────────────────────
    meeting_point: '<Location Name, e.g. "Delhi Airport Terminal 3">',
    meeting_address: '<Full street Address of the meeting point, or "">',
    meeting_point_map_url: '<Meeting Point — Google Maps Link, or "">',
    meeting_time: '<Time, e.g. "6:00 AM">',
    meeting_terminal: '<Terminal/gate/landmark detail, or "">',
    meeting_details: '<Any extra logistics Details for the meeting point, or "">',

    // ── Tab: End Banner ─────────────────────────────────────────────
    end_banner: {
      image: '(leave blank — uploaded manually)',
      heading: '<Heading shown on the left of the banner, e.g. "Ready to Experience the Magic?">',
      description: '<One or two lines below the heading>',
      cta_label: '<Button Label, e.g. "Book Your Seat", or "" to hide the button>',
      cta_url: '<Button Link, or "" to open the booking form>',
    },

    // ── Tab: Terms & Conditions ─────────────────────────────────────
    terms_and_conditions: '(leave as default unless the trip needs custom terms)',

    // ── Tab: FAQs ───────────────────────────────────────────────────
    faqs: [
      { question: '<Frequently asked question>', answer: '<Answer>' },
    ],

    // ── Tab: Cancellation Policy ────────────────────────────────────
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

    // ── Tab: Publish ────────────────────────────────────────────────
    // Imports always open as a draft, whatever is set here — switch to
    // "coming_soon" or "published" in the Publish tab after reviewing.
    status: 'draft',
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

const isPlaceholder = (v: unknown): boolean =>
  typeof v !== 'string' || v.trim() === '' || v.trim().startsWith('<') || v.trim().startsWith('(');

const asStr = (v: unknown, fallback = ''): string => (isPlaceholder(v) ? fallback : String(v));

// Real numbers (e.g. price: 18999 filled in directly as JSON, not as a
// string) are valid, filled-in values — only strings need the
// isPlaceholder check, since that's the only shape unfilled template
// placeholders ("<...>") ever take. Without this, any correctly-filled
// numeric field was wrongly treated as an unfilled placeholder and wiped
// to '' on import.
const asNum = (v: unknown): number | '' => {
  if (typeof v === 'number') return isNaN(v) ? '' : v;
  if (isPlaceholder(v)) return '';
  const n = Number(v);
  return isNaN(n) ? '' : n;
};

const asNumOrNull = (v: unknown): number | null => {
  if (v === null) return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  if (isPlaceholder(v)) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
};

const asStrArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter(item => !isPlaceholder(item)).map(item => String(item)) : [];

// Narrows an unknown value (parsed JSON) down to a plain object/array we
// can safely dot into, without resorting to `any` — every property read
// off the result is still `unknown` and goes through asStr/asNum/asArr/
// asObj again, same as before this was typed as `any`.
const asObj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? v as Record<string, unknown> : {});
const asArr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v as Record<string, unknown>[] : []);

// Imported JSON is a common source of `icon` values that bypass the
// TripHighlightIconPicker (e.g. an externally-drafted template filled in
// with emoji). TripHighlightIconDisplay only renders the colored icon
// circle for a recognized icon-library key — anything else silently
// falls back to plain text/emoji. Map the emoji admins have actually used
// in past templates to their nearest icon-library key on import, so the
// trip renders correctly without the admin having to notice and fix it
// by hand afterwards. Anything already a valid key, or not in this map,
// passes through unchanged (preserving today's fallback behavior).
const LEGACY_EMOJI_TO_ICON_KEY: Record<string, string> = {
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

const asIconKey = (v: unknown): string => {
  const s = asStr(v);
  if (!s) return s;
  if (getTripHighlightIcon(s)) return s; // already a valid key
  return LEGACY_EMOJI_TO_ICON_KEY[s] ?? s; // map known legacy emoji, else pass through unchanged
};


const COST_BASES: TripCostBasis[] = ['fixed', 'per_traveler', 'per_selected'];
let costIdCounter = 0;
const newCostItemId = () => `ci_${Date.now().toString(36)}_${(costIdCounter++).toString(36)}`;
let organiserExpenseIdCounter = 0;
const newOrganiserExpenseId = () => `oe_${Date.now().toString(36)}_${(organiserExpenseIdCounter++).toString(36)}`;

// The template links packages (and cost lines) to options by a short local
// id such as "water". Real ids are generated here, and every link is
// re-pointed at them; links to an unknown/unfilled option are dropped.
function parseTripOptions(raw: unknown): { config: TripOptionsConfig; idMap: Record<string, string> } {
  const src = asObj(raw);
  const idMap: Record<string, string> = {};
  const options: TripOption[] = asArr(src.options)
    .filter(o => !isPlaceholder(o?.name))
    .map(o => {
      const id = newOptionId('opt');
      const localId = asStr(o?.id);
      if (localId) idMap[localId] = id;
      return { id, name: asStr(o?.name), description: asStr(o?.description), price: asNumOrNull(o?.price) };
    });
  const packages: TripPackage[] = asArr(src.packages)
    .filter(p => !isPlaceholder(p?.name))
    .map(p => {
      const optionIds = Array.isArray(p?.option_ids)
        ? (p.option_ids as unknown[]).map(x => idMap[asStr(x)]).filter((x): x is string => !!x)
        : [];
      return {
        id: newOptionId('pkg'),
        name: asStr(p?.name),
        description: asStr(p?.description),
        option_ids: Array.from(new Set(optionIds)),
        highlight: p?.highlight === true,
        early_bird: p?.early_bird === true,
        price: asNumOrNull(p?.price),
        early_bird_price: asNumOrNull(p?.early_bird_price),
      };
    });
  return { config: options.length || packages.length ? { options, packages } : emptyTripOptions, idMap };
}

function parseTripFinance(raw: unknown, optionIdMap: Record<string, string>): TripFinance {
  if (!raw || typeof raw !== 'object') return emptyTripFinance;
  const f = asObj(raw);
  const costItems: TripCostItem[] = asArr(f.cost_items)
    .filter(c => !isPlaceholder(c?.name))
    .map(c => {
      const basis = COST_BASES.includes(c?.basis as TripCostBasis) ? (c.basis as TripCostBasis) : 'fixed';
      return {
        id: newCostItemId(),
        name: asStr(c?.name),
        basis,
        rate: asNumOrNull(c?.rate),
        quantity: basis === 'per_selected' ? asNumOrNull(c?.quantity) : null,
        option_id: optionIdMap[asStr(c?.option_id)] ?? null,
      };
    });
  const organiserExpenses: TripOrganiserExpense[] = asArr(f.organiser_expenses)
    .filter(c => !isPlaceholder(c?.name))
    .map(c => ({
      id: newOrganiserExpenseId(),
      name: asStr(c?.name),
      amount: asNumOrNull(c?.amount),
    }));
  return {
    agency_name: asStr(f.agency_name),
    agency_amount_type: f.agency_amount_type === 'per_traveler' ? 'per_traveler' : 'fixed',
    agency_amount: asNumOrNull(f.agency_amount),
    child_fare_amount: asNumOrNull(f.child_fare_amount),
    child_fare_vendor_amount: asNumOrNull(f.child_fare_vendor_amount),
    child_fare_entry_ticket_cost: asNumOrNull(f.child_fare_entry_ticket_cost),
    child_fare_kit_cost: asNumOrNull(f.child_fare_kit_cost),
    organiser_name: asStr(f.organiser_name),
    organiser_expenses: organiserExpenses,
    cost_items: costItems,
    notes: asStr(f.notes),
  };
}


// ── Import Template ──────────────────────────────────────────────────────
// Reads a filled-in export template (e.g. produced by ChatGPT from
// handleExportTemplate's output) and returns a TripForm so the admin only
// has to review/adjust and upload photos before saving — instead of
// retyping everything by hand. Throws if `raw` isn't parseable JSON shaped
// like the template; the caller is responsible for catching that and
// showing an "Import failed" message.
export function parseImportedTripForm(raw: unknown): TripForm {
  const r = asObj(raw);
  const cancellationPolicySrc = asObj(r.cancellation_policy);
  const endBannerSrc = asObj(r.end_banner);
  const { config: tripOptions, idMap: optionIdMap } = parseTripOptions(r.trip_options);
  const imported: TripForm = {
      title: asStr(r.title),
      destination: asStr(r.destination),
      start_date: asStr(r.start_date),
      end_date: asStr(r.end_date),
      duration: computeDuration(asStr(r.start_date), asStr(r.end_date)),
      description: asStr(r.description),
      itinerary: asArr(r.itinerary).map((d, i) => ({
            day: asNum(d?.day) || i + 1,
            title: asStr(d?.title),
            description: asStr(d?.description),
            images: asStrArray(d?.images),
            icon: asIconKey(d?.icon),
            bullets: asStrArray(d?.bullets),
          })),
      not_included: asStrArray(r.not_included),
      meeting_point: asStr(r.meeting_point),
      meeting_point_map_url: asStr(r.meeting_point_map_url),
      meeting_time: asStr(r.meeting_time),
      meeting_terminal: asStr(r.meeting_terminal),
      meeting_details: asStr(r.meeting_details),
      faqs: asArr(r.faqs)
            .filter(f => !isPlaceholder(f?.question) || !isPlaceholder(f?.answer))
            .map(f => ({ question: asStr(f?.question), answer: asStr(f?.answer) })),
      total_seats: asNum(r.total_seats) || emptyForm.total_seats,
      seats_booked: asNum(r.seats_booked) || 0,
      min_age: asNum(r.min_age),
      max_age: asNum(r.max_age),
      price: asNum(r.price),
      early_bird_price: asNum(r.early_bird_price),
      early_bird_deadline: asStr(r.early_bird_deadline),
      strike_through_price: asNum(r.strike_through_price),
      advance_amount: asNum(r.advance_amount),
      special_offer_name: asStr(r.special_offer_name),
      special_offer_price: asNum(r.special_offer_price),
      special_offer_date: asStr(r.special_offer_date),
      special_offer_end_date: asStr(r.special_offer_end_date),
      trip_type: r.trip_type === 'domestic' || r.trip_type === 'international' ? r.trip_type : '',
      // Imported the same way itinerary images always were: real URLs
      // (e.g. Wikimedia/Unsplash links an admin filled in) come through
      // as-is; leftover template placeholders like "(leave blank —
      // uploaded manually)" still resolve to '' via isPlaceholder/asStr,
      // so an untouched export template still opens with blank fields.
      cover_image: asStr(r.cover_image),
      cover_image_crop: null,
      hero_mobile_image: asStr(r.hero_mobile_image),
      terms_and_conditions: isPlaceholder(r.terms_and_conditions) ? DEFAULT_TERMS_AND_CONDITIONS : asStr(r.terms_and_conditions),
      cancellation_policy: r.cancellation_policy ? {
        payment_due_days: asNum(cancellationPolicySrc.payment_due_days) || DEFAULT_CANCELLATION_POLICY.payment_due_days,
        tiers: Array.isArray(cancellationPolicySrc.tiers)
          ? asArr(cancellationPolicySrc.tiers).map(t => ({
              min_days: asNumOrNull(t?.min_days),
              max_days: asNumOrNull(t?.max_days),
              description: asStr(t?.description),
            }))
          : DEFAULT_CANCELLATION_POLICY.tiers,
        refund_min_days: asNum(cancellationPolicySrc.refund_min_days) || DEFAULT_CANCELLATION_POLICY.refund_min_days,
        refund_max_days: asNum(cancellationPolicySrc.refund_max_days) || DEFAULT_CANCELLATION_POLICY.refund_max_days,
      } : DEFAULT_CANCELLATION_POLICY,
      status: 'draft',
      highlight_cards: asArr(r.highlight_cards).map(c => ({ icon: asIconKey(c?.icon), heading: asStr(c?.heading), description: asStr(c?.description) })),
      card_feature_tags: asArr(r.card_feature_tags).slice(0, 4).map(t => ({ icon: asIconKey(t?.icon), label: asStr(t?.label), sublabel: asStr(t?.sublabel) })),
      accommodation_description: asStr(r.accommodation_description),
      accommodation_photos: asStrArray(r.accommodation_photos),
      included_groups: asArr(r.included_groups).map(g => ({
            icon: asIconKey(g?.icon),
            heading: asStr(g?.heading),
            bullets: asStrArray(g?.bullets),
          })),
      gallery_items: asArr(r.gallery_items).map(g => ({ photo: asStr(g?.photo), description: asStr(g?.description) })),
      gallery_description: asStr(r.gallery_description),
      fashion_photos: asStrArray(r.fashion_photos),
      fashion_description: asStr(r.fashion_description),
      things_to_carry_items: asArr(r.things_to_carry_items).map(c => ({ icon: asIconKey(c?.icon), description: asStr(c?.description) })),
      // Templates are plain text/JSON with no knowledge of trip_leaders
      // directory ids, so an import always starts unlinked — the admin can
      // assign one afterwards from the Trip Leader tab if they want to.
      trip_leader_id: '',
      confidence_items: asArr(r.confidence_items).map(c => ({ icon: asIconKey(c?.icon), description: asStr(c?.description) })),
      confidence_description: asStr(r.confidence_description),
      meeting_address: asStr(r.meeting_address),
      end_banner: r.end_banner
        ? {
            image: asStr(endBannerSrc.image),
            heading: asStr(endBannerSrc.heading),
            description: asStr(endBannerSrc.description),
            cta_label: asStr(endBannerSrc.cta_label),
            cta_url: asStr(endBannerSrc.cta_url),
          }
        : emptyEndBanner,
      // Internal cost/profit data (Finances & Profit tab). Optional in the
      // template — a missing or untouched block imports as a blank record.
      trip_finance: parseTripFinance(r.trip_finance, optionIdMap),
      // Packages & add-ons from Pricing & Availability. Missing or untouched
      // = a plain single-price trip.
      trip_options: tripOptions,
    };
  return imported;
}
