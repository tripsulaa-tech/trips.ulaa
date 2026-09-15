// Pure date/slot-math helpers for the Wednesday Updates sub-tab. Ported
// 1:1 from js/dashboards/performance.js — see mostRecentWedKey (~L2087),
// dateKey/buildMonthSlots (~L3000-3026) in renderWednesdayDetail().

export const AVAIL_NEEDS_FOLLOWUP = new Set(['Not Joined', 'On Leave', 'Follow Up', 'Reopen']);

export const AVAIL_OPTS = [
  { value: '', label: '— Set —' },
  { value: 'Attended', label: '✓ Attended' },
  { value: 'Not Joined', label: '✗ Not Joined' },
  { value: 'On Leave', label: '◌ On Leave' },
  { value: 'Follow Up', label: '→ Follow Up' },
  { value: 'Reopen', label: '↻ Reopen' },
] as const;

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "2026-06-23" style key for the most recent Wednesday (the week the
 * current Wednesday Updates cycle covers). Shared by KPI calc and the
 * cases table's "Last Update" column so both always agree on the same date. */
export function mostRecentWedKey(d?: Date): string {
  const now = d || new Date();
  const dayOfWeek = now.getDay();
  const daysBack = (dayOfWeek + 4) % 7; // Wednesday = 3
  const wed = new Date(now);
  wed.setDate(now.getDate() - (dayOfWeek === 3 ? 0 : daysBack));
  wed.setHours(0, 0, 0, 0);
  return `${wed.getFullYear()}-${String(wed.getMonth() + 1).padStart(2, '0')}-${String(wed.getDate()).padStart(2, '0')}`;
}

/** "2026-06-23" -> "23 Jun" — compact caption under availability badges. */
export function fmtAvDate(s?: string | null): string {
  if (!s) return '';
  const d = new Date(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fmtDay(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export interface MonthSlot {
  slotKey: string;
  dayOfWeek: number;
  date: Date;
  si: number;
}

/** One weekly slot per week that falls in the given month, defaulting to
 * Wednesday (day 3) unless overridden in `slotDays` (keyed by
 * "YYYY-MM-slotIndex", matching the legacy `_slotDays` map / the backend's
 * performance_slot_days rows). */
export function buildMonthSlots(year: number, mo: number, slotDays: Record<string, number>): MonthSlot[] {
  const slots: MonthSlot[] = [];
  const firstDay = new Date(year, mo, 1);
  const lastDay = new Date(year, mo + 1, 0);
  let weekStart = new Date(firstDay);
  const dow = weekStart.getDay();
  weekStart.setDate(weekStart.getDate() - (dow === 0 ? 6 : dow - 1));
  let si = 0;
  while (weekStart <= lastDay) {
    const slotKey = `${year}-${String(mo).padStart(2, '0')}-${si}`;
    const dayOfWeek = slotDays[slotKey] !== undefined ? slotDays[slotKey] : 3;
    const offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const occDate = new Date(weekStart);
    occDate.setDate(occDate.getDate() + offset);
    if (occDate.getMonth() === mo && occDate.getFullYear() === year) {
      slots.push({ slotKey, dayOfWeek, date: occDate, si });
    }
    weekStart = new Date(weekStart);
    weekStart.setDate(weekStart.getDate() + 7);
    si++;
  }
  return slots;
}

export function avColor(v: string): string {
  switch (v) {
    case 'Attended': return 'var(--color-green)';
    case 'Not Joined': return 'var(--color-red)';
    case 'On Leave': return 'var(--color-chart-3)';
    case 'Follow Up': return 'var(--color-chart-4)';
    case 'Reopen': return 'var(--color-chart-7)';
    default: return 'var(--color-text-tertiary)';
  }
}

export function avBg(v: string): string {
  switch (v) {
    case 'Attended': return 'rgba(25,128,56,.09)';
    case 'Not Joined': return 'rgba(218,30,40,.08)';
    case 'On Leave': return 'rgba(166,120,0,.09)';
    case 'Follow Up': return 'rgba(124,58,237,.09)';
    case 'Reopen': return 'rgba(224,112,0,.10)';
    default: return 'transparent';
  }
}

export function avLabel(v: string): string {
  return AVAIL_OPTS.find((o) => o.value === v)?.label ?? '— Set —';
}
