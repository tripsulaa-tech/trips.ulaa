// Types, constants, and small pure helper functions shared between
// AdminWaitlist.tsx and its extracted sub-components/hooks (./*). Split out
// of AdminWaitlist.tsx so that file only has to hold state/handlers/render —
// nothing in here depends on component state (everything takes what it
// needs as explicit arguments), so it's all safe to import from anywhere
// without prop drilling.
import {
  Bell,
  CheckCircle as CheckCircle2,
  XCircle,
  Circle,
  Clock,
} from '@phosphor-icons/react';
import type { WaitlistEntry } from '../../types/types-index';
import { FOOD_PREFERENCE_OPTIONS } from '../../constants/foodPreference';

export { FOOD_PREFERENCE_OPTIONS };

export const STATUS_CONFIG = {
  waiting: { label: 'Waiting', color: 'bg-amber-100 text-amber-700', icon: Circle },
  // Displayed label is deliberately "Offer Sent" rather than "Notified" —
  // the underlying DB value/status key stays 'notified' (no migration
  // needed), only the admin-facing copy changed.
  notified: { label: 'Offer Sent', color: 'bg-blue-100 text-blue-700', icon: Bell },
  converted: { label: 'Converted', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  declined: { label: 'Declined', color: 'bg-red-100 text-red-700', icon: XCircle },
  // A waiting entry that sat too long without being offered a seat or
  // converting — manually set by the admin, same as declined.
  expired: { label: 'Expired', color: 'bg-slate-200 text-dark-muted', icon: Clock },
} as const;

// 'converted' is deliberately excluded here — it's never manually
// selectable. It's only ever set by the app itself once a linked enquiry
// with an actual advance payment exists (see AdminEnquiries.handleSave /
// markWaitlistConverted). The DB trigger enforces this too, but the point
// is to not even offer the option that led to the bug in the first place.
// The 'notified' option is labeled "Offer Seat" here (the action an admin
// takes), distinct from the "Offer Sent" label STATUS_CONFIG shows once
// that status is already active.
export const EDITABLE_STATUS_OPTIONS = (['waiting', 'notified', 'declined', 'expired'] as const).map(key => ({
  value: key,
  label: key === 'notified' ? 'Offer Seat' : STATUS_CONFIG[key].label,
}));

export type WaitlistForm = {
  full_name: string;
  phone: string;
  email: string;
  age: number | '';
  city: string;
  emergency_contact: string;
  trip_id: string;
  food_preference: 'veg' | 'non_veg' | '';
  group_size: number | '';
  message: string;
};

export const emptyWaitlistForm: WaitlistForm = {
  full_name: '', phone: '', email: '', age: '', city: '', emergency_contact: '',
  trip_id: '', food_preference: '', group_size: '', message: '',
};

// Renders the "Offer expires in Xh" / "Offer expired Xh ago" line under a
// 'notified' entry's status control (CRM spec section 9's Offer Expiry
// field). Purely a read display — nothing here auto-changes status; an
// admin still has to convert/decline or explicitly pick "Expired" from the
// dropdown, same as every other waitlist transition on this page.
export function offerExpiryLabel(offerExpiry: string | null | undefined): { text: string; overdue: boolean } | null {
  if (!offerExpiry) return null;
  const diffMs = new Date(offerExpiry).getTime() - Date.now();
  if (diffMs <= 0) {
    const hoursAgo = Math.round(Math.abs(diffMs) / (60 * 60 * 1000));
    return { text: hoursAgo < 1 ? 'Offer expired' : `Offer expired ${hoursAgo}h ago`, overdue: true };
  }
  const hoursLeft = Math.round(diffMs / (60 * 60 * 1000));
  return { text: hoursLeft < 1 ? 'Offer expires soon' : `Offer expires in ${hoursLeft}h`, overdue: false };
}

// A solo entry (group_size null/1) is ready the moment any seat is free.
// A group entry needs at least group_size seats free together before
// it's actually convertible — e.g. a group of 3 isn't "ready" just
// because 1 seat opened up from a single cancellation.
export const seatsNeeded = (e: WaitlistEntry) => (e.group_size && e.group_size > 1 ? e.group_size : 1);

// Every enquiry converted from this entry so far (falls back to the
// legacy single-id column for any row a migration hasn't backfilled).
export const convertedIds = (e: WaitlistEntry): string[] =>
  e.converted_enquiry_ids ?? (e.converted_enquiry_id ? [e.converted_enquiry_id] : []);
export const convertedCount = (e: WaitlistEntry) => convertedIds(e).length;

// What's still needed isn't the original group size once some of the
// group has already converted — a group of 3 with 2 already converted
// only needs 1 more seat, not 3.
export const seatsRemaining = (e: WaitlistEntry) => Math.max(seatsNeeded(e) - convertedCount(e), 0);

export const hasSeatOpen = (e: WaitlistEntry, seatsAvailable: Record<string, number>) =>
  e.status === 'waiting' && seatsRemaining(e) > 0 && (seatsAvailable[e.trip_id] ?? 0) >= seatsRemaining(e);

// A seat freed up (e.g. someone else cancelled) — hand this person off to
// Enquiries pre-filled, the same way a phone/WhatsApp lead would be
// logged, so the admin can take payment and book the seat. The waitlist
// entry itself is only marked "converted" once that enquiry is actually
// saved (see AdminEnquiries), not the moment we navigate away.
export const canConvert = (e: WaitlistEntry) => e.status === 'waiting' || e.status === 'notified';

// Small inline badge shown in the Food column — mirrors the one on the
// Enquiries page so both tables read the same way. For a group booking,
// there's no single `food_preference`; an admin instead jots the split
// straight into the notes (e.g. "2 veg / 2 non-veg."), so pull that out
// and show it as the food info instead of "Food not set".
export const foodBreakdown = (e: WaitlistEntry) => e.message?.match(/\b(\d+)\s*veg\s*\/\s*(\d+)\s*non[- ]?veg\.?/i) || null;

export const messageWithoutFoodBreakdown = (e: WaitlistEntry) => {
  const match = foodBreakdown(e);
  return match ? (e.message || '').replace(match[0], '').trim() : (e.message || '');
};

export const foodBadge = (e: WaitlistEntry): { label: string; color: string; key: 'veg' | 'non_veg' | 'not_set' | 'mixed' } => {
  const breakdown = foodBreakdown(e);
  if (breakdown) return { label: `${breakdown[1]} veg / ${breakdown[2]} non-veg`, color: 'bg-purple-100 text-purple-700', key: 'mixed' };
  if (e.food_preference === 'veg') return { label: 'Veg', color: 'bg-green-100 text-green-700', key: 'veg' };
  if (e.food_preference === 'non_veg') return { label: 'Non-veg', color: 'bg-red-100 text-red-700', key: 'non_veg' };
  return { label: 'Food not set', color: 'bg-slate-100 text-dark-muted', key: 'not_set' };
};
