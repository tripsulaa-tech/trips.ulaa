import type { Enquiry, WaitlistEntry } from '../../types/types-index';
import { phoneSignature } from '../enquiries/AdminEnquiriesShared';
import { nameKey } from './travellerContacts';
import type { TravellerContact } from './travellerContacts';

// Everything the Traveller Profile panel shows, derived from the contact the
// Contact Book already built — no new queries, no new storage. The one thing
// that isn't on the contact is the waitlist, which the panel loads separately
// (see useTravellerWaitlist.ts) and passes through matchWaitlistEntries().

export type ProfileTrip = {
  key: string;
  title: string;
  departureDate?: string;
  seats: number;
  // The enquiry the "Open enquiry" link goes to — one representative row for
  // the whole trip group (a group booking is one row per seat).
  enquiryId: string;
  // 'joined'    — has a booking and isn't cancelled
  // 'cancelled' — every seat on this trip was cancelled
  // 'enquiry'   — only ever an enquiry (never paid / not interested / still open)
  outcome: 'joined' | 'cancelled' | 'enquiry';
  paid: number;
  total: number;
  // Only meaningful for 'joined' trips; never negative.
  balance: number;
  refunded: number;
  earlyBird: boolean;
  child: boolean;
  // Most recent enquiry row on this trip, for the status badge via journeyBadge().
  representative: Enquiry;
};

export type ProfileSummary = {
  tripsJoined: number;
  totalPaid: number;
  balanceDue: number;
  firstEnquiryAt: string;
  lastActivityAt: string;
  // Enquiries that never became a booking and weren't cancelled afterwards.
  notConverted: number;
  cancelled: number;
};

export type TravellerProfile = {
  isRepeat: boolean;
  age?: number;
  food: 'veg' | 'non_veg' | null;
  // Where the very first enquiry came from (earliest row).
  firstSource?: Enquiry['source'];
  summary: ProfileSummary;
  trips: ProfileTrip[];
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function buildTravellerProfile(contact: TravellerContact): TravellerProfile {
  const byCreated = [...contact.rows].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  const earliest = byCreated[0];
  // Age lives per enquiry; take the most recent one that has it, the same
  // "most current non-blank value" rule travellerContacts.pickBest uses.
  const age = [...byCreated].reverse().find(r => typeof r.age === 'number' && r.age > 0)?.age;

  const trips: ProfileTrip[] = contact.trips.map(t => {
    const rows = contact.rows.filter(r => tripRowMatches(r, t.key));
    const outcome: ProfileTrip['outcome'] = t.joined ? 'joined' : t.allCancelled ? 'cancelled' : 'enquiry';
    const active = rows.filter(r => !r.cancelled_at);
    const paid = t.totalPaid;
    const total = t.totalAmount;
    return {
      key: t.key,
      title: t.tripTitle,
      departureDate: t.departureDate,
      seats: t.seatCount,
      enquiryId: t.representative.id,
      outcome,
      paid,
      total,
      balance: outcome === 'joined' ? Math.max(0, sum(active.map(r => r.total_amount || 0)) - sum(active.map(r => r.amount_paid || 0))) : 0,
      refunded: sum(rows.filter(r => !!r.cancelled_at).map(r => r.refund_amount || 0)),
      earlyBird: rows.some(r => r.package_type === 'early_bird'),
      child: rows.some(r => !!r.has_child_addon),
      representative: t.representative,
    };
  });

  const joined = trips.filter(t => t.outcome === 'joined');

  return {
    isRepeat: contact.joinedTripCount >= 2,
    age,
    food: contact.foodPreference ?? null,
    firstSource: earliest?.source,
    summary: {
      tripsJoined: joined.length,
      totalPaid: sum(joined.map(t => t.paid)),
      balanceDue: sum(joined.map(t => t.balance)),
      firstEnquiryAt: contact.registeredAt,
      lastActivityAt: contact.lastActivityAt,
      notConverted: trips.filter(t => t.outcome === 'enquiry').length,
      cancelled: trips.filter(t => t.outcome === 'cancelled').length,
    },
    trips,
  };
}

// Mirrors tripKey() in travellerContacts.ts (kept private there), so a trip
// group's rows can be found again from its key.
function tripRowMatches(row: Enquiry, key: string): boolean {
  if (row.trip_id) return key === `id:${row.trip_id}`;
  if (row.trip_title) return key === `title:${row.trip_title.trim().toLowerCase()}`;
  return key === `enquiry:${row.id}`;
}

export type ProfileWaitlistEntry = {
  entry: WaitlistEntry;
  // Set when the signup was made under a different name than this contact's
  // (e.g. a parent signing up for a daughter on the same phone).
  asName?: string;
};

/** Waitlist signups made with any phone number we hold for this traveller,
 *  newest first. Matching is by phone alone (same fuzzy digits-only
 *  signature the rest of the Contact Book uses), so a signup under a slightly
 *  different spelling still shows — and is labelled when the name differs. */
export function matchWaitlistEntries(contact: TravellerContact, entries: WaitlistEntry[]): ProfileWaitlistEntry[] {
  const sigs = new Set(contact.phones.map(p => phoneSignature(p)).filter(Boolean));
  if (sigs.size === 0) return [];
  const mine = nameKey(contact.fullName);
  return entries
    .filter(e => sigs.has(phoneSignature(e.phone)))
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    .map(entry => ({
      entry,
      asName: nameKey(entry.full_name) !== mine ? entry.full_name : undefined,
    }));
}

export const WAITLIST_STATUS_LABEL: Record<WaitlistEntry['status'], { label: string; color: string }> = {
  waiting: { label: 'Waiting', color: 'bg-warning-bg text-warning-fg' },
  notified: { label: 'Seat offered', color: 'bg-purple-100 text-purple-700' },
  converted: { label: 'Converted', color: 'bg-success-bg text-success-fg' },
  declined: { label: 'Declined', color: 'bg-slate-200 text-dark-muted' },
  expired: { label: 'Expired', color: 'bg-slate-200 text-dark-muted' },
};
