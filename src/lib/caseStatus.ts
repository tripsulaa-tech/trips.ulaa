/**
 * Case status classification — ported 1:1 from the legacy
 * js/modules/data/utils.js ACTIVE_STATUSES / CLOSED_STATUSES / isActive /
 * isClosed. Kept as the single source of truth here too, since both the
 * Overview KPIs and Team table need the same semantics.
 */

const ACTIVE_STATUSES = new Set([
  'New Case',
  'Awaiting your feedback',
  'IBM is working',
  'Waiting for IBM',
  'Waiting on IBM software update',
]);

const CLOSED_STATUSES = new Set(['Closed - Archived', 'Closed by IBM', 'Closed by Client', 'Cancelled']);

/** Whitelist check — use for active case counts & status breakdowns. */
export function isActiveStatus(status: string | null | undefined): boolean {
  return ACTIVE_STATUSES.has((status || '').trim());
}

/** Terminal-state check — use for filtering out closed cases. Falls back
 * to substring match so future closed-status variants are still caught. */
export function isClosedStatus(status: string | null | undefined): boolean {
  const s = (status || '').trim();
  if (CLOSED_STATUSES.has(s)) return true;
  const sl = s.toLowerCase();
  return sl.includes('closed') || sl === 'cancelled' || sl === 'canceled';
}

/** Text color for a case's severity digit ("1"-"4"). Shared by every case
 * search/result list that shows a severity badge (Sidebar search, Weekly
 * Tracker's GlobalCaseSearch). */
export function severityColor(sev: string): string {
  if (sev === '1') return 'text-red';
  if (sev === '2') return 'text-orange';
  if (sev === '3') return 'text-yellow-text';
  return 'text-text-disabled';
}
