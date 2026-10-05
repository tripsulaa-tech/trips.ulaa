import type { TravellerContact } from './travellerContacts';
import { emailSignature, phoneSignature } from '../enquiries/AdminEnquiriesShared';

// Merging works by rewriting the identity fields (name/phone/email/city) of
// every enquiry behind one contact so they match the contact being kept —
// buildTravellerContacts() then groups them together on its own, since it
// groups by phone. That rewrite can collide with the database's duplicate
// protection: only one active enquiry may exist per
// (trip, name, phone, email, group seat). So before merging, find trips
// where BOTH contacts already hold an active enquiry for the same seat —
// those are almost always the same booking logged twice, and moving one onto
// the other would be rejected (or silently double-book the traveller).
export function findMergeConflicts(keep: TravellerContact, other: TravellerContact): string[] {
  const seatKey = (r: TravellerContact['rows'][number]) => `${r.trip_id}|${r.group_seq}`;
  const keepSeats = new Set(
    keep.rows.filter(r => r.trip_id && !r.cancelled_at).map(seatKey)
  );
  const titles = new Set<string>();
  for (const r of other.rows) {
    if (r.trip_id && !r.cancelled_at && keepSeats.has(seatKey(r))) {
      titles.add(r.trip_title || 'Untitled trip');
    }
  }
  return [...titles];
}

// Likely duplicates of `source` to offer before the admin types anything:
// same email, same first name, or same last 4 phone digits.
export function suggestMergeCandidates(source: TravellerContact, all: TravellerContact[]): TravellerContact[] {
  const firstName = source.fullName.trim().toLowerCase().split(/\s+/)[0];
  const email = emailSignature(source.email);
  const last4 = (phoneSignature(source.phone) || '').slice(-4);
  return all.filter(c => {
    if (c.key === source.key) return false;
    if (email && emailSignature(c.email) === email) return true;
    if (firstName && firstName.length > 1 && c.fullName.trim().toLowerCase().split(/\s+/)[0] === firstName) return true;
    if (last4.length === 4 && (phoneSignature(c.phone) || '').slice(-4) === last4) return true;
    return false;
  });
}
