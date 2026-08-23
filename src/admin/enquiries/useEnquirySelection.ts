import { useState, useMemo } from 'react';
import type { Enquiry } from '../../types/types-index';

/** Owns the bulk-selection checkbox state for the enquiries table/cards —
 *  which row ids are checked, the derived "is this a safe bulk-edit
 *  selection" checks (all selected rows sharing one trip), and the toggle
 *  handlers the checkboxes call. Also clears the selection whenever the
 *  admin switches which trip group they're viewing, since the checkboxes
 *  only ever reflect what's currently on screen.
 *
 *  Deliberately does NOT own the bulk-edit/bulk-delete actions themselves
 *  (openBulkEdit, handleBulkSave, handleBulkDelete, and the bulkForm/
 *  bulkSaving/bulkDeleting state) — those become useEnquiryBulkActions in a
 *  later extraction. They keep calling this hook's `setSelectedIds` to
 *  clear the selection once a bulk action completes.
 *
 *  Extracted from AdminEnquiries.tsx (see that file's history for the
 *  original single-component version). */
export function useEnquirySelection(enquiries: Enquiry[], selectedTripKey: string | null) {
  // Selection is keyed by enquiry id.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Bulk Edit writes pricing fields (total_amount/amount_paid) as one flat
  // value across every selected row — safe only when they all belong to
  // the same trip (different trips have different prices). Group members
  // share trip_id by construction, so this is really just guarding against
  // a mixed selection made while the Trip filter is "All". Null trip_id
  // (general enquiries) still counts as its own bucket so a mix of
  // trip-linked and general enquiries is caught too.
  const selectedTripIds = useMemo(
    () => new Set(enquiries.filter(e => selectedIds.has(e.id)).map(e => e.trip_id ?? 'none')),
    [enquiries, selectedIds]
  );
  const bulkEditAllowed = selectedTripIds.size <= 1;
  // trip_title is snapshotted directly on each enquiry row at submit time
  // (see submitEnquiry/createManualEnquiry in api.ts), so it's available
  // here without needing to cross-reference the trips list — which only
  // covers upcoming trips anyway, not completed ones.
  const selectedTripName = useMemo(() => {
    if (selectedTripIds.size !== 1) return null;
    const selected = enquiries.find(e => selectedIds.has(e.id));
    return selected?.trip_id ? selected.trip_title || 'Untitled trip' : 'General enquiry (no trip)';
  }, [enquiries, selectedIds, selectedTripIds]);

  // Selection is intentionally cleared whenever the admin drills into a
  // different trip group, since the checkboxes only ever reflect what's
  // currently on screen.
  const [prevSelectedTripKey, setPrevSelectedTripKey] = useState(selectedTripKey);
  if (selectedTripKey !== prevSelectedTripKey) {
    setPrevSelectedTripKey(selectedTripKey);
    setSelectedIds(new Set());
  }

  const toggleSelectOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Takes the currently-visible (paginated) rows as an argument each time
  // it's called, rather than owning that derived list itself — it depends
  // on filtering/sorting/pagination computed elsewhere in AdminEnquiries.tsx.
  const toggleSelectAllFiltered = (paginatedEnquiries: Enquiry[]) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      const allSelected = paginatedEnquiries.length > 0 && paginatedEnquiries.every(e => next.has(e.id));
      if (allSelected) {
        paginatedEnquiries.forEach(e => next.delete(e.id));
      } else {
        paginatedEnquiries.forEach(e => next.add(e.id));
      }
      return next;
    });
  };

  return {
    selectedIds, setSelectedIds,
    selectedTripIds, bulkEditAllowed, selectedTripName,
    toggleSelectOne, toggleSelectAllFiltered,
  };
}
