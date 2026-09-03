// Kids card — split out of AdminEnquiryDetail.tsx. Each kid on this
// booking gets its own genuinely-trackable row here (own status, own
// follow-up), selectable via
// checkbox for a bulk status change — rather than the header's "N Kids"
// badge being the only trace of them (see Kid in types-index.ts and
// add_kids_table.sql).
//
// The one-click "Not Interested"/"Reopen" quick actions on each row (below)
// mirror AdminEnquiryHeaderCard's own canMarkNotInterested/Reopen Enquiry
// pair — before this, the only way to mark a kid Not Interested/Cancelled
// (or undo it) was three steps deep (open the row -> open the modal ->
// find the Status dropdown), while the adult side got single visible
// buttons for both directions. Kids never had that gating logic to begin
// with (see add_kids_not_interested_status.sql), so Not Interested is
// offered unconditionally whenever the kid isn't already in a closed-out
// state.
import { useState } from 'react';
import {
  Baby, CheckSquare, Square, CalendarDot as CalendarClock, CurrencyInr as IndianRupee,
  UserMinus, ArrowsClockwise as RefreshCw, CheckCircle as CheckCircle2, Pencil,
  SignIn as LogIn, Clock, XCircle, Trash as Trash2, Confetti as PartyPopper,
  UserCheck, UserMinus as UserX,
} from '@phosphor-icons/react';
import Button from '../../components/ui/Button';
import Select from '../../components/ui/Select';
import ActionsMenu, { type ActionMenuItem } from '../../components/ui/ActionsMenu';
import type { ClosedReason, Enquiry, Kid, KidStatus } from '../../types/types-index';
import { formatDate, formatPrice } from '../../utils/utils-index';
import { useKidsForEnquiry } from './useKidsForEnquiry';
import { useKidPayment } from './useKidPayment';
import AdminKidPaymentModal from './AdminKidPaymentModal';
import AdminKidNotInterestedModal from './AdminKidNotInterestedModal';
import AdminKidEditModal, { kidEditFormFromKid, type KidEditForm } from './AdminKidEditModal';
import FoodMark from '../../components/ui/FoodMark';
import { canMarkKidNotInterested, canReopenKid, canMarkKidNoShow, KID_NO_SHOW_BADGE, KID_STATUS_CONFIG } from './AdminEnquiryCommon';

// Badge color/label used to come from a local STATUS_BADGE/STATUS_LABEL map
// here that had drifted from the Enquiries list's own KID_STATUS_CONFIG
// (AdminEnquiryCommon.ts) — two sources of truth for the same badge meant a
// kid's status could read differently on this detail-page card than it did
// on the list. Reading directly off KID_STATUS_CONFIG keeps this card and
// the list in permanent lockstep.
const BULK_STATUS_OPTIONS: { value: KidStatus; label: string }[] = [
  { value: 'contacted', label: `Mark ${KID_STATUS_CONFIG.contacted.label}` },
  { value: 'confirmed', label: 'Mark Confirmed' },
  { value: 'checked_in', label: 'Mark Checked In' },
  { value: 'completed', label: 'Mark Completed' },
  { value: 'cancelled', label: 'Mark Cancelled' },
  { value: 'not_interested', label: 'Mark Not Interested' },
  { value: 'pending', label: `Mark ${KID_STATUS_CONFIG.pending.label}` },
];

interface AdminEnquiryKidsCardProps {
  enquiry: Enquiry;
  /** Looks up the trip's flat per-kid fee (upcoming_trips.child_price) — same function AdminEnquiryDetail.tsx already builds for the adult modal's Kids Fee section, threaded through so the per-kid Payment modal's Total is sourced from the same place. */
  getTripChildPrice: (tripId: string | undefined) => number | undefined;
}

