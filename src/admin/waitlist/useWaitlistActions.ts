import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { updateWaitlistStatus, deleteWaitlistEntry } from '../../services/api';
import { useConfirm } from '../../components/ui/useConfirm';
import type { WaitlistEntry } from '../../types/types-index';
import { canConvert, convertedCount, seatsRemaining } from './waitlistShared';

/** Owns the per-row actions on the waitlist table/cards — changing status,
 *  removing an entry, and converting a waiting/notified entry to an
 *  enquiry — plus the per-trip FIFO queue rank (3.3) those actions read.
 *
 *  Extracted from AdminWaitlist.tsx (see that file's history for the
 *  original single-component version). */
export function useWaitlistActions(
  entries: WaitlistEntry[],
  setEntries: React.Dispatch<React.SetStateAction<WaitlistEntry[]>>,
  seatsAvailable: Record<string, number>,
  load: () => void
) {
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [updating, setUpdating] = useState<string | null>(null);

  // Per-trip FIFO queue rank (3.3) — ranks every still-convertible
  // (waiting/notified) entry by how long it's been sitting relative to
  // others waiting on the *same trip*, oldest first. Declined/converted
  // entries don't hold a queue spot. This is purely a visibility +
  // soft-warning aid: nothing in the DB enforces conversion order, an
  // admin can still convert out of turn (e.g. a group that only just now
  // fits), but they get a clear "#2 of 5" indicator and a confirmation
  // prompt before doing so instead of no signal at all beyond eyeballing
  // the Joined column.
  const queueRank = useMemo(() => {
    const map = new Map<string, { rank: number; total: number }>();
    const byTrip = new Map<string, WaitlistEntry[]>();
    entries.forEach(e => {
      if (!canConvert(e)) return;
      if (!byTrip.has(e.trip_id)) byTrip.set(e.trip_id, []);
      byTrip.get(e.trip_id)!.push(e);
    });
    byTrip.forEach(list => {
      const sorted = [...list].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
      sorted.forEach((e, i) => map.set(e.id, { rank: i + 1, total: sorted.length }));
    });
    return map;
  }, [entries]);

  const handleStatusChange = async (id: string, status: WaitlistEntry['status']) => {
    setUpdating(id);
    setEntries(prev => prev.map(e => (e.id === id ? { ...e, status } : e)));
    await updateWaitlistStatus(id, status).catch(console.error);
    setUpdating(null);
    // The optimistic update above only touches this entry's status — it
    // doesn't refresh seatsAvailable, so a stale "N seats open" badge could
    // linger if another booking landed elsewhere while this page was open.
    // Reload trip/seat data (not a full-page loading state) to keep it honest.
    load();
  };

  const handleDelete = async (entry: WaitlistEntry) => {
    if (!(await confirm({ message: `Remove ${entry.full_name} from the waitlist?`, confirmLabel: 'Remove' }))) return;
    setUpdating(entry.id);
    await deleteWaitlistEntry(entry.id).catch(console.error);
    setEntries(prev => prev.filter(e => e.id !== entry.id));
    setUpdating(null);
  };

  const handleConvert = async (entry: WaitlistEntry) => {
    // canConvert() only checks the entry's own status, not whether a seat
    // is actually free — so this can be reached even when the trip has
    // since filled up (e.g. someone else was converted first) or doesn't
    // have enough room for the whole group. Rather than let the admin fill
    // in the whole form and only find out from a failed save, tell them up
    // front how many seats are actually available.
    const needed = seatsRemaining(entry);
    const available = seatsAvailable[entry.trip_id] ?? 0;

    // Soft FIFO warning (3.3): nothing stops converting a newer signup
    // ahead of an older one for the same trip, so ask for a deliberate
    // confirmation rather than letting it happen silently. Doesn't block —
    // there are legitimate reasons to skip the line (the person ahead
    // isn't reachable, only a partial group fits, etc.) — it just makes
    // sure it's a choice, not an accident.
    const rankInfo = queueRank.get(entry.id);
    if (rankInfo && rankInfo.rank > 1) {
      const aheadCount = rankInfo.rank - 1;
      const proceed = await confirm({
        title: 'Not first in line',
        message: `${aheadCount} ${aheadCount === 1 ? 'person has' : 'people have'} been waiting longer than ${entry.full_name} for this trip (they're #${rankInfo.rank} of ${rankInfo.total}). Convert them ahead of the others anyway?`,
        confirmLabel: 'Convert anyway',
        variant: 'default',
      });
      if (!proceed) return;
    }

    if (available <= 0) {
      await confirm({
        title: 'No slots available',
        message: 'All slots are filled. Unable to complete the conversion.',
        confirmLabel: 'OK',
        hideCancel: true,
        variant: 'default',
      });
      return;
    }

    if (available < needed) {
      const slotWord = available === 1 ? 'slot' : 'slots';
      const proceed = await confirm({
        title: 'Not enough slots for the full group',
        message: available === 1
          ? 'Only 1 slot is available. Only 1 person can be converted.'
          : `Only ${available} ${slotWord} available. You can convert up to ${available} people.`,
        confirmLabel: 'Continue',
        variant: 'default',
      });
      if (!proceed) return;
    }

    // How many people we can actually seat right now — never more than what's
    // still needed for the group, never more than what's physically free.
    const slots = Math.max(Math.min(needed, available), 1);

    navigate('/admin/enquiries', {
      state: {
        convertWaitlist: {
          id: entry.id,
          full_name: entry.full_name,
          phone: entry.phone,
          email: entry.email,
          age: entry.age,
          city: entry.city,
          food_preference: entry.food_preference,
          trip_id: entry.trip_id,
          trip_title: entry.trip_title,
          message: entry.message,
          group_size: entry.group_size,
          already_converted: convertedCount(entry),
          slots,
        },
      },
    });
  };

  return { updating, queueRank, handleStatusChange, handleDelete, handleConvert };
}
