// Full routed single-kid CRM page — same role AdminEnquiryDetail.tsx plays
// for an enquiry, just scoped to one kid. Was previously a modal
// (AdminKidDetailModal, still used nowhere now — see git history), opened
// from three different places (AdminEnquiryKidsCard, AdminKids' table/
// cards, AdminEnquiries' list rows). All three now navigate here instead,
// so a kid's detail view is bookmarkable/shareable/linkable the same way
// an enquiry's already is, rather than only reachable by first opening
// whichever list happened to render it.
//
// Deliberately reuses useKidsData/useKidsActions unchanged (the same pair
// AdminKids.tsx — the standalone list — already builds its whole page
// from) rather than a new enquiry-scoped fetch: those hooks already load
// every kid business-wide, joined with its parent enquiry's contact/trip
// fields (see kidsShared.ts's KidRow), so this page can never drift from
// what the list already shows for the same kid, and "find this one row"
// is all that's needed instead of a second data-fetching path.
import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Baby, Phone as PhoneIcon, EnvelopeSimple, Buildings as Building2,
  Briefcase, ForkKnife as Utensils, Cake, CurrencyInr as IndianRupee,
  CalendarDot as CalendarClock, UserMinus, ArrowsClockwise as RefreshCw,
  UserCheck, UserMinus as UserX, Trash as Trash2, Pencil,
} from '@phosphor-icons/react';
import AdminLayout from '../AdminLayout';
import Button from '../../components/ui/Button';
import Select from '../../components/ui/Select';
import DatePicker from '../../components/ui/DatePicker';
import ActionsMenu from '../../components/ui/ActionsMenu';
import type { ActionMenuItem } from '../../components/ui/ActionsMenu';
import { ContactQuickLinks } from '../../components/ui/DataTableChrome';
import { useKidsData } from './useKidsData';
import { useKidsActions } from './useKidsActions';
import AdminKidPaymentModal from '../enquiries/AdminKidPaymentModal';
import AdminKidNotInterestedModal from '../enquiries/AdminKidNotInterestedModal';
import type { ClosedReason, KidStatus } from '../../types/types-index';
import { FOOD_PREFERENCE_OPTIONS } from '../../constants/foodPreference';
import { formatPrice } from '../../utils/utils-index';
import {
  kidStatusBadge, KID_NO_SHOW_BADGE, canMarkKidNotInterested, canReopenKid,
  canMarkKidNoShow, kidNotInterestedReasonLabel, KID_STATUS_CONFIG,
} from '../enquiries/AdminEnquiryCommon';
import { kidFoodBadge, kidPaymentBadge } from './kidsShared';

// Labels pulled straight from KID_STATUS_CONFIG (AdminEnquiryCommon.ts) —
// this used to hardcode its own copy, which is how 'pending' ended up
// reading "Pending" here while the Enquiries list called the very same
// state "New Enquiry". One label per status, defined once.
const STATUS_OPTIONS: { value: KidStatus; label: string }[] = [
  { value: 'pending', label: KID_STATUS_CONFIG.pending.label },
  { value: 'contacted', label: KID_STATUS_CONFIG.contacted.label },
  { value: 'confirmed', label: KID_STATUS_CONFIG.confirmed.label },
  { value: 'checked_in', label: KID_STATUS_CONFIG.checked_in.label },
  { value: 'completed', label: KID_STATUS_CONFIG.completed.label },
  { value: 'cancelled', label: KID_STATUS_CONFIG.cancelled.label },
  { value: 'not_interested', label: KID_STATUS_CONFIG.not_interested.label },
];

