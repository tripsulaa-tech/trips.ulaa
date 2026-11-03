import type { Enquiry, WaitlistEntry } from '../../types/types-index';
import { phoneSignature, emailSignature } from '../enquiries/AdminEnquiriesShared';

// One trip (or trip-less enquiry) grouped under a contact — collapsed
// from however many raw enquiry rows share the same trip, since a "Group"
// booking inserts one row per seat (see submitGroupEnquiry in
// services/api/enquiries/create.ts), all carrying the same
// name/phone/email. Without this collapse, a family of 4 booked on one
// trip would show up as 4 separate identical-looking trip lines instead
// of one "Group of 4" line.
type TravellerTripGroup = {
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
  // True only once the person actually joined this trip: a booking exists
  // (booking_id is assigned when the first payment lands) and it hasn't been
  // cancelled. A trip that was only enquired about is false — it still shows
  // in the history, but doesn't count towards "N trips" or repeat travellers.
  joined: boolean;
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
  // Primary phone (what the contact is grouped by).
  phone: string;
  // Every number we hold for this traveller, primary first: the primary
  // phone plus, when different, the emergency-contact field — which is
  // where a traveller's second number is kept (no separate column).
  phones: string[];
  email: string;
  city?: string;
  emergencyContact?: string;
  foodPreference?: 'veg' | 'non_veg' | null;
  trips: TravellerTripGroup[];
  // Every trip/enquiry on file, joined or not (history, Edit/Delete wording).
  tripCount: number;
  // Only the trips this person actually joined — what the "N trips" badge,
  // the Repeat Travellers filter and the summary cards use.
  joinedTripCount: number;
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
  // True for someone who is ONLY on a waitlist so far — no enquiry row yet.
  // They have no trips joined and no rows, so Edit / Merge / Delete don't
  // apply (the waitlist itself is managed on the Waitlist page).
  waitlistOnly: boolean;
  // Their waitlist signups (newest first). Only filled for waitlist-only
  // contacts; for everyone else the profile panel matches the waitlist by phone.
  waitlist: WaitlistEntry[];
};

