import type { Enquiry } from '../../types/types-index';
import { phoneSignature, emailSignature } from '../enquiries/AdminEnquiriesShared';

// One trip (or trip-less enquiry) grouped under a contact — collapsed
// from however many raw enquiry rows share the same trip, since a "Group"
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
// resolves to the same person, with every trip/enquiry they've ever
// logged with Ulaa grouped underneath. This is a contact book, not a
// payments ledger — no lifetime-paid total is tracked here; open the
// trip itself (or Enquiries) for money details.
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
  // Earliest created_at across every row for this contact — the date they
  // first became a contact (their very first enquiry), regardless of
  // which trip it was for. Drives the Contact Book's "1, 2, 3..." serial
  // numbering (oldest registered first) — see AdminTravellers.tsx.
  registeredAt: string;
  // Most recent created_at across every row for this contact — kept
  // around for anything that still wants "most recently active" info,
  // though the list itself now sorts by registeredAt.
  lastActivityAt: string;
  // Every raw enquiry row collapsed into this contact (across every trip,
  // however many seats/rows each one contributed) — a contact card isn't
  // its own database record, so Edit/Delete act on this underlying row
  // set: Edit patches the identity fields on each one via
  // updateEnquiryDetails, Delete removes each one via deleteEnquiry. See
  // AdminTravellerCard.tsx / useTravellers.ts.
  rows: Enquiry[];
};

// Same fuzzy identity used by the possible-duplicate warning in
// AdminAddEnquiryModal (see phoneSignature/emailSignature) — groups rows
// primarily by phone (digits-only, last 10), falling back to email, then
// to the trimmed/lowercased name. Every row reaching this function already
// has a non-blank phone (see buildTravellerContacts' filter below), so the
// email/name fallbacks mainly guard against a phone too short/malformed
// for phoneSignature to normalize.
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

/** Collapses every enquiry row we've ever saved a phone number for into
 *  one contact card per person, each with their full trip/enquiry history
 *  grouped underneath. This is a contact book, not a bookings list — a
 *  contact shows up whether they went on to book and pay for a trip or
 *  never converted past a first enquiry, as long as a phone number was
 *  captured. Rows with no phone on file (e.g. an anonymous "Contact Us"
 *  message) have nothing to look someone up by, so they're excluded. */
export function buildTravellerContacts(enquiries: Enquiry[]): TravellerContact[] {
  const contactRows = enquiries.filter(e => (e.phone || '').trim() !== '');

  const byContact = new Map<string, Enquiry[]>();
  for (const row of contactRows) {
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
    const registeredAt = rows.reduce((earliest, r) => (r.created_at < earliest ? r.created_at : earliest), rows[0].created_at);

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
      registeredAt,
      lastActivityAt,
      rows,
    });
  }

  // Serial-numbered 1, 2, 3... in the admin UI by registration order —
  // whoever's first enquiry came in earliest is #1, regardless of who's
  // been active most recently.
  return contacts.sort((a, b) => a.registeredAt.localeCompare(b.registeredAt));
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
