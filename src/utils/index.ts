// =============================================
// ULAA - Utility Functions
// =============================================

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
