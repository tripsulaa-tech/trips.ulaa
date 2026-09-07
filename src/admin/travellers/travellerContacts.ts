import type { Enquiry } from '../../types/types-index';
import { phoneSignature, emailSignature } from '../enquiries/AdminEnquiriesShared';

// One trip this traveller has booked (or is booked on) — collapsed from
// however many raw enquiry rows share the same trip, since a "Group"
// booking inserts one row per seat (see submitGroupEnquiry in
// services/api/enquiries/create.ts), all carrying the same
// name/phone/email. Without this collapse, a family of 4 booked on one
// trip would show up as 4 separate identical-looking trip lines instead
// of one "Group of 4" line.
export type TravellerTripGroup = {
  key: string;
  tripId: string | null;
  tripTitle: string;
  departureDate?: string;
  seatCount: number;
  totalPaid: number;
  totalAmount: number;
  // One representative row (an active seat if any exist, else the most
  // recent one) — used to read a single "status" for the whole group via
  // journeyBadge() rather than inventing a second status vocabulary here.
  representative: Enquiry;
  allCancelled: boolean;
  latestCreatedAt: string;
};

// One contact card — everyone whose (fuzzy-matched) phone/email/name
// resolves to the same person, with every trip they've ever booked with
// Ulaa grouped underneath.
export type TravellerContact = {
  key: string;
  fullName: string;
  phone: string;
  email: string;
  city?: string;
  emergencyContact?: string;
  foodPreference?: 'veg' | 'non_veg' | null;
  trips: TravellerTripGroup[];
  tripCount: number;
  totalPaidLifetime: number;
  // Most recent created_at across every row for this contact — drives the
  // default "most recently active first" sort.
  lastActivityAt: string;
};

// Same fuzzy identity used by the possible-duplicate warning in
// AdminAddEnquiryModal (see phoneSignature/emailSignature) — groups rows
// primarily by phone (digits-only, last 10), falling back to email, then
// to the trimmed/lowercased name. Since createManualEnquiry/BookingForm
// both require a phone for anyone who's actually paid something, the
// name-only fallback is rare in practice — mainly a safety net so no paid
// row is ever silently dropped from the book.
function contactKey(e: Enquiry): string {
  const p = phoneSignature(e.phone);
  if (p) return `phone:${p}`;
  const em = emailSignature(e.email);
  if (em) return `email:${em}`;
  return `name:${e.full_name.trim().toLowerCase()}`;
}

// Groups a contact's own rows by trip — trip_id when the trip is still a
// real linked row, trip_title for one that's since been deleted/completed,
// or the enquiry's own id (i.e. its own group of one) for the rare
// no-specific-trip manual entry.
function tripKey(e: Enquiry): string {
  if (e.trip_id) return `id:${e.trip_id}`;
  if (e.trip_title) return `title:${e.trip_title.trim().toLowerCase()}`;
  return `enquiry:${e.id}`;
}

// Picks the most recently-entered non-blank value for a field across every
// row for one contact — a repeat traveller might have left city blank on
// an early booking but filled it in on a later one; take whatever's most
// current and complete rather than whatever row happens to sort first.
function pickBest(rows: Enquiry[], field: 'full_name' | 'phone' | 'city' | 'emergency_contact'): string {
  const withValue = [...rows]
    .filter(r => (r[field] || '').toString().trim() !== '')
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  return ((withValue[0]?.[field] as string) || '').toString().trim();
}

// Same idea for email specifically — skips the app's own "not provided"
// sentinel (see createManualEnquiry) so a manually-logged booking that
// never actually collected an email doesn't show that internal placeholder
// as if it were a real address.
function pickBestEmail(rows: Enquiry[]): string {
  const withValue = [...rows]
    .filter(r => !!emailSignature(r.email))
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  return (withValue[0]?.email || '').trim();
}

/** Collapses every enquiry row that ever had money on it into one contact
 *  card per traveller, each with their full trip history grouped
 *  underneath. "Traveller" here means anyone who ever paid/booked
 *  (amount_paid > 0 at some point) — including a trip that hasn't happened
 *  yet, or a booking that was later cancelled — not just people who've
 *  actually completed a trip. A plain unpaid lead that never converted
 *  isn't a traveller yet, so it's excluded. */
export function buildTravellerContacts(enquiries: Enquiry[]): TravellerContact[] {
  const bookedRows = enquiries.filter(e => (e.amount_paid || 0) > 0);

  const byContact = new Map<string, Enquiry[]>();
  for (const row of bookedRows) {
    const key = contactKey(row);
    const list = byContact.get(key);
    if (list) list.push(row);
    else byContact.set(key, [row]);
  }

  const contacts: TravellerContact[] = [];
  for (const [key, rows] of byContact) {
    const byTrip = new Map<string, Enquiry[]>();
    for (const row of rows) {
      const tk = tripKey(row);
      const list = byTrip.get(tk);
      if (list) list.push(row);
      else byTrip.set(tk, [row]);
    }

    const trips: TravellerTripGroup[] = Array.from(byTrip.values())
      .map((tripRows): TravellerTripGroup => {
        const sortedByRecency = [...tripRows].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
        const allCancelled = tripRows.every(r => !!r.cancelled_at);
        const representative = tripRows.find(r => !r.cancelled_at) || sortedByRecency[0];
        return {
          key: tripKey(tripRows[0]),
          tripId: tripRows[0].trip_id || null,
          tripTitle: tripRows[0].trip_title || 'No specific trip',
          departureDate: tripRows[0].departure_date,
          seatCount: tripRows.length,
          totalPaid: tripRows.reduce((sum, r) => sum + (r.amount_paid || 0), 0),
          totalAmount: tripRows.reduce((sum, r) => sum + (r.total_amount || 0), 0),
          representative,
          allCancelled,
          latestCreatedAt: sortedByRecency[0].created_at,
        };
      })
      .sort((a, b) => (b.departureDate || b.latestCreatedAt).localeCompare(a.departureDate || a.latestCreatedAt));

    const lastActivityAt = rows.reduce((latest, r) => (r.created_at > latest ? r.created_at : latest), rows[0].created_at);

    contacts.push({
      key,
      fullName: pickBest(rows, 'full_name') || 'Unnamed traveller',
      phone: pickBest(rows, 'phone'),
      email: pickBestEmail(rows),
      city: pickBest(rows, 'city') || undefined,
      emergencyContact: pickBest(rows, 'emergency_contact') || undefined,
      foodPreference: rows.find(r => r.food_preference)?.food_preference || null,
      trips,
      tripCount: trips.length,
      totalPaidLifetime: rows.reduce((sum, r) => sum + (r.amount_paid || 0), 0),
      lastActivityAt,
    });
  }

  return contacts.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
}

export function contactMatchesQuery(c: TravellerContact, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    c.fullName.toLowerCase().includes(q) ||
    c.phone.toLowerCase().includes(q) ||
    c.email.toLowerCase().includes(q) ||
    (!!c.city && c.city.toLowerCase().includes(q)) ||
    c.trips.some(t => t.tripTitle.toLowerCase().includes(q))
  );
}
