import { useEffect, useState } from 'react';
import { getKidsForEnquiry, updateKid, updateKidStatus, bulkUpdateKidsStatus, setKidFollowUp, updateKidNoShow, deleteKid, logKidActivity } from '../../services/api/enquiries/kids';
import { subscribeToTable } from '../../services/realtime';
import { useConfirm } from '../../components/ui/useConfirm';
import type { ClosedReason, Kid, KidStatus } from '../../types/types-index';

/** Owns the Kids card's data + bulk-selection state for one enquiry —
 *  loading the kid rows, the checkbox selection set, and the mutating
 *  actions (status change, follow-up, edit, delete), each followed by a
 *  local refetch so the card always reflects what's actually saved.
 *
 *  Mirrors useEnquirySelection's shape (selectedIds/toggle helpers) at
 *  the kid-row level, scoped to whichever enquiry's detail page this is
 *  mounted on — kids only ever get "selected for bulk action" within
 *  their own parent booking, not across enquiries. */
export function useKidsForEnquiry(enquiryId: string) {
  const confirm = useConfirm();
  const [kids, setKids] = useState<Kid[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getKidsForEnquiry(enquiryId);
      setKids(data);
    } catch (err) {
      console.error('Failed to load kids:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() is an async fetch-on-mount, not a synchronous external-system sync
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enquiryId]);

  // Live updates — the instant a kid row for this enquiry changes (e.g.
  // kids_price_sync_on_trip_update bulk-repricing every unpaid kid the
  // moment an admin edits the trip's Child Fee elsewhere in the app),
  // re-pull this card's kids so it's never showing a stale fee. Requires
  // enable_realtime_kids.sql to have been run — see that file.
  useEffect(() => {
    const unsubscribe = subscribeToTable('kids', () => { load(); }, `enquiry_id=eq.${enquiryId}`);
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load() is stable in intent (re-reads enquiryId via closure), re-subscribing only needs to key off enquiryId itself
  }, [enquiryId]);

  const toggleSelectOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds(prev => {
      const allSelected = kids.length > 0 && kids.every(k => prev.has(k.id));
      return allSelected ? new Set() : new Set(kids.map(k => k.id));
    });
  };

  const kidLabel = (kid: Kid, fallbackIndex: number) => kid.name?.trim() || `Kid ${fallbackIndex + 1}`;

  const handleUpdateStatus = async (kid: Kid, status: KidStatus, reason?: ClosedReason) => {
    setBusy(true);
    try {
      await updateKidStatus(kid.id, status, reason);
      await logKidActivity(enquiryId, `Kid marked ${status.replace('_', ' ')}`, kidLabel(kid, kids.indexOf(kid)));
      await load();
    } finally {
      setBusy(false);
    }
  };

  const handleBulkStatus = async (status: KidStatus) => {
    if (selectedIds.size === 0) return;
    setBusy(true);
    try {
      const ids = Array.from(selectedIds);
      await bulkUpdateKidsStatus(ids, status);
      await logKidActivity(enquiryId, `${ids.length} kid${ids.length === 1 ? '' : 's'} marked ${status.replace('_', ' ')}`);
      setSelectedIds(new Set());
      await load();
    } finally {
      setBusy(false);
    }
  };

  const handleSetFollowUp = async (kid: Kid, followUpAt: string | null, notes?: string | null) => {
    setBusy(true);
    try {
      await setKidFollowUp(kid.id, followUpAt, notes);
      await logKidActivity(
        enquiryId,
        followUpAt ? 'Kid follow-up set' : 'Kid follow-up cleared',
        `${kidLabel(kid, kids.indexOf(kid))}${followUpAt ? ` — ${followUpAt}` : ''}`
      );
      await load();
    } finally {
      setBusy(false);
    }
  };

  const handleToggleNoShow = async (kid: Kid, isNoShow: boolean) => {
    setBusy(true);
    try {
      await updateKidNoShow(kid.id, isNoShow);
      await logKidActivity(
        enquiryId,
        isNoShow ? 'Kid marked no-show' : 'Kid no-show undone',
        kidLabel(kid, kids.indexOf(kid))
      );
      await load();
    } finally {
      setBusy(false);
    }
  };

  const handleEdit = async (kid: Kid, patch: Partial<Pick<Kid, 'name' | 'age' | 'food_preference'>>) => {
    setBusy(true);
    try {
      await updateKid(kid.id, patch);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (kid: Kid) => {
    const ok = await confirm({
      title: 'Delete this kid?',
      message: `This permanently removes ${kidLabel(kid, kids.indexOf(kid))}'s record and payment history. This cannot be undone.`,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteKid(kid.id);
      await logKidActivity(enquiryId, 'Kid record removed', kidLabel(kid, kids.indexOf(kid)));
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(kid.id);
        return next;
      });
      await load();
    } finally {
      setBusy(false);
    }
  };

  return {
    kids, loading, busy,
    selectedIds, toggleSelectOne, toggleSelectAll, clearSelection: () => setSelectedIds(new Set()),
    kidLabel,
    handleUpdateStatus, handleBulkStatus, handleSetFollowUp, handleToggleNoShow, handleEdit, handleDelete,
    reload: load,
  };
}
