import { useState } from 'react';
import {
  updateKid, updateKidStatus, bulkUpdateKidsStatus, setKidFollowUp, updateKidNoShow, deleteKid, logKidActivity,
} from '../../services/api/enquiries/kids';
import { useConfirm } from '../../components/ui/useConfirm';
import { useKidPayment } from '../enquiries/useKidPayment';
import type { ClosedReason, Kid, KidStatus } from '../../types/types-index';
import type { KidRow } from './kidsShared';

/** Owns every mutating action the standalone Kids list can take on a
 *  row — status change (+ the same Not Interested reason / bulk-status /
 *  follow-up / no-show / edit / delete this kid already gets from
 *  useKidsForEnquiry on the enquiry detail page) — plus this page's own
 *  Payment modal wiring via useKidPayment (already enquiry-agnostic, so
 *  it's reused unchanged).
 *
 *  The one real difference from useKidsForEnquiry: that hook is scoped to
 *  a single enquiryId and refetches that one enquiry's kids after every
 *  mutation. This page lists kids across every enquiry at once, so there's
 *  no single enquiryId to scope a refetch to — instead each action reads
 *  `kid.enquiry_id` off the row it was given (every KidRow already carries
 *  it, being a Kid), and the caller's `load()` (from useKidsData) re-runs
 *  the full join afterward. Selection/bulk-status stay index-agnostic the
 *  same way, keyed by kid id across the whole filtered set rather than one
 *  enquiry's handful. */
export function useKidsActions(kidRows: KidRow[], load: () => void, getTripChildPrice: (tripId: string | undefined) => number | undefined) {
  const confirm = useConfirm();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  const payment = useKidPayment({ onSaved: () => load(), getTripChildPrice });

  const toggleSelectOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (rows: KidRow[]) => {
    setSelectedIds(prev => {
      const allSelected = rows.length > 0 && rows.every(k => prev.has(k.id));
      return allSelected ? new Set() : new Set(rows.map(k => k.id));
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleUpdateStatus = async (kid: KidRow, status: KidStatus, reason?: ClosedReason) => {
    setBusy(kid.id);
    try {
      await updateKidStatus(kid.id, status, reason);
      await logKidActivity(kid.enquiry_id, `Kid marked ${status.replace('_', ' ')}`, kid.label, kid.id);
      load();
    } finally {
      setBusy(null);
    }
  };

  // No single enquiry_id to log a combined activity line against here (a
  // bulk selection can span several bookings) — logged per-kid instead, so
  // every affected booking's own Activity Timeline still records it, same
  // as if each kid had been changed one at a time.
  const handleBulkStatus = async (status: KidStatus) => {
    if (selectedIds.size === 0) return;
    setBusy('bulk');
    try {
      const ids = Array.from(selectedIds);
      const selectedRows = kidRows.filter(k => ids.includes(k.id));
      await bulkUpdateKidsStatus(ids, status);
      await Promise.all(selectedRows.map(k => logKidActivity(k.enquiry_id, `Kid marked ${status.replace('_', ' ')}`, k.label, k.id)));
      clearSelection();
      load();
    } finally {
      setBusy(null);
    }
  };

  const handleSetFollowUp = async (kid: KidRow, followUpAt: string | null, notes?: string | null) => {
    setBusy(kid.id);
    try {
      await setKidFollowUp(kid.id, followUpAt, notes);
      await logKidActivity(kid.enquiry_id, followUpAt ? 'Kid follow-up set' : 'Kid follow-up cleared', `${kid.label}${followUpAt ? ` — ${followUpAt}` : ''}`, kid.id);
      load();
    } finally {
      setBusy(null);
    }
  };

  const handleToggleNoShow = async (kid: KidRow, isNoShow: boolean) => {
    setBusy(kid.id);
    try {
      await updateKidNoShow(kid.id, isNoShow);
      await logKidActivity(kid.enquiry_id, isNoShow ? 'Kid marked no-show' : 'Kid no-show undone', kid.label, kid.id);
      load();
    } finally {
      setBusy(null);
    }
  };

  const handleEdit = async (kid: KidRow, patch: Partial<Pick<Kid, 'name' | 'age' | 'food_preference'>>) => {
    setBusy(kid.id);
    try {
      await updateKid(kid.id, patch);
      load();
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (kid: KidRow) => {
    const ok = await confirm({
      title: 'Delete this kid?',
      message: `This permanently removes ${kid.label}'s record and payment history. This cannot be undone.`,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    setBusy(kid.id);
    try {
      await deleteKid(kid.id);
      await logKidActivity(kid.enquiry_id, 'Kid record removed', kid.label, kid.id);
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(kid.id);
        return next;
      });
      load();
    } finally {
      setBusy(null);
    }
  };

  return {
    selectedIds, toggleSelectOne, toggleSelectAll, clearSelection,
    busy,
    handleUpdateStatus, handleBulkStatus, handleSetFollowUp, handleToggleNoShow, handleEdit, handleDelete,
    ...payment,
  };
}