// Identity = same person name + same (fuzzy) phone. Phone alone is NOT enough:
// two different travellers can share one number (a parent booking for a
// friend, a family phone), and silently collapsing them hid real people.
// Those cases stay as separate contacts and are surfaced to the admin to
// review and merge instead — see findSharedPhoneGroups() below. Same
// fuzzy phone signature as the possible-duplicate warning in
// AdminAddEnquiryModal (digits-only, last 10).
export function nameKey(name: string | null | undefined): string {
  return (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function contactKey(e: Enquiry): string {
  const p = phoneSignature(e.phone) || `raw:${(e.phone || '').trim().toLowerCase()}`;
  return `${nameKey(e.full_name)}|${p}`;
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
export function buildTravellerContacts(enquiries: Enquiry[], waitlist: WaitlistEntry[] = []): TravellerContact[] {
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
          joined: tripRows.some(r => !!r.booking_id && !r.cancelled_at),
          latestCreatedAt: sortedByRecency[0].created_at,
        };
      })
      .sort((a, b) => (b.departureDate || b.latestCreatedAt).localeCompare(a.departureDate || a.latestCreatedAt));

    const lastActivityAt = rows.reduce((latest, r) => (r.created_at > latest ? r.created_at : latest), rows[0].created_at);
    const registeredAt = rows.reduce((earliest, r) => (r.created_at < earliest ? r.created_at : earliest), rows[0].created_at);

    const phone = pickBest(rows, 'phone');
    const emergencyContact = pickBest(rows, 'emergency_contact') || undefined;
    const phones = [phone];
    if (emergencyContact && phoneSignature(emergencyContact) !== phoneSignature(phone)) phones.push(emergencyContact);

    contacts.push({
      key,
      fullName: pickBest(rows, 'full_name') || 'Unnamed traveller',
      phone,
      phones,
      email: pickBestEmail(rows),
      city: pickBest(rows, 'city') || undefined,
      emergencyContact,
      foodPreference: rows.find(r => r.food_preference)?.food_preference || null,
      trips,
      tripCount: trips.length,
      joinedTripCount: trips.filter(t => t.joined).length,
      registeredAt,
      lastActivityAt,
      rows,
      waitlistOnly: false,
      waitlist: [],
    });
  }

  // Waitlist-only people: on a waitlist but with no enquiry yet. They aren't
  // travellers (nothing joined), but they are contacts we hold a phone number
  // for. Anyone who already has an enquiry contact (same name + phone) is
  // skipped — they're in the book already, and their waitlist shows on their
  // profile.
  const waitByContact = new Map<string, WaitlistEntry[]>();
  for (const w of waitlist) {
    if ((w.phone || '').trim() === '') continue;
    const key = contactKey({ full_name: w.full_name, phone: w.phone } as Enquiry);
    if (byContact.has(key)) continue;
    const list = waitByContact.get(key);
    if (list) list.push(w);
    else waitByContact.set(key, [w]);
  }
  for (const [key, entries] of waitByContact) {
    const newestFirst = [...entries].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    const newest = newestFirst[0];
    const oldest = newestFirst[newestFirst.length - 1];
    const firstWith = <K extends 'email' | 'city' | 'emergency_contact'>(field: K) =>
      (newestFirst.find(w => (w[field] || '').toString().trim() !== '')?.[field] || '').toString().trim();
    const phone = newest.phone.trim();
    const emergencyContact = firstWith('emergency_contact') || undefined;
    const phones = [phone];
    if (emergencyContact && phoneSignature(emergencyContact) !== phoneSignature(phone)) phones.push(emergencyContact);
    contacts.push({
      key,
      fullName: newest.full_name?.trim() || 'Unnamed traveller',
      phone,
      phones,
      email: emailSignature(firstWith('email')) ? firstWith('email') : '',
      city: firstWith('city') || undefined,
      emergencyContact,
      foodPreference: newestFirst.find(w => w.food_preference)?.food_preference || null,
      trips: [],
      tripCount: 0,
      joinedTripCount: 0,
      registeredAt: oldest.created_at,
      lastActivityAt: newest.created_at,
      rows: [],
      waitlistOnly: true,
      waitlist: newestFirst,
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
    c.phones.some(p => p.toLowerCase().includes(q)) ||
    c.email.toLowerCase().includes(q) ||
    (!!c.city && c.city.toLowerCase().includes(q)) ||
    c.trips.some(t => t.tripTitle.toLowerCase().includes(q)) ||
    c.waitlist.some(w => (w.trip_title || '').toLowerCase().includes(q))
  );
}

/** The most recent waitlist signup of a waitlist-only contact. */
export function latestWaitlistEntry(c: TravellerContact): WaitlistEntry | undefined {
  return c.waitlist[0];
}

/** Distinct travellers (different names) that share the same primary phone
 *  number. Each entry is one number with the contacts using it — shown to the
 *  admin as "possible same person, review & merge". Contacts with the same
 *  name already collapse into one card, so every group here has 2+ names. */
export type SharedPhoneGroup = { signature: string; phone: string; contacts: TravellerContact[] };

export function findSharedPhoneGroups(all: TravellerContact[]): SharedPhoneGroup[] {
  const bySig = new Map<string, TravellerContact[]>();
  for (const c of all) {
    // Waitlist-only people have no rows to merge, so they aren't offered here.
    if (c.waitlistOnly) continue;
    const sig = phoneSignature(c.phone);
    if (!sig) continue;
    const list = bySig.get(sig);
    if (list) list.push(c);
    else bySig.set(sig, [c]);
  }
  return [...bySig.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([signature, contacts]) => ({ signature, phone: contacts[0].phone, contacts }));
}
