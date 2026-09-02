// Types, constants, and small pure helper functions shared between
// AdminKids.tsx and its extracted sub-components/hooks (./*). Mirrors the
// role waitlistShared.ts plays for AdminWaitlist — everything here is
// stateless (takes what it needs as explicit arguments), so it's safe to
// import from anywhere without prop drilling.
//
// Kid status/label/badge logic itself (KID_STATUS_CONFIG, kidStatusBadge,
// canMarkKidNotInterested, etc.) deliberately isn't duplicated here — it's
// already centralized in AdminEnquiryCommon.ts (shared with the Enquiries
// list and the enquiry detail page's Kids card) and re-exported below, so
// this page can never drift from what those two already show.
import {
  CurrencyInr as IndianRupee,
  CheckCircle as CheckCircle2,
  Clock,
  Eye,
  UserMinus,
  ArrowsClockwise as RefreshCw,
  SignIn as LogIn,
  XCircle,
  Confetti as PartyPopper,
  Pencil,
  Trash as Trash2,
  UserCheck,
  UserMinus as UserX,
} from '@phosphor-icons/react';
import type { ActionMenuItem } from '../../components/ui/ActionsMenu';
import type { Enquiry, Kid, KidStatus } from '../../types/types-index';
import { foodPreferenceBadge } from '../../constants/foodPreference';

export {
  KID_STATUS_CONFIG,
  KID_NO_SHOW_BADGE,
  kidStatusBadge,
  canMarkKidNotInterested,
  canReopenKid,
  canMarkKidNoShow,
  nextKidManualAction,
  kidFollowUpStatus,
  canSetKidFollowUp,
  canCancelKid,
  kidNotInterestedReasonLabel,
} from '../enquiries/AdminEnquiryCommon';
import { canMarkKidNotInterested, canReopenKid, canMarkKidNoShow } from '../enquiries/AdminEnquiryCommon';

// One kid, enriched with the parent enquiry fields the standalone list
// needs to render/filter/search/sort a kid row without a booking's context
// around it (a kid has no phone/email/trip of its own — see Kid in
// types-index.ts) — built once in useKidsData and treated as read-only
// everywhere else on this page. Extends Kid so every existing kid-scoped
// helper (KID_STATUS_CONFIG, kidFollowUpStatus, canMarkKidNotInterested...)
// keeps working unchanged on a KidRow.
export interface KidRow extends Kid {
  /** "Kid N" (by created_at order among this kid's siblings) or the kid's own name — same fallback convention as useKidsForEnquiry's kidLabel. */
  label: string;
  parentName: string;
  phone: string;
  email: string;
  city?: string | null;
  tripId?: string;
  tripTitle?: string;
  /** The parent booking's own reference — lets a row link back to "View booking" the same way a converted waitlist entry does. */
  bookingId?: string | null;
  cancelledAt?: string | null;
}

// Groups the flat getAllKids() result back by enquiry_id and joins each
// kid with its parent enquiry's contact/trip fields — the one place this
// page turns raw Kid rows into the enriched KidRow shape every other hook/
// component here reads. A kid whose parent enquiry no longer exists (a rare
// race, or a hard-deleted enquiry that didn't cascade — see
// add_kids_table.sql) is silently dropped rather than shown with blank
// contact info, same "can't happen, but don't crash if it does" stance as
// AdminEnquiryKidsCard's own loading guard.
export function buildKidRows(kids: Kid[], enquiriesById: Map<string, Enquiry>): KidRow[] {
  const siblingIndex = new Map<string, number>();
  const rows: KidRow[] = [];
  for (const kid of kids) {
    const enquiry = enquiriesById.get(kid.enquiry_id);
    if (!enquiry) continue;
    const index = siblingIndex.get(kid.enquiry_id) ?? 0;
    siblingIndex.set(kid.enquiry_id, index + 1);
    rows.push({
      ...kid,
      label: kid.name?.trim() || `Kid ${index + 1}`,
      parentName: enquiry.full_name,
      phone: enquiry.phone,
      email: enquiry.email,
      city: enquiry.city,
      tripId: enquiry.trip_id,
      tripTitle: enquiry.trip_title,
      bookingId: enquiry.booking_id,
      cancelledAt: enquiry.cancelled_at,
    });
  }
  return rows;
}

