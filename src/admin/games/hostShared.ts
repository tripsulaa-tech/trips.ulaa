import type { Enquiry, UpcomingTrip } from '../../types/types-index';

// Helpers shared by the admin-hosted games (Truth or Dare, Stowaway): which
// trips can be played on, and how travellers become on-screen player names.

export const todayLocal = (): string => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Trips that have not ended yet, soonest first. */
export function playableTrips(all: UpcomingTrip[], today: string): UpcomingTrip[] {
  return all
    .filter(t => !!t.end_date && t.end_date.slice(0, 10) >= today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
}

export const isInProgress = (t: UpcomingTrip, today: string) => t.start_date.slice(0, 10) <= today;

/** First names for the on-screen players; adds a last initial when two share one. */
export function playerNames(people: Enquiry[]): string[] {
  const parts = people.map(p => p.full_name.trim().split(/\s+/));
  const firstCount = new Map<string, number>();
  parts.forEach(w => { const k = (w[0] ?? '').toLowerCase(); firstCount.set(k, (firstCount.get(k) ?? 0) + 1); });
  return parts.map(w => {
    const first = w[0] ?? '';
    const dupe = (firstCount.get(first.toLowerCase()) ?? 0) > 1;
    return dupe && w.length > 1 ? `${first} ${w[w.length - 1].charAt(0).toUpperCase()}` : first;
  }).filter(Boolean);
}
