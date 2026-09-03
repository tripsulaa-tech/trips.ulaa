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
  UserMinus, ArrowsClockwise as RefreshCw, CalendarBlank as CalendarDays, Globe,
  UserCheck, UserMinus as UserX, Trash as Trash2, User, Pencil, Check, X,
} from '@phosphor-icons/react';
import AdminLayout from '../AdminLayout';
import Button from '../../components/ui/Button';
import Select from '../../components/ui/Select';
import ActionsMenu from '../../components/ui/ActionsMenu';
import type { ActionMenuItem } from '../../components/ui/ActionsMenu';
import { ContactQuickLinks } from '../../components/ui/DataTableChrome';
import { useKidsData } from './useKidsData';
import { useKidsActions } from './useKidsActions';
import AdminKidNotInterestedModal from '../enquiries/AdminKidNotInterestedModal';
import AdminKidContactOutcomeModal from '../enquiries/AdminKidContactOutcomeModal';
import type { KidContactOutcomeTarget, KidContactOutcomeResult } from '../enquiries/AdminKidContactOutcomeModal';
import { recordKidContactOutcome } from '../../services/api/enquiries/kids';
import AdminEnquiryActivityTimeline from '../enquiries/AdminEnquiryActivityTimeline';
import KidPaymentFormFields from '../enquiries/KidPaymentFormFields';
import { validateKidPaymentForm } from '../enquiries/useKidPayment';
import { getActivityLogForKid } from '../../services/api/enquiries/activity';
import { formatDate, formatTime } from '../../utils/utils-index';
import type { ActivityLogEntry, ClosedReason } from '../../types/types-index';
import { FOOD_PREFERENCE_OPTIONS } from '../../constants/foodPreference';
import {
  kidStatusBadge, KID_NO_SHOW_BADGE, canMarkKidNotInterested, canReopenKid,
  canMarkKidNoShow, kidNotInterestedReasonLabel, SOURCE_CONFIG,
} from '../enquiries/AdminEnquiryCommon';
import { kidFoodBadge, nextKidManualAction } from './kidsShared';

// Compact inline-input style — matches AdminEnquiryTravellerCard's own
// inlineInputClass so the kid page's edit-in-place fields look identical
// to the adult one, just scoped to the two fields (name/age/food) that
// actually belong to the kid record rather than the parent enquiry.
const inlineInputClass =
  'w-full px-2 py-1 rounded-md border-2 border-background-warm bg-white text-dark text-sm font-semibold focus:border-primary outline-none';

