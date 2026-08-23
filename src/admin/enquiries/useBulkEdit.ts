import { useState } from 'react';
import { updateEnquiryStatus, recordPayment, getAllUpcomingTripsAdmin, deleteEnquiry } from '../../services/api';
import type { Enquiry, UpcomingTrip } from '../../types/types-index';
import { BULK_NO_CHANGE, emptyBulkForm, validateBulkEditForm } from './AdminEnquiriesShared';
import type { BulkEditForm } from './AdminEnquiriesShared';
import { useConfirm } from '../../components/ui/useConfirm';
import { useAlert } from '../../components/ui/useAlert';

/** Owns bulk operations across the current selection: opening/editing the
 *  Bulk Edit modal's form, saving whichever fields were actually touched
 *  (status applied last, via the plain status-only endpoint, never through
 *  recordPayment), and deleting every selected enquiry.
 *
 *  `enquiries`/`selectedIds` are passed in rather than owned here since
 *  they're shared with useEnquirySelection and the rest of the table;
 *  `setSelectedIds` is called on success to clear the selection, same as
 *  the original inline implementation.
 *
 *  Extracted from AdminEnquiries.tsx (see that file's history for the
 *  original single-component version). */
export function useBulkEdit(params: {
  enquiries: Enquiry[];
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
  setTrips: (trips: UpcomingTrip[]) => void;
  load: () => void;
  showToast: (message: string) => void;
}) {
  const { enquiries, selectedIds, setSelectedIds, setTrips, load, showToast } = params;
  const confirm = useConfirm();
  const alert = useAlert();

  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState<BulkEditForm>(emptyBulkForm);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const openBulkEdit = () => {
    setBulkForm(emptyBulkForm);
    setBulkEditOpen(true);
  };

  // Applies whichever bulk-edit fields the admin actually touched (anything
  // still on "No change" is left alone) across every selected enquiry.
  // Status is applied last and via the plain status-only endpoint — never
  // through recordPayment — and never opens the Track Payment popup, no
  // matter how many of the selected rows move to Contacted.
  const handleBulkSave = async () => {
    const targets = enquiries.filter(e => selectedIds.has(e.id));
    if (targets.length === 0) return;

    // Same shared validator the modal uses live — this is the defense-in-
    // depth save-time gate, checked here up front so the DB's per-row CHECK
    // constraint never has to reject some rows partway through the loop
    // below (which would leave the batch half-applied with a confusing
    // generic error).
    const { touchesPaymentFields, hasChanges, overpaid } = validateBulkEditForm(bulkForm, targets);
    if (!hasChanges) {
      alert('Pick at least one field to change before saving — everything is still set to "No change".');
      return;
    }
    if (touchesPaymentFields && overpaid) {
      alert(`Amount paid can't exceed the total amount — this would overpay ${overpaid.full_name}. Adjust the amount or set a matching total amount for the selection.`);
      return;
    }

    setBulkSaving(true);
    try {
      // Sequential, not Promise.all — firing these concurrently for
      // enquiries on the same trip means each recordPayment's capacity
      // check can race against the others (each briefly sees a stale
      // seats_booked before the previous one commits). The DB-side lock in
      // enforce_trip_capacity makes that race safe now, but it'd still
      // mean these calls queue up waiting on each other anyway — doing it
      // one at a time here avoids that contention and gives a clean,
      // predictable order if one of them fails partway through.
      for (const enquiry of targets) {
        if (touchesPaymentFields) {
          await recordPayment(enquiry, {
            amount_paid: bulkForm.amount_paid !== '' ? Number(bulkForm.amount_paid) : enquiry.amount_paid,
            total_amount: bulkForm.total_amount !== '' ? Number(bulkForm.total_amount) : enquiry.total_amount,
            package_type: bulkForm.package_type !== BULK_NO_CHANGE ? bulkForm.package_type : enquiry.package_type,
            food_preference: bulkForm.food_preference !== BULK_NO_CHANGE
              ? (bulkForm.food_preference === 'not_set' ? null : bulkForm.food_preference)
              : (enquiry.food_preference === 'veg' || enquiry.food_preference === 'non_veg' ? enquiry.food_preference : null),
          });
        }
        if (bulkForm.status !== BULK_NO_CHANGE) {
          await updateEnquiryStatus(enquiry.id, bulkForm.status);
        }
      }
      setBulkEditOpen(false);
      setBulkForm(emptyBulkForm);
      setSelectedIds(new Set());
      const freshTrips = await getAllUpcomingTripsAdmin();
      setTrips(freshTrips);
      load();
      // Toast, not the blocking AlertDialog — this is just a confirmation,
      // not something that needs an "OK" click to dismiss. Otherwise a
      // successful save where the new value happens to match what most
      // rows already had (e.g. Package already Normal) looks identical to
      // nothing having happened at all, with no gentler way to say "done."
      showToast(`Updated ${targets.length} enquir${targets.length === 1 ? 'y' : 'ies'}.`);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to update some of the selected enquiries.');
    } finally {
      setBulkSaving(false);
    }
  };

  // Permanently removes every selected enquiry. Same underlying delete as
  // the single-row action, just fanned out across the selection.
  //
  // Sequential, not Promise.all — same reasoning as the bulk save above:
  // deleting multiple booked enquiries for the same trip each triggers a
  // seat release, and firing those concurrently means they'd race on
  // seats_booked. Rare in practice (the DB trigger handles it safely
  // either way), but there's no reason not to be consistent here too.
  const handleBulkDelete = async () => {
    const targets = enquiries.filter(e => selectedIds.has(e.id));
    if (targets.length === 0) return;
    const ok = await confirm({
      title: `Delete ${targets.length} enquir${targets.length === 1 ? 'y' : 'ies'}?`,
      message: 'This permanently removes the selected enquiries and their payment history. This cannot be undone.',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    setBulkDeleting(true);
    try {
      for (const e of targets) {
        await deleteEnquiry(e);
      }
      const tripIds = new Set(targets.map(e => e.trip_id).filter(Boolean));
      if (tripIds.size > 0) {
        const freshTrips = await getAllUpcomingTripsAdmin();
        setTrips(freshTrips);
      }
      setSelectedIds(new Set());
      load();
    } catch (err) {
      console.error(err);
      alert('Failed to delete some of the selected enquiries.');
    } finally {
      setBulkDeleting(false);
    }
  };

  return {
    bulkEditOpen, setBulkEditOpen,
    bulkForm, setBulkForm,
    bulkSaving,
    bulkDeleting,
    openBulkEdit,
    handleBulkSave,
    handleBulkDelete,
  };
}