export default function AdminEnquiryKidsCard({ enquiry, getTripChildPrice }: AdminEnquiryKidsCardProps) {
  const {
    kids, loading, busy,
    selectedIds, toggleSelectOne, toggleSelectAll,
    kidLabel,
    handleUpdateStatus, handleBulkStatus, handleToggleNoShow, handleEdit, handleDelete,
    reload,
  } = useKidsForEnquiry(enquiry.id);
  const {
    kidPaymentTarget, kidPaymentForm, setKidPaymentForm, kidPaymentChildPrice, savingKidPayment,
    kidPaymentHistory, kidPaymentHistoryLoading, openKidPayment, handleSaveKidPayment,
    setKidPaymentTarget,
  } = useKidPayment({ onSaved: () => { reload(); }, getTripChildPrice });
  const [bulkAction, setBulkAction] = useState<KidStatus>('confirmed');
  // Not Interested reason picker — mirrors AdminEnquiries.tsx's own
  // kidNotInterestedTarget/kidClosedReason state, just scoped to this
  // card. See AdminKidNotInterestedModal.tsx.
  const [kidNotInterestedTarget, setKidNotInterestedTarget] = useState<Kid | null>(null);
  const [kidClosedReason, setKidClosedReason] = useState<ClosedReason>('no_response');
  const openKidNotInterestedModal = (kid: Kid) => {
    setKidClosedReason('no_response');
    setKidNotInterestedTarget(kid);
  };
  const handleConfirmKidNotInterested = async () => {
    if (!kidNotInterestedTarget) return;
    await handleUpdateStatus(kidNotInterestedTarget, 'not_interested', kidClosedReason);
    setKidNotInterestedTarget(null);
  };

  // Edit Details modal — name/age/food_preference, the only fields a kid
  // has of its own to fix up. Mirrors the Not Interested picker's own
  // local wiring just above; see AdminKidEditModal.tsx.
  const [kidEditTarget, setKidEditTarget] = useState<Kid | null>(null);
  const [kidEditForm, setKidEditForm] = useState<KidEditForm>({ name: '', age: '', food_preference: '' });
  const openKidEditModal = (kid: Kid) => {
    setKidEditForm(kidEditFormFromKid(kid));
    setKidEditTarget(kid);
  };
  const handleSaveKidEdit = async () => {
    if (!kidEditTarget) return;
    await handleEdit(kidEditTarget, {
      name: kidEditForm.name.trim() || null,
      age: kidEditForm.age === '' ? null : kidEditForm.age,
      food_preference: kidEditForm.food_preference || null,
    });
    setKidEditTarget(null);
  };

  // Kebab menu per kid — mirrors the adult side's useRowActions.ts: the
  // row itself keeps its one-click quick actions (Not Interested/Reopen,
  // tap-to-open payment/detail), and this menu adds everything else that
  // used to only be reachable three steps deep inside the detail modal's
  // own Status dropdown (Edit Details, Manage Payment, the other status
  // jumps, Delete) — same "consolidate the scattered actions into one ⋮"
  // treatment as AdminEnquiriesDesktopTable's row menu.
  const buildKidActions = (kid: Kid): ActionMenuItem[] => {
    const items: ActionMenuItem[] = [
      { label: 'Edit Details', icon: Pencil, onClick: () => openKidEditModal(kid) },
      { label: 'Manage Payment', icon: IndianRupee, onClick: () => openKidPayment(kid, enquiry.trip_id) },
    ];
    if (kid.status !== 'confirmed') {
      items.push({ label: 'Mark Confirmed', icon: CheckCircle2, onClick: () => handleUpdateStatus(kid, 'confirmed') });
    }
    if (kid.status !== 'checked_in') {
      items.push({ label: 'Mark Checked In', icon: LogIn, onClick: () => handleUpdateStatus(kid, 'checked_in') });
    }
    if (kid.status !== 'completed') {
      items.push({ label: 'Mark Completed', icon: PartyPopper, onClick: () => handleUpdateStatus(kid, 'completed') });
    }
    if (kid.status !== 'pending') {
      items.push({ label: 'Mark Pending', icon: Clock, onClick: () => handleUpdateStatus(kid, 'pending') });
    }
    if (kid.status !== 'cancelled') {
      items.push({ label: 'Mark Cancelled', icon: XCircle, danger: true, onClick: () => handleUpdateStatus(kid, 'cancelled') });
    }
    if (canMarkKidNotInterested(kid)) {
      items.push({ label: 'Not Interested', icon: UserMinus, onClick: () => openKidNotInterestedModal(kid) });
    }
    if (canReopenKid(kid)) {
      items.push({ label: 'Reopen', icon: RefreshCw, onClick: () => handleUpdateStatus(kid, 'pending') });
    }
    // Independent attendance flag, same "Mark/Undo No Show" pair the adult
    // side offers — see canMarkKidNoShow.
    if (kid.is_no_show) {
      items.push({ label: 'Undo No Show', icon: UserCheck, onClick: () => handleToggleNoShow(kid, false) });
    } else if (canMarkKidNoShow(kid)) {
      items.push({ label: 'Mark No Show', icon: UserX, onClick: () => handleToggleNoShow(kid, true) });
    }
    items.push({ label: 'Delete', icon: Trash2, danger: true, onClick: () => handleDelete(kid) });
    return items;
  };

  // Only meaningful on the booking's own kids — no rows yet just means
  // either this booking has no kids, or (a rare race) the seed insert
  // that runs alongside enquiry creation hasn't landed yet.
  if (!loading && kids.length === 0 && enquiry.kids_count === 0) return null;

  const allSelected = kids.length > 0 && kids.every(k => selectedIds.has(k.id));

  return (
    <div className="bg-white rounded-lg shadow-card p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-dark text-sm font-button font-semibold flex items-center gap-1.5">
          <Baby size={15} className="text-amber-700" aria-hidden="true" /> Kids ({kids.length || enquiry.kids_count})
        </p>
        {kids.length > 0 && (
          <button
            type="button"
            onClick={toggleSelectAll}
            className="text-xs font-button font-medium text-dark-muted hover:text-primary flex items-center gap-1"
          >
            {allSelected ? <CheckSquare size={14} aria-hidden="true" /> : <Square size={14} aria-hidden="true" />}
            Select all
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-dark-muted text-xs">Loading…</p>
      ) : (
        <div className="space-y-2">
          {kids.map((kid, i) => {
            const selected = selectedIds.has(kid.id);
            return (
              <div
                key={kid.id}
                className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 border flex-wrap ${selected ? 'border-primary bg-primary/5' : 'border-background-warm'}`}
              >
                <button
                  type="button"
                  onClick={() => toggleSelectOne(kid.id)}
                  aria-label={selected ? `Deselect ${kidLabel(kid, i)}` : `Select ${kidLabel(kid, i)}`}
                  className="shrink-0 text-dark-muted hover:text-primary"
                >
                  {selected ? <CheckSquare size={16} className="text-primary" aria-hidden="true" /> : <Square size={16} aria-hidden="true" />}
                </button>
                <button
                  type="button"
                  onClick={() => openKidEditModal(kid)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="text-dark text-sm font-medium truncate flex items-center gap-1.5">
                    {kidLabel(kid, i)}
                    {(kid.food_preference === 'veg' || kid.food_preference === 'non_veg') && (
                      <FoodMark
                        type={kid.food_preference}
                        size={11}
                        className={kid.food_preference === 'veg' ? 'text-green-700 shrink-0' : 'text-red-700 shrink-0'}
                      />
                    )}
                  </p>
                  {kid.follow_up_at && kid.status === 'pending' && (
                    <p className="text-amber-700 text-[11px] flex items-center gap-1 mt-0.5">
                      <CalendarClock size={11} aria-hidden="true" /> Follow up {formatDate(kid.follow_up_at, { day: 'numeric', month: 'short' })}
                    </p>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => openKidPayment(kid, enquiry.trip_id)}
                  title={`${kidLabel(kid, i)}'s own payment — independent of every other kid on this booking`}
                  className="shrink-0 flex items-center gap-1 text-[11px] font-button font-medium text-dark-muted hover:text-primary whitespace-nowrap"
                >
                  <IndianRupee size={12} aria-hidden="true" />
                  {kid.amount ? `${formatPrice(kid.amount_paid || 0)} / ${formatPrice(kid.amount)}` : 'Set fee'}
                </button>
                <span className={`text-[11px] font-button font-semibold px-2 py-0.5 rounded-md whitespace-nowrap ${KID_STATUS_CONFIG[kid.status].color}`}>
                  {KID_STATUS_CONFIG[kid.status].label}
                </span>
                {kid.is_no_show && (
                  <span className={`text-[11px] font-button font-semibold px-2 py-0.5 rounded-md whitespace-nowrap ${KID_NO_SHOW_BADGE.color}`}>
                    {KID_NO_SHOW_BADGE.label}
                  </span>
                )}
                {/* One-click quick action — same "Not Interested" button
                    AdminEnquiryHeaderCard shows for the adult booking,
                    brought down to each individual kid so it doesn't take
                    opening the modal's Status dropdown to reach. */}
                {canMarkKidNotInterested(kid) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openKidNotInterestedModal(kid)}
                    disabled={busy}
                    className="!px-2 !py-1 !gap-1 text-[11px] whitespace-nowrap shrink-0"
                  >
                    <UserMinus size={12} aria-hidden="true" /> Not Interested
                  </Button>
                )}
                {/* Counterpart to the button above — undoes a Not
                    Interested marking the same one-click way it was set,
                    mirroring the adult side's Reopen Enquiry action. */}
                {canReopenKid(kid) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleUpdateStatus(kid, 'pending')}
                    disabled={busy}
                    className="!px-2 !py-1 !gap-1 text-[11px] whitespace-nowrap shrink-0"
                  >
                    <RefreshCw size={12} aria-hidden="true" /> Reopen
                  </Button>
                )}
                <ActionsMenu
                  items={buildKidActions(kid)}
                  disabled={busy}
                  label={`${kidLabel(kid, i)} actions`}
                />
              </div>
            );
          })}
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 pt-2 border-t border-background-warm">
          <span className="text-xs text-dark-muted whitespace-nowrap">{selectedIds.size} selected</span>
          <div className="flex-1 min-w-0">
            <Select value={bulkAction} onChange={v => setBulkAction(v as KidStatus)} options={BULK_STATUS_OPTIONS} size="sm" />
          </div>
          <Button variant="outline" size="sm" onClick={() => handleBulkStatus(bulkAction)} disabled={busy}>Apply</Button>
        </div>
      )}

      <AdminKidPaymentModal
        kidPaymentTarget={kidPaymentTarget}
        fallbackLabel={kidPaymentTarget ? kidLabel(kidPaymentTarget, kids.indexOf(kidPaymentTarget)) : ''}
        onClose={() => setKidPaymentTarget(null)}
        kidPaymentForm={kidPaymentForm}
        setKidPaymentForm={setKidPaymentForm}
        kidPaymentChildPrice={kidPaymentChildPrice}
        kidPaymentHistory={kidPaymentHistory}
        kidPaymentHistoryLoading={kidPaymentHistoryLoading}
        savingKidPayment={savingKidPayment}
        onSave={handleSaveKidPayment}
      />

      <AdminKidNotInterestedModal
        kidNotInterestedTarget={kidNotInterestedTarget}
        targetLabel={kidNotInterestedTarget ? kidLabel(kidNotInterestedTarget, kids.indexOf(kidNotInterestedTarget)) : ''}
        onClose={() => setKidNotInterestedTarget(null)}
        closedReason={kidClosedReason}
        setClosedReason={setKidClosedReason}
        onConfirm={handleConfirmKidNotInterested}
        updating={busy && kidNotInterestedTarget ? kidNotInterestedTarget.id : null}
      />

      <AdminKidEditModal
        kidEditTarget={kidEditTarget}
        targetLabel={kidEditTarget ? kidLabel(kidEditTarget, kids.indexOf(kidEditTarget)) : ''}
        onClose={() => setKidEditTarget(null)}
        editForm={kidEditForm}
        setEditForm={setKidEditForm}
        onSave={handleSaveKidEdit}
        saving={busy}
      />
    </div>
  );
}
