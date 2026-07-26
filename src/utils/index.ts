// =============================================
// ULAA - Utility Functions
// =============================================

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
  earlyBirdPrice?: number,
  earlyBirdDeadline?: string
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
  strikeThroughPrice?: number
): number | undefined {
  if (strikeThroughPrice && activePrice != null && strikeThroughPrice > activePrice) {
    return strikeThroughPrice;
  }
  if (isEarlyBird && regularPrice) return regularPrice;
  return undefined;
}

/** Format a date range */
export function formatDateRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const startStr = s.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const endStr = e.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${startStr} – ${endStr}`;
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

/** WhatsApp link */
export function getWhatsAppLink(phone: string, message?: string): string {
  const encoded = encodeURIComponent(message || 'Hi! I am interested in ULAA trips.');
  return `https://wa.me/${phone}?text=${encoded}`;
}