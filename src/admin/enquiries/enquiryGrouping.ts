import {
  ChatCircle as MessageCircle,
  Phone,
  XCircle,
  Hourglass,
  CalendarCheck,
} from '@phosphor-icons/react';
import type { Enquiry, WaitlistEntry } from '../../types/types-index';
import { getWaitlistEntries } from '../../services/api';
import { foodPreferenceKey } from './AdminEnquiryCommon';
import { GROUP_COLOR_PALETTE, isBooked, isCancelled } from './AdminEnquiriesShared';

/** Small, mostly-pure helpers for the grouping and KPI-summary logic used
 *  around the enquiries table — who a group booking belongs to, what color
 *  its badge gets, running payment/food/status totals for a list, and the
 *  waitlist "N people waiting" counts banner. None of these hold state of
 *  their own; AdminEnquiries.tsx keeps owning groupLetterMap/groupColorMap/
 *  waitlistWaitingCounts and just calls through to these.
 *
 *  Extracted from AdminEnquiries.tsx (see that file's history for the
 *  original single-component version). */

// Is this enquiry a genuine "Contact Us" website message, as opposed to
// a manual no-trip entry an admin logged? The manual-entry form's source
// dropdown never offers 'website' (see SOURCE_OPTIONS), so trip_id null
// + source 'website' can only come from submitContactEnquiry.
export const isGeneralContactMessage = (e: Enquiry) => !e.trip_id && e.source === 'website';

// Names a group booking "Group A", "Group B", "Group C"... given the
// trip-scoped letter map built by buildGroupLetterMap (shared with the
// Waitlist page — see AdminEnquiries.tsx for how groupLetterMap itself is
// assembled from both group bookings and group waitlist signups).
export const groupLabelFor = (e: Enquiry, groupLetterMap: Map<string, string>) =>
  e.group_id && groupLetterMap.has(e.group_id) ? `Group ${groupLetterMap.get(e.group_id)}` : 'Group';

// Assigns each group_id a color from the palette, in the order groups
// first appear top-to-bottom in the (already-clustered) list passed in —
// so any two groups visible near each other on screen always get
// different colors, which is what actually matters for telling them apart
// at a glance. The color ties together a group's row background/left-
// accent and its "Group x/y" badge everywhere it's rendered.
export const buildGroupColorMap = (sortedScoped: Enquiry[]): Map<string, number> => {
  const groupColorMap = new Map<string, number>();
  let nextGroupColorIdx = 0;
  sortedScoped.forEach(e => {
    if (e.group_id && !groupColorMap.has(e.group_id)) {
      groupColorMap.set(e.group_id, nextGroupColorIdx % GROUP_COLOR_PALETTE.length);
      nextGroupColorIdx++;
    }
  });
  return groupColorMap;
};
export const groupColorFor = (e: Enquiry, groupColorMap: Map<string, number>): typeof GROUP_COLOR_PALETTE[number] | null =>
  e.group_id ? GROUP_COLOR_PALETTE[groupColorMap.get(e.group_id)!] : null;

// Kids never get their own enquiry row in the database — kids_count is
// just a headcount on the parent booking (no name, no individual food/
// payment/status; see Enquiry.kids_count/kids_amount) — but on screen we
// still want a booking's row count to reflect real headcount, the same
// way a solo booking already shows one row per person. This derives the
// placeholder rows to render directly under a parent enquiry: one per
// kid, carrying just enough (a stable id + 1-based index/total) for the
// table to label them "Kid 1 of 2" etc. Every column that would need
// real per-kid data renders as "—" for these rows.
export interface KidDisplayRow {
  id: string;
  index: number;
  total: number;
}
export const kidDisplayRows = (e: Enquiry): KidDisplayRow[] => {
  const total = e.kids_count || 0;
  return Array.from({ length: total }, (_, i) => ({ id: `${e.id}-kid-${i + 1}`, index: i + 1, total }));
};