// A kid's own fee status — Paid / Partial / Pending / Not Set — derived the
// same way the row-level payment pill in AdminEnquiryKidsCard reads
// amount/amount_paid, just given proper badge config so the standalone
// list can filter and sort on it (that card only ever displays the raw
// numbers, since it's already inside the one booking they belong to).
export const KID_PAYMENT_STATUS_CONFIG = {
  not_set: { label: 'Fee Not Set', color: 'bg-slate-100 text-dark-muted', icon: IndianRupee },
  pending: { label: 'Payment Pending', color: 'bg-amber-50 text-amber-700', icon: Clock },
  partial: { label: 'Partially Paid', color: 'bg-blue-50 text-blue-700', icon: IndianRupee },
  paid: { label: 'Fully Paid', color: 'bg-green-50 text-green-700', icon: CheckCircle2 },
} as const;

export type KidPaymentStatusKey = keyof typeof KID_PAYMENT_STATUS_CONFIG;

export function kidPaymentStatusKey(kid: Kid): KidPaymentStatusKey {
  if (!kid.amount) return 'not_set';
  if ((kid.amount_paid || 0) <= 0) return 'pending';
  if (kid.amount_paid >= kid.amount) return 'paid';
  return 'partial';
}

export function kidPaymentBadge(kid: Kid) {
  return KID_PAYMENT_STATUS_CONFIG[kidPaymentStatusKey(kid)];
}

// Kid food-preference badge — kid.food_preference has no group "2 veg / 3
// non-veg" breakdown case (that's a waitlist-only concept, free-typed into
// a message field), so this is just a direct wrap of the shared three-way
// mapping, same as AdminEnquiryCommon's own foodBadge for the adult side.
export function kidFoodBadge(kid: Kid): { label: string; color: string; key: 'veg' | 'non_veg' | 'not_set' } {
  const key = kid.food_preference === 'veg' || kid.food_preference === 'non_veg' ? kid.food_preference : 'not_set';
  return { ...foodPreferenceBadge(kid.food_preference), key };
}

// The standalone list's kebab menu for one kid row — same set of jumps as
// AdminEnquiryKidsCard's own buildKidActions (View/Edit, Manage Payment,
// every status jump, Not Interested/Reopen, No Show toggle, Delete), just
// lifted out here since both AdminKidsDesktopTable and AdminKidsMobileCards
// need the identical menu and neither should own the other's copy of it.
export function buildKidActions(kid: Kid, handlers: {
  onViewDetails: () => void;
  onManagePayment: () => void;
  onStatusChange: (status: KidStatus) => void;
  onNotInterested: () => void;
  onNoShowToggle: (isNoShow: boolean) => void;
  onDelete: () => void;
}): ActionMenuItem[] {
  const { onViewDetails, onManagePayment, onStatusChange, onNotInterested, onNoShowToggle, onDelete } = handlers;
  const items: ActionMenuItem[] = [
    { label: 'View / Edit Details', icon: Eye, onClick: onViewDetails },
    { label: 'Manage Payment', icon: IndianRupee, onClick: onManagePayment },
  ];
  if (kid.status !== 'confirmed') {
    items.push({ label: 'Mark Confirmed', icon: CheckCircle2, onClick: () => onStatusChange('confirmed') });
  }
  if (kid.status !== 'checked_in') {
    items.push({ label: 'Mark Checked In', icon: LogIn, onClick: () => onStatusChange('checked_in') });
  }
  if (kid.status !== 'completed') {
    items.push({ label: 'Mark Completed', icon: PartyPopper, onClick: () => onStatusChange('completed') });
  }
  if (kid.status !== 'pending') {
    items.push({ label: 'Mark Pending', icon: Clock, onClick: () => onStatusChange('pending') });
  }
  if (kid.status !== 'cancelled') {
    items.push({ label: 'Mark Cancelled', icon: XCircle, danger: true, onClick: () => onStatusChange('cancelled') });
  }
  if (canMarkKidNotInterested(kid)) {
    items.push({ label: 'Not Interested', icon: UserMinus, onClick: onNotInterested });
  }
  if (canReopenKid(kid)) {
    items.push({ label: 'Reopen', icon: RefreshCw, onClick: () => onStatusChange('pending') });
  }
  if (kid.is_no_show) {
    items.push({ label: 'Undo No Show', icon: UserCheck, onClick: () => onNoShowToggle(false) });
  } else if (canMarkKidNoShow(kid)) {
    items.push({ label: 'Mark No Show', icon: UserX, onClick: () => onNoShowToggle(true) });
  }
  items.push({ label: 'Edit Name / Age / Food', icon: Pencil, onClick: onViewDetails });
  items.push({ label: 'Delete', icon: Trash2, danger: true, onClick: onDelete });
  return items;
}