export default function AdminKidDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { kidRows, getTripChildPrice, loading, load } = useKidsData();
  const {
    busy,
    handleUpdateStatus, handleSetFollowUp, handleToggleNoShow, handleEdit, handleDelete,
    kidPaymentTarget, kidPaymentForm, setKidPaymentForm, kidPaymentChildPrice, savingKidPayment,
    kidPaymentHistory, kidPaymentHistoryLoading, openKidPayment, handleSaveKidPayment, setKidPaymentTarget,
  } = useKidsActions(kidRows, load, getTripChildPrice);

  const kid = kidRows.find(k => k.id === id) ?? null;
  const isBusy = !!kid && busy === kid.id;

  // Editable Name/Age/Food fields — same reset-on-open pattern
  // AdminKidDetailModal used, just keyed off the route's kid loading in
  // rather than a modal's isOpen/kid props.
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [foodPreference, setFoodPreference] = useState<'' | 'veg' | 'non_veg'>('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpNotes, setFollowUpNotes] = useState('');

  useEffect(() => {
    if (!kid) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing local editable fields to the just-loaded (or just-changed) kid record, not an external system
    setName(kid.name ?? '');
    setAge(kid.age != null ? String(kid.age) : '');
    setFoodPreference(kid.food_preference === 'veg' || kid.food_preference === 'non_veg' ? kid.food_preference : '');
    setFollowUpDate(kid.follow_up_at ?? '');
    setFollowUpNotes(kid.follow_up_notes ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-sync when the identity of the loaded kid or its own stored values change, not on every kidRows re-render
  }, [kid?.id, kid?.name, kid?.age, kid?.food_preference, kid?.follow_up_at, kid?.follow_up_notes]);

  // Not Interested reason picker — same local wiring as
  // AdminEnquiryKidsCard's own kidNotInterestedTarget/kidClosedReason,
  // just always scoped to this page's one kid.
  const [notInterestedOpen, setNotInterestedOpen] = useState(false);
  const [kidClosedReason, setKidClosedReason] = useState<ClosedReason>('no_response');
  const openNotInterestedModal = () => {
    setKidClosedReason('no_response');
    setNotInterestedOpen(true);
  };
  const handleConfirmNotInterested = async () => {
    if (!kid) return;
    await handleUpdateStatus(kid, 'not_interested', kidClosedReason);
    setNotInterestedOpen(false);
  };

  const handleSaveDetails = async () => {
    if (!kid) return;
    const trimmedName = name.trim();
    const parsedAge = age.trim() === '' ? null : Math.max(0, Math.min(17, Math.round(Number(age))));
    await handleEdit(kid, {
      name: trimmedName || null,
      age: parsedAge != null && Number.isNaN(parsedAge) ? null : parsedAge,
      food_preference: foodPreference || null,
    });
  };

  const handleSaveFollowUpClick = async () => {
    if (!kid) return;
    await handleSetFollowUp(kid, followUpDate || null, followUpNotes.trim() || null);
  };

  const handleDeleteClick = async () => {
    if (!kid) return;
    await handleDelete(kid);
    // handleDelete already confirmed and removed the row — nothing left to
    // show on this page for it, so head back to the list it was opened
    // from rather than lingering on a now-gone kid. There's no standalone
    // /admin/kids list page yet, so land back on Enquiries (where every
    // kid row actually lives today) instead of a dead route.
    navigate('/admin/enquiries');
  };

  if (loading) {
    return (
      <AdminLayout title="Kid Details">
        <div className="p-6 text-dark-muted text-sm">Loading…</div>
      </AdminLayout>
    );
  }

  if (!kid) {
    return (
      <AdminLayout title="Kid Details">
        <div className="p-6 space-y-3">
          <p className="text-dark-muted text-sm">This kid record couldn't be found — it may have been deleted.</p>
          <Button variant="primary" size="sm" onClick={() => navigate('/admin/enquiries')}>
            <ArrowLeft size={14} aria-hidden="true" /> Back to Enquiries
          </Button>
        </div>
      </AdminLayout>
    );
  }

  const statusBadge = kidStatusBadge(kid);
  const foodBadge = kidFoodBadge(kid);
  const paymentBadge = kidPaymentBadge(kid);
  const reasonLabel = kidNotInterestedReasonLabel(kid);

  const rowActions: ActionMenuItem[] = [];
  if (kid.status !== 'confirmed') {
    rowActions.push({ label: 'Mark Confirmed', icon: kidStatusBadge({ ...kid, status: 'confirmed' }).icon, onClick: () => handleUpdateStatus(kid, 'confirmed') });
  }
  if (kid.status !== 'checked_in') {
    rowActions.push({ label: 'Mark Checked In', icon: kidStatusBadge({ ...kid, status: 'checked_in' }).icon, onClick: () => handleUpdateStatus(kid, 'checked_in') });
  }
  if (kid.status !== 'completed') {
    rowActions.push({ label: 'Mark Completed', icon: kidStatusBadge({ ...kid, status: 'completed' }).icon, onClick: () => handleUpdateStatus(kid, 'completed') });
  }
  if (kid.status !== 'pending') {
    rowActions.push({ label: 'Mark Pending', icon: kidStatusBadge({ ...kid, status: 'pending' }).icon, onClick: () => handleUpdateStatus(kid, 'pending') });
  }
  if (kid.status !== 'cancelled') {
    rowActions.push({ label: 'Mark Cancelled', icon: kidStatusBadge({ ...kid, status: 'cancelled' }).icon, danger: true, onClick: () => handleUpdateStatus(kid, 'cancelled') });
  }
  rowActions.push({ label: 'Delete', icon: Trash2, danger: true, onClick: handleDeleteClick });

  return (
    <AdminLayout title="Kid Details" subtitle={kid.label}>
      <div className="max-w-7xl mx-auto space-y-4">
        <button
          onClick={() => navigate('/admin/enquiries')}
          className="inline-flex items-center gap-1.5 text-sm font-button font-medium text-dark-muted hover:text-primary transition-colors"
        >
          <ArrowLeft size={15} aria-hidden="true" /> Back to Enquiries
        </button>

        {/* Same "record + fixed-context sidebar" split AdminEnquiryDetail
            uses, just with a lot less in the main column — a kid has no
            journey stepper or invoice ledger of its own, only its status/
            details/follow-up/payment. */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          <div className="lg:col-span-2 space-y-4 min-w-0">

            {/* Header */}
            <div className="bg-white rounded-lg shadow-card p-4 sm:p-5 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-display text-xl font-bold text-dark truncate flex items-center gap-2">
                    <Baby size={18} className="text-amber-700 shrink-0" aria-hidden="true" /> {kid.label}
                  </h2>
                  <div className="flex items-center flex-wrap gap-1.5 mt-1.5">
                    <span className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap ${statusBadge.color}`}>
                      <statusBadge.icon size={12} className="shrink-0" aria-hidden="true" /> {statusBadge.label}
                    </span>
                    {foodBadge.key !== 'not_set' && (
                      <span className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap ${foodBadge.color}`}>
                        <Utensils size={12} className="shrink-0" aria-hidden="true" /> {foodBadge.label}
                      </span>
                    )}
                    {kid.is_no_show && (
                      <span className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap ${KID_NO_SHOW_BADGE.color}`}>
                        <KID_NO_SHOW_BADGE.icon size={12} className="shrink-0" aria-hidden="true" /> {KID_NO_SHOW_BADGE.label}
                      </span>
                    )}
                    {kid.status === 'not_interested' && reasonLabel && (
                      <span className="inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap bg-slate-200 text-dark-muted">
                        <UserMinus size={12} className="shrink-0" aria-hidden="true" /> {reasonLabel}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {canMarkKidNotInterested(kid) && (
                    <Button variant="outline" size="sm" onClick={openNotInterestedModal} disabled={isBusy}>
                      <UserMinus size={13} aria-hidden="true" /> Not Interested
                    </Button>
                  )}
                  {canReopenKid(kid) && (
                    <Button variant="outline" size="sm" onClick={() => handleUpdateStatus(kid, 'pending')} disabled={isBusy}>
                      <RefreshCw size={13} aria-hidden="true" /> Reopen
                    </Button>
                  )}
                  {kid.is_no_show ? (
                    <Button variant="outline" size="sm" onClick={() => handleToggleNoShow(kid, false)} disabled={isBusy}>
                      <UserCheck size={13} aria-hidden="true" /> Undo No Show
                    </Button>
                  ) : canMarkKidNoShow(kid) && (
                    <Button variant="outline" size="sm" onClick={() => handleToggleNoShow(kid, true)} disabled={isBusy}>
                      <UserX size={13} aria-hidden="true" /> Mark No Show
                    </Button>
                  )}
                  <ActionsMenu items={rowActions} />
                </div>
              </div>

              <p className="text-dark-muted text-xs flex items-center gap-1.5 pt-1 border-t border-background-warm">
                <Baby size={13} className="shrink-0" aria-hidden="true" /> Kid record — independent of the parent enquiry's own status/follow-up.
              </p>
            </div>

            {/* Editable details */}
            <div className="bg-white rounded-lg shadow-card p-4 sm:p-5 space-y-4">
              <p className="text-dark text-sm font-button font-semibold flex items-center gap-1.5">
                <Pencil size={14} aria-hidden="true" /> Name / Age / Food Preference
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="kid-detail-name" className="block text-sm font-medium text-dark mb-1">Name</label>
                  <input
                    id="kid-detail-name"
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Optional"
                    className="w-full px-3 py-2 rounded-md border border-background-warm focus:border-primary focus:outline-none text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="kid-detail-age" className="block text-sm font-medium text-dark mb-1">Age</label>
                  <input
                    id="kid-detail-age"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={17}
                    value={age}
                    onChange={e => setAge(e.target.value)}
                    placeholder="Optional"
                    className="w-full px-3 py-2 rounded-md border border-background-warm focus:border-primary focus:outline-none text-sm"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="kid-detail-food" className="block text-sm font-medium text-dark mb-1">Food Preference</label>
                <Select
                  inputId="kid-detail-food"
                  value={foodPreference}
                  onChange={v => setFoodPreference(v as '' | 'veg' | 'non_veg')}
                  options={FOOD_PREFERENCE_OPTIONS}
                  size="md"
                />
              </div>
              <Button variant="outline" size="sm" onClick={handleSaveDetails} loading={isBusy}>Save Details</Button>
            </div>

            {/* Status */}
            <div className="bg-white rounded-lg shadow-card p-4 sm:p-5 space-y-3">
              <label htmlFor="kid-detail-status" className="block text-sm font-medium text-dark">Status</label>
              <Select
                inputId="kid-detail-status"
                value={kid.status}
                onChange={v => handleUpdateStatus(kid, v as KidStatus)}
                options={STATUS_OPTIONS}
                size="md"
              />
            </div>

            {/* Follow-up — only meaningful while pending, same gating the
                modal and Kids card both already follow. */}
            {kid.status === 'pending' && (
              <div className="bg-white rounded-lg shadow-card p-4 sm:p-5 space-y-3">
                <p className="text-dark text-sm font-button font-semibold flex items-center gap-1.5">
                  <CalendarClock size={14} aria-hidden="true" /> Follow-up
                </p>
                <div>
                  <label htmlFor="kid-detail-followup-date" className="block text-sm font-medium text-dark mb-1">Follow-up Date</label>
                  <DatePicker id="kid-detail-followup-date" value={followUpDate} onChange={setFollowUpDate} />
                </div>
                <div>
                  <label htmlFor="kid-detail-followup-notes" className="block text-sm font-medium text-dark mb-1">Notes (Optional)</label>
                  <textarea
                    id="kid-detail-followup-notes"
                    value={followUpNotes}
                    onChange={e => setFollowUpNotes(e.target.value)}
                    rows={2}
                    placeholder="e.g. need birth certificate copy before departure"
                    className="w-full px-3 py-2 rounded-md border border-background-warm focus:border-primary focus:outline-none text-sm resize-none"
                  />
                </div>
                <Button variant="outline" size="sm" onClick={handleSaveFollowUpClick} loading={isBusy}>
                  {followUpDate ? 'Save Follow-up' : 'Clear Follow-up'}
                </Button>
              </div>
            )}
          </div>

          {/* Sidebar — parent booking's contact/trip info this kid has no
              copy of its own (see KidRow in kidsShared.ts), plus this
              kid's own fee. */}
          <div className="lg:col-span-1 space-y-4 min-w-0">
            <div className="bg-white rounded-lg shadow-card p-4 sm:p-5">
              <p className="text-dark text-base font-display font-bold mb-4 flex items-center gap-2">
                <Baby size={18} className="shrink-0 text-dark-muted" aria-hidden="true" /> Parent Booking &amp; Trip
              </p>

              <div className="grid grid-cols-2 gap-x-3 gap-y-3 pb-4 border-b border-background-warm">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
                    <PhoneIcon size={15} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-dark-muted text-xs">Phone</p>
                    <p className="text-dark text-sm font-semibold truncate">{kid.phone}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
                    <EnvelopeSimple size={15} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-dark-muted text-xs">Email</p>
                    <p className="text-dark text-sm font-semibold truncate">{kid.email}</p>
                  </div>
                </div>
                <div className="col-span-2 mt-1">
                  <ContactQuickLinks phone={kid.phone} email={kid.email} name={kid.parentName} tripTitle={kid.tripTitle} size="md" />
                </div>
              </div>

              <div className="divide-y divide-background-warm">
                <div className="grid grid-cols-2 gap-x-3 gap-y-3 py-4">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
                      <Briefcase size={15} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-dark-muted text-xs">Trip</p>
                      <p className="text-dark text-sm font-semibold truncate">{kid.tripTitle || <span className="text-dark-muted italic font-normal">—</span>}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
                      <Cake size={15} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-dark-muted text-xs">Age</p>
                      <p className="text-dark text-sm font-semibold truncate">{kid.age ?? '—'}</p>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-3 py-4">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
                      <Building2 size={15} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-dark-muted text-xs">City</p>
                      <p className="text-dark text-sm font-semibold truncate">{kid.city || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
                      <Utensils size={15} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-dark-muted text-xs">Food Preference</p>
                      <p className={`text-sm font-semibold truncate ${foodBadge.key === 'veg' ? 'text-green-700' : foodBadge.key === 'non_veg' ? 'text-red-700' : 'text-dark-muted'}`}>{foodBadge.label}</p>
                    </div>
                  </div>
                </div>
              </div>

              {kid.bookingId && (
                <div className="pt-3 border-t border-background-warm">
                  <Link
                    to={`/admin/enquiries/${kid.enquiry_id}`}
                    className="text-primary text-sm font-button font-semibold hover:underline"
                  >
                    View Parent Enquiry ({kid.bookingId}) →
                  </Link>
                </div>
              )}
            </div>

            {/* Payment */}
            <div className="bg-white rounded-lg shadow-card p-4 sm:p-5 space-y-3">
              <p className="text-dark text-sm font-button font-semibold flex items-center gap-1.5">
                <IndianRupee size={14} aria-hidden="true" /> Payment
              </p>
              <button
                type="button"
                onClick={() => openKidPayment(kid, kid.tripId)}
                className="w-full text-left bg-background-warm rounded-md px-3 py-2 flex items-center gap-2.5 hover:opacity-75 transition-opacity"
              >
                <IndianRupee size={14} className="text-dark-muted shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-dark-muted text-[10px]">This kid's own total / paid — independent of the rest of the booking</p>
                  <p className="text-dark text-xs truncate">
                    {kid.amount ? `${formatPrice(kid.amount_paid || 0)} / ${formatPrice(kid.amount)}` : 'No total set yet'}
                  </p>
                </div>
                <span className={`shrink-0 inline-flex items-center gap-1 text-[11px] font-button font-semibold px-2 py-0.5 rounded-md whitespace-nowrap ${paymentBadge.color}`}>
                  <paymentBadge.icon size={11} className="shrink-0" aria-hidden="true" /> {paymentBadge.label}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <AdminKidPaymentModal
        kidPaymentTarget={kidPaymentTarget}
        fallbackLabel={kid.label}
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
        kidNotInterestedTarget={notInterestedOpen ? kid : null}
        targetLabel={kid.label}
        onClose={() => setNotInterestedOpen(false)}
        closedReason={kidClosedReason}
        setClosedReason={setKidClosedReason}
        onConfirm={handleConfirmNotInterested}
        updating={busy}
      />
    </AdminLayout>
  );
}