export const paymentTotals = (list: Enquiry[]) => ({
  collected: list.reduce((sum, e) => sum + (e.amount_paid || 0), 0),
  pending: list.reduce((sum, e) => {
    if (!e.total_amount) return sum;
    return sum + Math.max(0, e.total_amount - (e.amount_paid || 0));
  }, 0),
  paidFull: list.filter(e => e.total_amount && e.amount_paid >= e.total_amount).length,
  partial: list.filter(e => e.total_amount && e.amount_paid > 0 && e.amount_paid < e.total_amount).length,
  unpaid: list.filter(e => e.total_amount && e.amount_paid <= 0).length,
  notSet: list.filter(e => !e.total_amount).length,
});

// Meal-planning counts for a trip: how many veg vs non-veg vs not-yet-known.
export const foodTotals = (list: Enquiry[]) => ({
  veg: list.filter(e => foodPreferenceKey(e) === 'veg').length,
  nonVeg: list.filter(e => foodPreferenceKey(e) === 'non_veg').length,
  notSet: list.filter(e => foodPreferenceKey(e) === 'not_set').length,
});

// KPI snapshot builder for the summary cards up top — called with
// scopedEnquiries so the numbers reflect whichever trip is currently
// selected in the Trip filter (or business-wide when "All trips").
export const buildKpiCards = (list: Enquiry[]) => {
  const total = list.length;
  const openPending = list.filter(e => e.status === 'new').length;
  const contacted = list.filter(e => e.status === 'contacted').length;
  const booked = list.filter(isBooked).length;
  const cancelled = list.filter(isCancelled).length;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  return [
    { label: 'Total Enquiries', value: total, sub: 'All time', icon: MessageCircle },
    { label: 'Open / Pending', value: openPending, sub: `${pct(openPending)}% of total`, icon: Hourglass },
    { label: 'Contacted', value: contacted, sub: `${pct(contacted)}% of total`, icon: Phone },
    { label: 'Booked', value: booked, sub: `${pct(booked)}% of total`, icon: CalendarCheck },
    { label: 'Cancelled', value: cancelled, sub: `${pct(cancelled)}% of total`, icon: XCircle },
  ] as const;
};

// Phrases a trip's waiting count so a group signup reads as a group, not
// as "1 person" — e.g. a lone group-of-3 signup becomes "1 group of 3",
// and a mix of signups becomes "5 people across 2 waitlist signups".
export const describeWaiting = (summary: { entries: number; people: number }): string => {
  if (summary.entries === 1) {
    return summary.people > 1 ? `1 group of ${summary.people}` : '1 person';
  }
  return `${summary.people} people across ${summary.entries} waitlist signups`;
};

// Fetches every waitlist entry and rolls up how many signups — and how
// many actual people, since a group signup (group_size > 1) is one signup
// but several people — are waiting (status 'waiting') for each trip. Used
// to warn admins before they free up a seat that someone's already in
// line for. Takes the setters directly (rather than being a hook itself)
// since AdminEnquiries.tsx already owns both pieces of state and just
// needs a fire-and-forget refresh callback — same shape as `load` from
// useEnquiryData.
export const fetchWaitlistCounts = (
  setWaitlistEntriesForGroups: (entries: WaitlistEntry[]) => void,
  setWaitlistWaitingCounts: (counts: Record<string, { entries: number; people: number }>) => void
) => {
  getWaitlistEntries()
    .then(entries => {
      setWaitlistEntriesForGroups(entries);
      const counts: Record<string, { entries: number; people: number }> = {};
      entries.forEach(e => {
        if (e.status !== 'waiting') return;
        const needed = e.group_size && e.group_size > 1 ? e.group_size : 1;
        const prev = counts[e.trip_id] || { entries: 0, people: 0 };
        counts[e.trip_id] = { entries: prev.entries + 1, people: prev.people + needed };
      });
      setWaitlistWaitingCounts(counts);
    })
    .catch(console.error);
};
