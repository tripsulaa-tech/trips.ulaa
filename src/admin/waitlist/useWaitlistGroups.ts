import { buildGroupLetterMap } from '../../utils/utils-index';
import type { GroupUnit } from '../../utils/utils-index';
import type { WaitlistEntry, Enquiry } from '../../types/types-index';

/** Names every group on a trip "Group A", "Group B", "Group C"... in the
 *  order it was first created — shared with the Enquiries page (via the
 *  same buildGroupLetterMap helper) so a group booking and a group
 *  waitlist signup for the same trip sit in one continuous sequence. A
 *  brand-new group waitlist entry always picks up the next letter after
 *  whatever groups (bookings or waitlist) already exist for that trip.
 *
 *  Extracted from AdminWaitlist.tsx (see that file's history for the
 *  original single-component version). */
export function useWaitlistGroups(entries: WaitlistEntry[], enquiriesForGroups: Enquiry[]) {
  const groupUnits: GroupUnit[] = [];
  const seenGroupIds = new Set<string>();
  enquiriesForGroups.forEach(en => {
    if (!en.group_id || seenGroupIds.has(en.group_id)) return;
    seenGroupIds.add(en.group_id);
    groupUnits.push({ key: en.group_id, tripId: en.trip_id || 'unlinked', createdAt: en.created_at });
  });
  entries.forEach(w => {
    if (!w.group_size || w.group_size <= 1) return;
    groupUnits.push({ key: `wl:${w.id}`, tripId: w.trip_id || 'unlinked', createdAt: w.created_at });
  });

  const groupLetterMap = buildGroupLetterMap(groupUnits);
  const groupLabel = (e: WaitlistEntry) =>
    e.group_size && e.group_size > 1 && groupLetterMap.has(`wl:${e.id}`)
      ? `Group ${groupLetterMap.get(`wl:${e.id}`)}`
      : 'Group';

  return { groupLabel };
}
