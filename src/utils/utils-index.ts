// =============================================
// ULAA - Utility Functions
// =============================================

import type { CSSProperties } from 'react';
import type { CoverImageCrop } from '../types/types-index';

/** Format a number as Indian Rupees, e.g. 39999 -> "₹39,999" */
export function formatPrice(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

/**
 * Given a regular price and an optional early-bird price/deadline, work out
 * which price is currently active. The early-bird price applies up to and
 * including the deadline date; after that it automatically falls back to
 * the regular price.
 */
export function getActivePrice(
  price?: number,
  earlyBirdPrice?: number | null,
  earlyBirdDeadline?: string | null
): { activePrice?: number; isEarlyBird: boolean; deadlinePassed: boolean } {
  if (earlyBirdPrice && earlyBirdDeadline) {
    const deadline = new Date(earlyBirdDeadline);
    deadline.setHours(23, 59, 59, 999);
    const isActive = new Date() <= deadline;
    if (isActive) {
      return { activePrice: earlyBirdPrice, isEarlyBird: true, deadlinePassed: false };
    }
    return { activePrice: price, isEarlyBird: false, deadlinePassed: true };
  }
  return { activePrice: price, isEarlyBird: false, deadlinePassed: false };
}

/** Format a date string to a readable format */
export function formatDate(dateStr: string, options?: Intl.DateTimeFormatOptions): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...options,
  });
}

/** Format just the time portion of a timestamp (e.g. "9:08 AM"), for
 * showing alongside a date wherever exactly when an entry was created
 * matters — e.g. enquiries, so admins can see submission order within a
 * day, not just the date. */
export function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Works out what price (if any) should show crossed out next to the active
 * price — regardless of whether the active price is the regular price or
 * the early-bird price.
 *
 * Precedence:
 * 1. An explicit strike_through_price, if it's actually higher than what's
 *    being shown — this is the new, independent "was ₹X" marketing price
 *    and applies the same way whether early-bird is active or not.
 * 2. Otherwise, the old built-in behavior: while early-bird is active,
 *    cross out the regular price (so existing trips that never set a
 *    strike_through_price keep working exactly as before).
 * 3. Otherwise, nothing is crossed out.
 */
export function getStrikeThroughPrice(
  activePrice: number | undefined,
  regularPrice: number | undefined,
  isEarlyBird: boolean,
  strikeThroughPrice?: number | null
): number | undefined {
  if (strikeThroughPrice && activePrice != null && strikeThroughPrice > activePrice) {
    return strikeThroughPrice;
  }
  if (isEarlyBird && regularPrice) return regularPrice;
  return undefined;
}

/** Format a date range. Same month & year condenses to "17 - 22 Oct 2026"
 *  (no repeated month); otherwise falls back to the full "17 Dec 2026 –
 *  3 Jan 2027" form. */
export function formatDateRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const sameMonth = s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth();
  if (sameMonth) {
    const startDay = s.toLocaleDateString('en-IN', { day: 'numeric' });
    const endStr = e.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${startDay} - ${endStr}`;
  }
  const startStr = s.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const endStr = e.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${startStr} – ${endStr}`;
}

/**
 * Renders a trip's optional age eligibility for display. Either side may
 * be unset (no restriction on that side) — only called once at least one
 * side is set, so this never needs to represent "no restriction at all"
 * itself. See UpcomingTrip.min_age/max_age and validateAge in
 * src/utils/formValidation.ts for the matching form-validation logic.
 */
export function formatAgeRange(minAge?: number | null, maxAge?: number | null): string {
  const hasMin = minAge !== undefined && minAge !== null;
  const hasMax = maxAge !== undefined && maxAge !== null;
  if (hasMin && hasMax) return `${minAge}–${maxAge} yrs`;
  if (hasMin) return `${minAge}+ yrs`;
  if (hasMax) return `Up to ${maxAge} yrs`;
  return 'All ages welcome';
}

/** Get seats remaining count */
export function seatsLeft(total: number, booked: number): number {
  return Math.max(0, total - booked);
}

/**
 * Seats left as shown to the public. If people are actively waiting
 * (waitlist status 'waiting' or 'notified') for this trip, freed-up seats
 * go to them first — so the public count is reduced by that many, floored
 * at 0. If nobody is waiting, this is identical to seatsLeft. Admin views
 * should keep using seatsLeft directly since admins need the real number.
 */
export function publicSeatsLeft(total: number, booked: number, waitlistReserved: number): number {
  return Math.max(0, seatsLeft(total, booked) - waitlistReserved);
}

/** Truncate text */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + '…';
}

/** Generate a slug from a string */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Normalize a batch label: a plain number becomes "Batch N"; any other text is left as-is */
export function formatBatchLabel(batch: string): string {
  const trimmed = batch.trim();
  return /^\d+$/.test(trimmed) ? `Batch ${trimmed}` : trimmed;
}

/** Compact form of the batch label for tight spaces (mobile): a plain number becomes just "N" */
export function formatBatchShortLabel(batch: string): string {
  const trimmed = batch.trim();
  return /^\d+$/.test(trimmed) ? trimmed : trimmed.slice(0, 3);
}