export default function AdminKidDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { kidRows, getTripChildPrice, loading, load } = useKidsData();

  // Own Activity Timeline (see add_kid_activity_log_scope.sql /
  // getActivityLogForKid) — a separate fetch from kidRows since it's a
  // different table, so every mutating action below needs to trigger both
  // reloads. `reloadAll` (passed to useKidsActions in place of the plain
  // `load`) does that in one place rather than threading a second reload
  // through every individual handler.
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const loadActivity = async () => {
    if (!id) return;
    setActivityLoading(true);
    try {
      setActivityLog(await getActivityLogForKid(id));
    } catch (err) {
      console.error('Failed to load kid activity log:', err);
    } finally {
      setActivityLoading(false);
    }
  };
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loadActivity() is an async fetch-on-mount/on-id-change, not a synchronous external-system sync
    loadActivity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const reloadAll = () => { load(); loadActivity(); };

  const {
    busy,
    handleUpdateStatus, handleToggleNoShow, handleEdit, handleDelete,
    kidPaymentTarget, kidPaymentForm, setKidPaymentForm, kidPaymentChildPrice, savingKidPayment,
    kidPaymentHistory, kidPaymentHistoryLoading, openKidPayment, handleSaveKidPayment,
  } = useKidsActions(kidRows, reloadAll, getTripChildPrice);

  const kid = kidRows.find(k => k.id === id) ?? null;
  const isBusy = !!kid && busy === kid.id;

  // Payment — rendered inline on this page instead of behind the popup
  // (AdminKidPaymentModal) every other kid-payment entry point still
  // opens, since this whole page is already scoped to one kid and a click
  // to reveal the fields it's about would be a step with no payoff here.
  // useKidPayment's kidPaymentTarget doubles as "which kid the form is
  // showing" even with no modal to open — this effect keeps it pointed at
  // the route's own kid at all times (on first load, and again right
  // after a save, when handleSaveKidPayment resets it to null and the
  // form should refill from the just-saved record rather than stay
  // cleared).
  useEffect(() => {
    if (kid && kidPaymentTarget?.id !== kid.id) openKidPayment(kid, kid.tripId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-open when the loaded kid's identity changes or the form's been reset (kidPaymentTarget cleared after save); openKidPayment/kid.tripId are stable in intent
  }, [kid?.id, kidPaymentTarget?.id]);
  const kidErrors = kid ? validateKidPaymentForm(kidPaymentForm, kid.amount_paid || 0) : {};
  const hasKidErrors = Object.keys(kidErrors).length > 0;

  // Name/Age/Food — edited in place inside the sidebar card, same
  // pencil-toggle-to-check/x pattern AdminEnquiryTravellerCard uses for
  // the adult's own fields, just scoped to the two/three fields that
  // actually belong to the kid record (Phone/Email/Trip/City below are
  // the parent enquiry's — never editable from here).
  const [editingDetails, setEditingDetails] = useState(false);
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [foodPreference, setFoodPreference] = useState<'' | 'veg' | 'non_veg'>('');

  useEffect(() => {
    if (!kid) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing local editable fields to the just-loaded (or just-changed) kid record, not an external system
    setName(kid.name ?? '');
    setAge(kid.age != null ? String(kid.age) : '');
    setFoodPreference(kid.food_preference === 'veg' || kid.food_preference === 'non_veg' ? kid.food_preference : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-sync when the identity of the loaded kid or its own stored values change, not on every kidRows re-render
  }, [kid?.id, kid?.name, kid?.age, kid?.food_preference]);

  const handleStartEditDetails = () => setEditingDetails(true);
  const handleCancelEditDetails = () => {
    if (!kid) return;
    setName(kid.name ?? '');
    setAge(kid.age != null ? String(kid.age) : '');
    setFoodPreference(kid.food_preference === 'veg' || kid.food_preference === 'non_veg' ? kid.food_preference : '');
    setEditingDetails(false);
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
    setEditingDetails(false);
  };

  // Log Call Outcome — the kid-scoped equivalent of AdminEnquiries'
  // handleAdvanceKid, just scoped to this page's one kid. Status never
  // becomes 'contacted' until this popup is saved (same "Status must
  // NEVER become Contacted until popup is successfully saved" rule the
  // adult page follows) — every later nma step (Mark Confirmed, Mark
  // Checked In, ...) still applies directly via handleUpdateStatus, same
  // as before. See AdminKidContactOutcomeModal.tsx.
  const [kidContactOutcomeTarget, setKidContactOutcomeTarget] = useState<KidContactOutcomeTarget | null>(null);
  const [savingKidContactOutcome, setSavingKidContactOutcome] = useState(false);
  const handleSaveKidContactOutcome = async (result: KidContactOutcomeResult) => {
    if (!kidContactOutcomeTarget) return;
    setSavingKidContactOutcome(true);
    try {
      const updated = await recordKidContactOutcome(kidContactOutcomeTarget.kid.id, {
        outcome: result.outcome,
        notes: result.notes,
        followUpAt: result.followUpAt || null,
        closedReason: result.closedReason,
      });
      setKidContactOutcomeTarget(null);
      reloadAll();
      // Interested is the one outcome that moves towards a booking — open
      // this kid's own Payment section right away, same as the adult
      // side's auto-open-on-Contacted behaviour.
      if (result.outcome === 'interested') {
        openKidPayment(updated, kidContactOutcomeTarget.tripId);
      }
    } finally {
      setSavingKidContactOutcome(false);
    }
  };

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
  const reasonLabel = kidNotInterestedReasonLabel(kid);
  const srcCfg = SOURCE_CONFIG[kid.enquirySource || 'other'] || SOURCE_CONFIG.other;
  const nma = nextKidManualAction(kid);
  const handleAdvance = () => {
    if (!nma) return;
    if (kid.status === 'pending' && nma.status === 'contacted') {
      setKidContactOutcomeTarget({ kid, label: kid.label, parentName: kid.parentName, tripTitle: kid.tripTitle, tripId: kid.tripId });
      return;
    }
    handleUpdateStatus(kid, nma.status);
  };

  // Kebab menu — just Delete, same as AdminEnquiryDetail's own rowActions.
  // Every status jump already lives on a dedicated button up in the
  // header (the nma "Mark X" primary action for forward progress, Not
  // Interested, Reopen, No Show) — this used to also list every "Mark X"
  // status directly here, which just duplicated those buttons.
  const rowActions: ActionMenuItem[] = [
    { label: 'Delete', icon: Trash2, danger: true, onClick: handleDeleteClick },
  ];

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
                  {nma && (
                    <Button variant="primary" size="sm" onClick={handleAdvance} disabled={isBusy}>
                      <nma.icon size={13} aria-hidden="true" /> {nma.label}
                    </Button>
                  )}
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
            </div>

            {/* Payment — same field set the popup (AdminKidPaymentModal)
                shows everywhere else, rendered inline here via the shared
                KidPaymentFormFields (see that file's header comment). */}
            {kidPaymentTarget && (
              <div className="bg-white rounded-lg shadow-card p-4 sm:p-5 space-y-4">
                {!kid.amount_paid && kidPaymentHistory.length === 0 && !kidPaymentHistoryLoading ? (
                  <div className="flex items-start gap-3">
                    <span className="w-10 h-10 rounded-full bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
                      <IndianRupee size={18} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <p className="text-dark text-sm font-semibold">No Payment Yet</p>
                      <p className="text-dark-muted text-xs mt-0.5">No payment recorded for this kid yet — fill this in to track the first payment.</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-dark text-sm font-button font-semibold flex items-center gap-1.5">
                    <IndianRupee size={14} aria-hidden="true" /> Payment
                  </p>
                )}
                <KidPaymentFormFields
                  kid={kid}
                  kidPaymentForm={kidPaymentForm}
                  setKidPaymentForm={setKidPaymentForm}
                  kidErrors={kidErrors}
                  kidPaymentChildPrice={kidPaymentChildPrice}
                  kidPaymentHistory={kidPaymentHistory}
                  kidPaymentHistoryLoading={kidPaymentHistoryLoading}
                  idPrefix="kid-detail-pay"
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSaveKidPayment}
                  loading={savingKidPayment}
                  disabled={hasKidErrors}
                  title={hasKidErrors ? 'Fix the highlighted fields before saving' : undefined}
                >
                  Save Payment
                </Button>
              </div>
            )}

          </div>

          {/* Sidebar — parent booking's contact/trip info this kid has no
              copy of its own (see KidRow in kidsShared.ts), plus this
              kid's own fee. */}
          <div className="lg:col-span-1 space-y-4 min-w-0">
            <div className="bg-white rounded-lg shadow-card p-4 sm:p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-dark text-base font-display font-bold flex items-center gap-2">
                  <Baby size={18} className="shrink-0 text-dark-muted" aria-hidden="true" /> Parent Booking &amp; Trip
                </p>
                {editingDetails ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={handleCancelEditDetails}
                      title="Cancel"
                      className="w-8 h-8 rounded-full inline-flex items-center justify-center text-dark-muted hover:bg-background-warm hover:text-dark transition-colors"
                    >
                      <X size={15} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveDetails}
                      disabled={isBusy}
                      title="Save changes"
                      className="w-8 h-8 rounded-full inline-flex items-center justify-center text-white bg-primary hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                      <Check size={15} aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleStartEditDetails}
                    title="Edit this kid's name/age/food preference — doesn't affect the parent enquiry's own details"
                    className="w-8 h-8 rounded-full inline-flex items-center justify-center text-dark-muted hover:bg-background-warm hover:text-dark transition-colors shrink-0"
                  >
                    <Pencil size={15} aria-hidden="true" />
                  </button>
                )}
              </div>

              {editingDetails && (
                <div className="flex items-center gap-2.5 min-w-0 pb-4 mb-1 border-b border-background-warm">
                  <span className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
                    <User size={15} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <label htmlFor="kid-detail-edit-name" className="text-dark-muted text-xs">Full Name</label>
                    <input
                      id="kid-detail-edit-name"
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      className={`${inlineInputClass} mt-0.5`}
                      placeholder="Optional"
                    />
                  </div>
                </div>
              )}

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
                {!editingDetails && (
                  <div className="col-span-2 mt-1">
                    <ContactQuickLinks phone={kid.phone} email={kid.email} name={kid.parentName} tripTitle={kid.tripTitle} size="md" />
                  </div>
                )}
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
                    <div className="min-w-0 flex-1">
                      <label htmlFor="kid-detail-edit-age" className="text-dark-muted text-xs">Age</label>
                      {editingDetails ? (
                        <input
                          id="kid-detail-edit-age"
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={17}
                          value={age}
                          onChange={e => setAge(e.target.value)}
                          className={`${inlineInputClass} mt-0.5`}
                          placeholder="Optional"
                        />
                      ) : (
                        <p className="text-dark text-sm font-semibold truncate">{kid.age ?? '—'}</p>
                      )}
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
                    <div className="min-w-0 flex-1">
                      <label htmlFor="kid-detail-edit-food" className="text-dark-muted text-xs">Food Preference</label>
                      {editingDetails ? (
                        <div className="mt-0.5">
                          <Select
                            inputId="kid-detail-edit-food"
                            size="sm"
                            value={foodPreference}
                            onChange={v => setFoodPreference(v as '' | 'veg' | 'non_veg')}
                            options={FOOD_PREFERENCE_OPTIONS}
                          />
                        </div>
                      ) : (
                        <p className={`text-sm font-semibold truncate ${foodBadge.key === 'veg' ? 'text-green-700' : foodBadge.key === 'non_veg' ? 'text-red-700' : 'text-dark-muted'}`}>{foodBadge.label}</p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-3 py-4">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
                      <CalendarDays size={15} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-dark-muted text-xs">Date &amp; Time</p>
                      {kid.enquiryCreatedAt ? (
                        <>
                          <p className="text-dark text-sm font-semibold truncate">{formatDate(kid.enquiryCreatedAt, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                          <p className="text-dark-muted text-xs truncate">{formatTime(kid.enquiryCreatedAt)}</p>
                        </>
                      ) : (
                        <p className="text-dark text-sm font-semibold truncate">—</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
                      <Globe size={15} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-dark-muted text-xs">Source</p>
                      <p className="text-dark text-sm font-semibold truncate">{srcCfg.label}</p>
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

            {/* Activity Timeline — same card AdminEnquiryDetail shows for
                the adult booking, reused as-is (it only needs activityLog/
                loading), just scoped to this one kid via
                getActivityLogForKid instead of the enquiry-wide
                getActivityLog. */}
            <AdminEnquiryActivityTimeline activityLog={activityLog} loading={activityLoading} />
          </div>
        </div>
      </div>

      <AdminKidNotInterestedModal
        kidNotInterestedTarget={notInterestedOpen ? kid : null}
        targetLabel={kid.label}
        onClose={() => setNotInterestedOpen(false)}
        closedReason={kidClosedReason}
        setClosedReason={setKidClosedReason}
        onConfirm={handleConfirmNotInterested}
        updating={busy}
      />

      <AdminKidContactOutcomeModal
        target={kidContactOutcomeTarget}
        onClose={() => setKidContactOutcomeTarget(null)}
        onSave={handleSaveKidContactOutcome}
        saving={savingKidContactOutcome}
      />
    </AdminLayout>
  );
}
