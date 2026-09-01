// Kids card — split out of AdminEnquiryDetail.tsx. Each kid on this
// booking gets its own genuinely-trackable row here (own status, own
// follow-up, its own detail view via AdminKidDetailModal), selectable via
// checkbox for a bulk status change — rather than the header's "N Kids"
// badge being the only trace of them (see Kid in types-index.ts and
// add_kids_table.sql).
import { useState } from 'react';
import { Baby, CheckSquare, Square, CalendarDot as CalendarClock } from '@phosphor-icons/react';
import Button from '../../components/ui/Button';
import Select from '../../components/ui/Select';
import type { Enquiry, Kid, KidStatus } from '../../types/types-index';
import { formatDate } from '../../utils/utils-index';
import { useKidsForEnquiry } from './useKidsForEnquiry';
import AdminKidDetailModal from './AdminKidDetailModal';
import FoodMark from '../../components/ui/FoodMark';

const STATUS_BADGE: Record<KidStatus, string> = {
  pending: 'bg-amber-50 text-amber-700',
  confirmed: 'bg-green-50 text-green-700',
  checked_in: 'bg-blue-50 text-blue-700',
  cancelled: 'bg-red-50 text-red-700',
};

const STATUS_LABEL: Record<KidStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  checked_in: 'Checked In',
  cancelled: 'Cancelled',
};

const BULK_STATUS_OPTIONS: { value: KidStatus; label: string }[] = [
  { value: 'confirmed', label: 'Mark Confirmed' },
  { value: 'checked_in', label: 'Mark Checked In' },
  { value: 'cancelled', label: 'Mark Cancelled' },
  { value: 'pending', label: 'Mark Pending' },
];

interface AdminEnquiryKidsCardProps {
  enquiry: Enquiry;
}

export default function AdminEnquiryKidsCard({ enquiry }: AdminEnquiryKidsCardProps) {
  const {
    kids, loading, busy,
    selectedIds, toggleSelectOne, toggleSelectAll,
    kidLabel,
    handleUpdateStatus, handleBulkStatus, handleSetFollowUp, handleEdit, handleDelete,
  } = useKidsForEnquiry(enquiry.id);
  const [openKidId, setOpenKidId] = useState<string | null>(null);
  const [bulkAction, setBulkAction] = useState<KidStatus>('confirmed');

  // Only meaningful on the booking's own kids — no rows yet just means
  // either this booking has no kids, or (a rare race) the seed insert
  // that runs alongside enquiry creation hasn't landed yet.
  if (!loading && kids.length === 0 && enquiry.kids_count === 0) return null;

  const openKid = kids.find(k => k.id === openKidId) ?? null;
  const openKidIndex = openKid ? kids.indexOf(openKid) : -1;
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
                className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 border ${selected ? 'border-primary bg-primary/5' : 'border-background-warm'}`}
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
                  onClick={() => setOpenKidId(kid.id)}
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
                <span className={`text-[11px] font-button font-semibold px-2 py-0.5 rounded-md whitespace-nowrap ${STATUS_BADGE[kid.status]}`}>
                  {STATUS_LABEL[kid.status]}
                </span>
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

      <AdminKidDetailModal
        isOpen={!!openKid}
        onClose={() => setOpenKidId(null)}
        kid={openKid}
        fallbackLabel={openKid ? kidLabel(openKid, openKidIndex) : ''}
        busy={busy}
        onSave={patch => handleEdit(openKid as Kid, patch)}
        onStatusChange={status => handleUpdateStatus(openKid as Kid, status)}
        onFollowUpChange={(followUpAt, notes) => handleSetFollowUp(openKid as Kid, followUpAt, notes)}
        onDelete={() => handleDelete(openKid as Kid)}
      />
    </div>
  );
}