/** Delay utility */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Format month and year */
export function formatMonthYear(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

/** Image placeholder */
export const PLACEHOLDER_IMAGE = 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=800&q=80';

/**
 * Turns a saved cover_image_crop (focal point + zoom, see CoverImageCrop in
 * types-index.ts) into inline styles for an <img className="object-cover">
 * element. object-position places the focal point inside whatever
 * object-fit: cover container the image sits in (Trip Card, Desktop Hero,
 * or Mobile Hero — each has its own aspect ratio); the extra scale()
 * transform, anchored at the same point via transform-origin, applies the
 * saved zoom on top without changing which part of the image is centered.
 *
 * With no saved crop (existing trips, or a trip whose cover was never
 * repositioned), this returns {} so the image keeps the plain
 * object-cover / centered default it always had — no migration needed.
 */
export function getCoverImageStyle(crop?: CoverImageCrop | null): CSSProperties {
  if (!crop) return {};
  const pos = `${crop.x}% ${crop.y}%`;
  return {
    objectPosition: pos,
    transform: crop.zoom !== 1 ? `scale(${crop.zoom})` : undefined,
    transformOrigin: pos,
  };
}

/** WhatsApp link */
export function getWhatsAppLink(phone: string, message?: string): string {
  // wa.me only accepts digits. The hardcoded business number this was
  // originally written for is already digits-only, but phone numbers
  // pulled from enquiry/waitlist rows can contain '+', spaces, or dashes
  // (see the phone input patterns in BookingForm/WaitlistForm), which
  // would otherwise produce a broken link.
  const digitsOnly = phone.replace(/\D/g, '');
  const encoded = encodeURIComponent(message || 'Hi! I am interested in ULAA trips.');
  return `https://wa.me/${digitsOnly}?text=${encoded}`;
}

/**
 * Turns a 0-based index into a spreadsheet-style letter label: 0 -> "A",
 * 1 -> "B", ... 25 -> "Z", 26 -> "AA", 27 -> "AB", etc.
 */
export function letterLabel(index: number): string {
  let n = index;
  let label = '';
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

/** One "group" unit to be named — a group booking (enquiries.group_id) or
 * a group waitlist signup (one waitlist row with group_size > 1). */
export interface GroupUnit {
  /** Stable identity for this group — e.g. an enquiries.group_id, or
   * `wl:${waitlistRowId}` for a waitlist signup. */
  key: string;
  /** Trip this group belongs to — letters are scoped per trip. */
  tripId: string;
  /** Earliest timestamp this group appeared — determines its letter. */
  createdAt: string;
}

/**
 * Names every group on a trip "Group A", "Group B", "Group C"... in the
 * order they were first created — the single source of truth shared by the
 * Enquiries and Waitlist admin pages, so a group keeps the same letter no
 * matter which page it's viewed from, and a brand-new group (whether it's a
 * fresh group booking or someone joining the waitlist as a group) always
 * picks up the next letter in that trip's sequence, continuing on from
 * whatever groups already exist for that trip across both places.
 */
export function buildGroupLetterMap(units: GroupUnit[]): Map<string, string> {
  const earliestByKey = new Map<string, GroupUnit>();
  units.forEach(u => {
    const existing = earliestByKey.get(u.key);
    if (!existing || u.createdAt < existing.createdAt) earliestByKey.set(u.key, u);
  });
  const byTrip = new Map<string, GroupUnit[]>();
  earliestByKey.forEach(u => {
    if (!byTrip.has(u.tripId)) byTrip.set(u.tripId, []);
    byTrip.get(u.tripId)!.push(u);
  });
  const letters = new Map<string, string>();
  byTrip.forEach(groupUnits => {
    groupUnits
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
      .forEach((u, idx) => letters.set(u.key, letterLabel(idx)));
  });
  return letters;
}

// =============================================
// CSV export
// =============================================
// Client-side only, no backend involved — serializes whatever rows the
// admin passes in (already filtered/sorted/scoped by the calling page,
// e.g. to one trip) straight to a downloaded .csv. Covers the common asks
// this business actually gets: a passenger list for an airline/hotel
// manifest, or a payments/waitlist export to hand off as a spreadsheet
// rather than a link to the web app.
export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][]
): void {
  const escapeCell = (cell: string | number | null | undefined): string => {
    const str = cell == null ? '' : String(cell);
    // Quote (and double up any embedded quotes) whenever the cell contains
    // a comma, quote, or newline — anything else round-trips as plain text.
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const lines = [headers, ...rows].map(row => row.map(escapeCell).join(','));
  // Leading UTF-8 BOM so Excel (the realistic destination for a vendor
  // headcount handoff) renders ₹ and non-ASCII names correctly instead of
  // mojibake — plain browsers/Sheets ignore the BOM either way.
  const csvContent = '\ufeff' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
// Anonymous per-device identifier used only for the public album Like
// button (see completed_trip_likes / like_completed_trip in api.ts) — the
// site has no visitor accounts, so this is what lets the DB enforce "one
// like per visitor" instead of trusting a client-side flag alone. Created
// once and reused from localStorage; a cleared browser gets a fresh one
// (and so a fresh like), which is the same inherent ceiling any anonymous,
// no-login like button has.
const VISITOR_ID_KEY = 'ulaa_visitor_id';

export function getVisitorId(): string {
  let id = localStorage.getItem(VISITOR_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(VISITOR_ID_KEY, id);
  }
  return id;
}

// Walks an arbitrary JSON-shaped value (objects, arrays, strings mixed
// together) and collects every string that looks like a Supabase storage
// URL for the given bucket. Used by page-level admin forms (About, Why
// ULAA) that don't have a single flat list of image fields the way a
// modal form does — content here is a nested tree of sections, each of
// which may or may not hold an image URL — so rather than hand-maintain a
// list of every image field (and have it drift as sections are added),
// this just recursively finds anything that matches the storage URL shape.
export function collectStorageUrls(value: unknown, bucket: string): Set<string> {
  const urls = new Set<string>();
  const marker = `/object/public/${bucket}/`;
  const walk = (v: unknown) => {
    if (typeof v === 'string') {
      if (v.includes(marker)) urls.add(v);
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (v && typeof v === 'object') {
      Object.values(v).forEach(walk);
    }
  };
  walk(value);
  return urls;
}
