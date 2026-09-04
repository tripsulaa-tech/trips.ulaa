// Full CRM-style single-enquiry page — everything the Enquiries table's
// row actions and "View Details" popup offer, but with room to actually
// read it all: traveller/trip info, the Booking Journey stepper, a full
// payment/invoice ledger, an Activity Timeline (CRM spec section 14), and
// every mutating action (Payment, Check In, Cancel/Reactivate, Mark
// Completed, Delete). Deliberately still does NOT
// invent a Documents/Communication-History section — there's no backing
// data model for either yet, and this file only shows what's real.
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  FileText,
  ShareNetwork as Share2,
  XCircle,
  UserMinus as UserX,
  UserCheck,
  SignIn as LogIn,
  ArrowsClockwise as RefreshCw,
  Trash as Trash2,
  X,
} from '@phosphor-icons/react';
import AdminLayout from '../AdminLayout';
import Button from '../../components/ui/Button';
import type { ActionMenuItem } from '../../components/ui/ActionsMenu';
import { useConfirm } from '../../components/ui/useConfirm';
import { useAlert } from '../../components/ui/useAlert';
import {
  getEnquiries, getPaymentsForEnquiry, getAllUpcomingTripsAdmin, getActivityLog,
  recordPayment, generatePendingInvoice, addAddonCharge,
  markEnquiryCompleted, checkInEnquiry, undoCheckInEnquiry,
  updateEnquiryStatus, cancelEnquiry, uncancelEnquiry, setEnquiryNoShow,
  recordRefund, deleteEnquiry, setEnquiryFollowUp,
  recordContactOutcome,
} from '../../services/api';
import type { ActivityLogEntry, CancellationReason, ClosedReason, Enquiry, Payment, UpcomingTrip } from '../../types/types-index';
import { downloadInvoicePdf, invoiceAsFile } from '../../utils/invoicePdf';
import { formatPrice } from '../../utils/utils-index';
import { availablePaymentTypeOptions, getTripPricingForPackage, isNotInterested, canSetFollowUp, canCancelBooking, validatePaymentForm, computeDiscountedTotal } from './AdminEnquiryCommon';
import type { PaymentForm } from './AdminEnquiryCommon';
import ContactOutcomeModal from './AdminContactOutcomeModal';
import type { ContactOutcomeResult } from './AdminContactOutcomeModal';
import MarkPaidModal from './AdminMarkPaidModal';
import { useMarkInvoicePaid } from './useMarkInvoicePaid';
import AdminEnquiryHeaderCard from './AdminEnquiryHeaderCard';
import AdminEnquiryJourneyCard from './AdminEnquiryJourneyCard';
import AdminEnquiryInvoicesCard from './AdminEnquiryInvoicesCard';
import AdminEnquiryTravellerCard from './AdminEnquiryTravellerCard';
import AdminEnquiryActivityTimeline from './AdminEnquiryActivityTimeline';
import AdminEnquiryPaymentModal from './AdminEnquiryPaymentModal';
import { useEditEnquiry } from './useEditEnquiry';
import AdminEnquiryCancelModal from './AdminEnquiryCancelModal';
import AdminEnquiryNotInterestedModal from './AdminEnquiryNotInterestedModal';
import AdminEnquiryFollowUpModal from './AdminEnquiryFollowUpModal';

const emptyPaymentForm: PaymentForm = {
  package_type: 'normal', total_amount: '', discount_amount: '', discount_reason: '', amount_paid: '', payment_type: 'advance', status: 'paid', payment_method: '', payment_utr: '', refund_amount: '',
  refund_method: '', refund_utr: '', refund_date: '', refund_notes: '', food_preference: '', notes: '',
};

export default function AdminEnquiryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const alert = useAlert();

  const [enquiry, setEnquiry] = useState<Enquiry | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [trips, setTrips] = useState<UpcomingTrip[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  // Invoices & Payments list shows the first 3 by default with a "View All
  // Invoices" read-more toggle — see the Invoices & Payments card below.
  const [showAllInvoices, setShowAllInvoices] = useState(false);
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const [activityLogLoading, setActivityLogLoading] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  // Brief "Copied" checkmark swap after tapping the Booking ID's copy icon —
  // resets itself after 1.5s, no toast/alert needed for something this minor.
  const [bookingIdCopied, setBookingIdCopied] = useState(false);
  const handleCopyBookingId = async () => {
    if (!enquiry?.booking_id) return;
    try {
      await navigator.clipboard.writeText(enquiry.booking_id);
      setBookingIdCopied(true);
      setTimeout(() => setBookingIdCopied(false), 1500);
    } catch {
      // Clipboard API can fail (e.g. insecure context) — nothing useful to
      // surface for a convenience action, so just no-op.
    }
  };
  // ---- Record Contact Outcome (the New -> Contacted entry point) --------
  // Mirrors AdminEnquiries.tsx's wiring of the same popup — see
  // ContactOutcomeModal.tsx and recordContactOutcome() in services/api.ts.
  const [contactOutcomeOpen, setContactOutcomeOpen] = useState(false);
  const [savingContactOutcome, setSavingContactOutcome] = useState(false);

  const load = () => {
    getEnquiries()
      .then(list => {
        const found = list.find(e => e.id === id) || null;
        setEnquiry(found);
        setNotFound(!found);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    getAllUpcomingTripsAdmin().then(setTrips).catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!enquiry) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing stale payments immediately on enquiry change, ahead of the async fetch below
      setPayments([]);
      return;
    }
    let cancelled = false;
    setPaymentsLoading(true);
    getPaymentsForEnquiry(enquiry.id)
      .then(rows => { if (!cancelled) setPayments(rows); })
      .catch(err => console.error(err))
      .finally(() => { if (!cancelled) setPaymentsLoading(false); });
    return () => { cancelled = true; };
  }, [enquiry?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- only enquiry.id is read; re-fetching on every enquiry reference change (e.g. every load() call) would refetch unnecessarily

  // Activity Timeline (CRM spec section 14) — re-fetched every time `load()`
  // sets a fresh `enquiry` object, same trigger as the payments effect
  // above, so any action taken on this page (which all call load()
  // afterward) picks up its own just-written log entry without a manual
  // refresh.
  useEffect(() => {
    if (!enquiry) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing stale activity log immediately on enquiry change, ahead of the async fetch below
      setActivityLog([]);
      return;
    }
    let cancelled = false;
    setActivityLogLoading(true);
    getActivityLog(enquiry.id)
      .then(rows => { if (!cancelled) setActivityLog(rows); })
      .catch(err => console.error(err))
      .finally(() => { if (!cancelled) setActivityLogLoading(false); });
    return () => { cancelled = true; };
  }, [enquiry?.id, enquiry?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps -- only enquiry.id/updated_at are read; re-fetching on every enquiry reference change would refetch unnecessarily

  // Fixed lookup for a specific package (used once the admin has picked
  // Early Bird / Normal explicitly in the Track Payment modal).
  const getTripPrice = (tripId: string | undefined, packageType: Enquiry['package_type']): number | undefined => {
    const trip = trips.find(t => t.id === tripId);
    if (!trip) return undefined;
    const price = packageType === 'early_bird' ? trip.early_bird_price : trip.price;
    return price ?? undefined;
  };

  // Which price applies to this enquiry's trip for whichever package is
  // set on the enquiry itself (Traveller & Trip → Package) — not just
  // whichever price happens to be live on the trip right now, so editing
  // Package to Normal (say) shows the Normal price here immediately, even
  // while the trip's early-bird window is still technically open.
  const activePricing = enquiry ? getTripPricingForPackage(trips.find(t => t.id === enquiry.trip_id), enquiry.package_type) : null;

  // ---- Track Payment modal --------------------------------------------
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState<PaymentForm>(emptyPaymentForm);
  const [savingPayment, setSavingPayment] = useState(false);
  // Live, field-level errors for the Track Payment modal below — recomputed
  // every render so a bad amount, a missing payment method, etc. show up
  // the moment it's entered/selected, instead of only surfacing behind an
  // alert() after Save. Same shared validator the now-retired AdminPaymentModal used to.
  const paymentErrors = (paymentOpen || (enquiry && !enquiry.booking_id))
    ? validatePaymentForm(paymentForm, enquiry?.amount_paid || 0)
    : {};
  const hasPaymentErrors = Object.keys(paymentErrors).length > 0;
  const [togglingNoShow, setTogglingNoShow] = useState(false);

  // 'Balance' is only meant for the payment that actually zeroes out the
  // amount due, and 'Advance'/'Full Payment' only for the very first money
  // in on a booking — if the admin picks one of these and the form then
  // stops qualifying (amount/total edited, or a payment lands and this
  // modal reopens later), drop back to 'Installment' rather than leaving
  // an invalid type selected. See clearsBalance/availablePaymentTypeOptions
  // in AdminEnquiryCommon.
  useEffect(() => {
    if (!enquiry) return;
    const alreadyPaid = enquiry.amount_paid || 0;
    const stillValid = availablePaymentTypeOptions(paymentForm, alreadyPaid).some(o => o.value === paymentForm.payment_type);
    if (!stillValid) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- self-correcting a form field once it stops satisfying an invariant, guarded so it only fires on the actual violating transition
      setPaymentForm(f => ({ ...f, payment_type: 'installment' }));
    }
  }, [enquiry, paymentForm]);

  const buildNewPaymentForm = (): PaymentForm | null => {
    if (!enquiry) return null;
    // If the enquiry already has a package/total_amount on record, keep it
    // — an admin's already-tracked payment shouldn't silently jump to a
    // different price just because the early-bird window has since closed.
    // Only a brand-new payment (nothing recorded yet) auto-picks whichever
    // package is set on the enquiry (package_type always has a value —
    // 'normal' by default).
    const packageType = enquiry.package_type;
    const listPriceNow = enquiry.trip_id ? getTripPrice(enquiry.trip_id, packageType) : undefined;
    const suggested = enquiry.total_amount ?? listPriceNow ?? activePricing?.amount;
    // The enquiry can carry an already-recorded total with nothing in
    // discount_amount to explain why it's under today's list price — e.g.
    // a total set by the public website form, or a list price that's
    // since changed. Rather than showing that gap as an unexplained
    // mismatch, imply the discount that would reconcile them, so List
    // Price − Discount = Total Amount actually holds. Only kicks in when
    // nothing's already recorded in discount_amount — a real discount on
    // file always wins.
    const impliedDiscount = enquiry.trip_id && !enquiry.discount_amount && listPriceNow != null && enquiry.total_amount != null && listPriceNow > enquiry.total_amount
      ? listPriceNow - enquiry.total_amount
      : undefined;
    return {
      package_type: packageType,
      total_amount: suggested ?? '',
      discount_amount: enquiry.discount_amount || impliedDiscount || '',
      discount_reason: enquiry.discount_reason || (impliedDiscount ? 'Backfilled — matches previously recorded total' : ''),
      // Blank, not enquiry.amount_paid — same reasoning as AdminEnquiries'
      // openPayment: this field is this-payment's-own-amount now, matching
      // Generate Invoice, not a running total to edit down to.
      amount_paid: '',
      // 'Advance' only makes sense as the very first money in — once
      // anything's already been paid, default to 'Installment' instead
      // (matches availablePaymentTypeOptions, which drops 'Advance'/'Full
      // Payment' from the dropdown the moment amount_paid > 0).
      payment_type: (enquiry.amount_paid || 0) > 0 ? 'installment' as const : 'advance' as const,
      status: 'paid' as const,
      payment_method: '',
      payment_utr: '',
      refund_amount: enquiry.is_no_show ? 0 : enquiry.refund_amount ?? 0,
      refund_method: '',
      refund_utr: '',
      refund_date: '',
      refund_notes: '',
      food_preference: enquiry.food_preference === 'veg' || enquiry.food_preference === 'non_veg' ? enquiry.food_preference : '',
      notes: '',
    };
  };

  // Prefills paymentForm for a *new* payment — same suggested price/
  // package/food-preference logic either way, just two different triggers:
  // clicking "Payment" once a booking already exists (modal), or landing
  // on a brand-new enquiry with no booking yet (inline form below, filled
  // in automatically since there's nothing to preserve yet).
  const openPayment = () => {
    const built = buildNewPaymentForm();
    if (!built) return;
    setPaymentForm(built);
    setPaymentOpen(true);
  };

  // Prefill the inline "No Payment Yet" form once per enquiry — keyed on
  // id/booking_id only (not the whole enquiry object) so an unrelated
  // refresh (e.g. saving a Traveller & Trip edit) doesn't wipe out amounts
  // the admin has already started typing into this form.
  useEffect(() => {
    if (enquiry && !enquiry.booking_id) {
      const built = buildNewPaymentForm();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- prefilling a form the moment its enquiry (or booking state) becomes known, not reacting to a state change; same pattern as the payment_type correction effect above
      if (built) setPaymentForm(built);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately re-runs only when the enquiry identity or its booking state changes, not on every field edit elsewhere on the page
  }, [enquiry?.id, enquiry?.booking_id]);

  // Food Preference/Package are no longer their own editable fields on the
  // "No Payment Yet" form (that duplicated Traveller & Trip, which already
  // covers them) — so once a booking doesn't exist yet, keep just these two
  // (plus the price they imply) synced to whatever's saved on the enquiry,
  // same way the full prefill above does for a brand-new form. Narrowed to
  // only these fields, same reasoning as that effect, so an admin's
  // already-typed amount survives an unrelated Traveller & Trip save.
  useEffect(() => {
    if (!enquiry || enquiry.booking_id) return;
    const nextFoodPreference = enquiry.food_preference === 'veg' || enquiry.food_preference === 'non_veg' ? enquiry.food_preference : '';
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing two fields (and the price they imply) to their source of truth on the enquiry, not reacting to this form's own edits
    setPaymentForm(f => {
      if (f.package_type === enquiry.package_type && f.food_preference === nextFoodPreference) return f;
      const suggested = getTripPrice(enquiry.trip_id, enquiry.package_type);
      return {
        ...f,
        package_type: enquiry.package_type,
        food_preference: nextFoodPreference,
        total_amount: enquiry.trip_id ? (computeDiscountedTotal(suggested, f.discount_amount) ?? f.total_amount) : f.total_amount,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getTripPrice is derived fresh from `trips` every render; keying on `enquiry` alone (not trips) avoids re-syncing on unrelated trip-list refreshes
  }, [enquiry]);


  // ---- Edit Details modal (fixing wrong name/contact/trip) --------------
  // Shared with the Enquiries list page — see useEditEnquiry for why the
  // state/save logic lives there instead of being duplicated here. `load()`
  // (below) refetches by id and calls setEnquiry, so it doubles as this
  // hook's post-save refresh.
  const {
    editTarget, setEditTarget, editForm, setEditForm, editTouched, setEditTouched,
    savingEdit, openEdit, handleSaveEdit,
  } = useEditEnquiry({ trips, load, getTripPrice });

  // ---- Not Interested / Reopen (this is just a query, not a booking) ----
  // Distinct from Cancel Booking, which is for a booking that had money on
  // it. This only applies before anything's been paid — closing out a lead
  // that went nowhere. See isNotInterested()'s comment in AdminEnquiryCommon.tsx
  // for why 'closed' status alone is ambiguous without this.
  const [busyStatus, setBusyStatus] = useState(false);
  // Opens the reason-picker modal below instead of closing immediately —
  // capturing *why* a lead didn't convert (see CLOSED_REASON_OPTIONS) is
  // what makes the "35 closed before booking" number in reporting
  // actionable instead of a dead end.
  const [notInterestedOpen, setNotInterestedOpen] = useState(false);
  const [closedReason, setClosedReason] = useState<ClosedReason>('no_response');
  const handleMarkNotInterested = () => {
    if (!enquiry) return;
    setClosedReason('no_response');
    setNotInterestedOpen(true);
  };
  const handleConfirmNotInterested = async () => {
    if (!enquiry) return;
    setBusyStatus(true);
    try {
      await updateEnquiryStatus(enquiry.id, 'closed', closedReason);
      setNotInterestedOpen(false);
      load();
    } catch (err) {
      console.error(err);
      alert('Failed to update status.');
    } finally {
      setBusyStatus(false);
    }
  };

  const handleReopenEnquiry = async () => {
    if (!enquiry) return;
    setBusyStatus(true);
    try {
      await updateEnquiryStatus(enquiry.id, 'contacted');
      load();
    } catch (err) {
      console.error(err);
      alert('Failed to reopen enquiry.');
    } finally {
      setBusyStatus(false);
    }
  };

  // ---- Follow-up reminder (still warm, not ready to close either way) ----
  // Same shape as Not Interested above (target-less here since this page is
  // already scoped to one enquiry) but writes just follow_up_at via
  // setEnquiryFollowUp — never touches status/journey_stage. See
  // canSetFollowUp/followUpStatus in AdminEnquiryCommon.tsx.
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpDate, setFollowUpDate] = useState('');
  const [busyFollowUp, setBusyFollowUp] = useState(false);
  const handleOpenFollowUp = () => {
    if (!enquiry) return;
    setFollowUpDate(enquiry.follow_up_at || '');
    setFollowUpOpen(true);
  };
  const handleSaveFollowUp = async () => {
    if (!enquiry || !followUpDate) return;
    setBusyFollowUp(true);
    try {
      await setEnquiryFollowUp(enquiry.id, followUpDate);
      setFollowUpOpen(false);
      load();
    } catch (err) {
      console.error(err);
      alert('Failed to set follow-up date.');
    } finally {
      setBusyFollowUp(false);
    }
  };
  const handleClearFollowUp = async () => {
    if (!enquiry) return;
    setBusyFollowUp(true);
    try {
      await setEnquiryFollowUp(enquiry.id, null);
      load();
    } catch (err) {
      console.error(err);
      alert('Failed to clear follow-up date.');
    } finally {
      setBusyFollowUp(false);
    }
  };

  // Add-on and Pending both raise their own invoice row via the same
  // services/api.ts functions the old standalone "Add Invoice" flow used
  // (addAddonCharge / generatePendingInvoice) rather than moving amount_paid
  // through recordPayment's running-total math — see useEnquiryPayment.ts's
  // handleSavePayment for the same branching, kept for the pre-navigation
  // list-view state sync.
  const handleSavePayment = async () => {
    if (!enquiry) return;
    const totalAmount = paymentForm.total_amount === '' ? null : Number(paymentForm.total_amount);
    const thisPayment = paymentForm.amount_paid === '' ? 0 : Number(paymentForm.amount_paid);
    const isExtraCharge = paymentForm.payment_type === 'addon';
    const isPending = paymentForm.status === 'pending';
    const newRunningTotal = (enquiry.amount_paid || 0) + thisPayment;
    const refundAmount = paymentForm.refund_amount === '' ? 0 : Number(paymentForm.refund_amount);
    const discountAmount = paymentForm.discount_amount === '' ? 0 : Number(paymentForm.discount_amount);
    // The modal already shows every one of these live, field-by-field, and
    // disables Save while any are present — this is just the defense-in-
    // depth gate in case Save is reached some other way. Same shared
    // validator as AdminEnquiries.tsx, so the rules can't drift between
    // "what the admin sees live" and "what actually blocks the save".
    const formErrors = validatePaymentForm(paymentForm, enquiry.amount_paid || 0);
    const firstError = Object.values(formErrors)[0];
    if (firstError) {
      alert(firstError);
      return;
    }
    try {
      setSavingPayment(true);
      let updated = enquiry;

      if (isExtraCharge) {
        updated = await recordPayment(enquiry, {
          amount_paid: enquiry.amount_paid || 0,
          package_type: paymentForm.package_type,
          discount_amount: discountAmount,
          discount_reason: paymentForm.discount_reason || null,
          food_preference: paymentForm.food_preference || null,
        });
        updated = await addAddonCharge(updated, thisPayment, {
          collectedNow: !isPending,
          payment_method: paymentForm.payment_method || undefined,
          utr_number: paymentForm.payment_utr || undefined,
          notes: paymentForm.notes.trim() || undefined,
          // Drives the Child Fare badge in the Enquiries list/detail —
          // matches the exact preset text the Child Fare chip in
          // PaymentFormFields fills in, so an admin manually typing
          // something else here doesn't get flagged as one.
          markAsChildAddon: paymentForm.notes.trim() === 'Child fare',
        });
      } else if (isPending) {
        updated = await recordPayment(enquiry, {
          amount_paid: enquiry.amount_paid || 0,
          total_amount: totalAmount,
          package_type: paymentForm.package_type,
          discount_amount: discountAmount,
          discount_reason: paymentForm.discount_reason || null,
          food_preference: paymentForm.food_preference || null,
        });
        if (thisPayment > 0) {
          // Not addon in this branch (handled above), so this is
          // always one of the four types generatePendingInvoice accepts.
          await generatePendingInvoice(enquiry.id, paymentForm.payment_type as 'full_payment' | 'advance' | 'balance' | 'installment', thisPayment, paymentForm.notes.trim() || undefined);
        }
      } else {
        updated = await recordPayment(enquiry, {
          amount_paid: newRunningTotal,
          total_amount: totalAmount,
          package_type: paymentForm.package_type,
          discount_amount: discountAmount,
          discount_reason: paymentForm.discount_reason || null,
          food_preference: paymentForm.food_preference || null,
          payment_method: paymentForm.payment_method || undefined,
          utr_number: paymentForm.payment_utr || undefined,
          notes: paymentForm.notes.trim() || undefined,
          // Not addon in this branch (handled above), so this is
          // always one of the four types recordPayment's override accepts.
          type: thisPayment > 0 ? (paymentForm.payment_type as 'full_payment' | 'advance' | 'balance' | 'installment') : undefined,
        });
      }

      if (enquiry.cancelled_at) {
        updated = await recordRefund(updated, refundAmount, {
          payment_method: paymentForm.refund_method || undefined,
          utr_number: paymentForm.refund_utr || undefined,
          notes: paymentForm.refund_notes || undefined,
          paid_at: paymentForm.refund_date || undefined,
        });
      }

      setEnquiry(updated);
      setPaymentOpen(false);
      getPaymentsForEnquiry(enquiry.id).then(setPayments).catch(console.error);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to save payment details.');
    } finally {
      setSavingPayment(false);
    }
  };

  const handleToggleNoShow = async (isNoShow: boolean) => {
    if (!enquiry) return;
    setTogglingNoShow(true);
    try {
      const updated = await setEnquiryNoShow(enquiry, isNoShow);
      setEnquiry(updated);
      if (isNoShow) setPaymentForm(f => ({ ...f, refund_amount: 0 }));
    } catch (err) {
      console.error(err);
      alert('Failed to update no-show status.');
    } finally {
      setTogglingNoShow(false);
    }
  };

  // ---- Mark Invoice Paid -------------------------------------------------
  // Shared with the Enquiries list page — see useMarkInvoicePaid for why
  // the state/save logic lives there instead of being duplicated here.
  const markPaid = useMarkInvoicePaid(updatedPayment => {
    setPayments(prev => prev.map(p => (p.id === updatedPayment.id ? updatedPayment : p)));
    setEnquiry(prev => {
      if (!prev) return prev;
      const isRefund = updatedPayment.payment_type === 'refund';
      return { ...prev, amount_paid: (prev.amount_paid || 0) + (isRefund ? 0 : updatedPayment.amount) };
    });
    load();
  });

  // ---- Cancel / reactivate modal ----------------------------------------
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelCharges, setCancelCharges] = useState<number | ''>('');
  const [cancelIsNoShow, setCancelIsNoShow] = useState(false);
  const [cancelReason, setCancelReason] = useState<CancellationReason | ''>('');
  const [cancelNotes, setCancelNotes] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const handleCancelToggle = () => {
    if (!enquiry) return;
    if (enquiry.cancelled_at) {
      handleReactivate();
    } else {
      setCancelCharges('');
      setCancelIsNoShow(false);
      setCancelReason('');
      setCancelNotes('');
      setCancelOpen(true);
    }
  };

  const handleConfirmCancel = async () => {
    if (!enquiry) return;
    setCancelling(true);
    try {
      const charges = cancelCharges === '' ? undefined : Number(cancelCharges);
      const updated = await cancelEnquiry(enquiry, charges, cancelIsNoShow, cancelReason || undefined, cancelNotes);
      setEnquiry(updated);
      setCancelOpen(false);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to cancel booking.');
    } finally {
      setCancelling(false);
    }
  };

  const handleReactivate = async () => {
    if (!enquiry) return;
    setBusyAction(true);
    try {
      const updated = await uncancelEnquiry(enquiry);
      setEnquiry(updated);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to reactivate booking.');
    } finally {
      setBusyAction(false);
    }
  };

  // ---- Journey actions ----------------------------------------------------
  const handleCheckIn = async () => {
    if (!enquiry) return;
    setBusyAction(true);
    try {
      setEnquiry(await checkInEnquiry(enquiry));
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to check in.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleUndoCheckIn = async () => {
    if (!enquiry) return;
    setBusyAction(true);
    try {
      setEnquiry(await undoCheckInEnquiry(enquiry.id));
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to undo check-in.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleMarkCompleted = async () => {
    if (!enquiry) return;
    setBusyAction(true);
    try {
      setEnquiry(await markEnquiryCompleted(enquiry.id));
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to mark trip completed.');
    } finally {
      setBusyAction(false);
    }
  };

  // Single entry point for the "Advance" button — mirrors AdminEnquiries'
  // handleAdvance, dispatching to whichever manual action nextManualAction
  // says is next for this booking.
  const handleAdvance = async () => {
    if (!enquiry) return;
    switch (enquiry.journey_stage) {
      case 'new_enquiry':
      case 'contacted':
        return setContactOutcomeOpen(true);
      case 'fully_paid':
        return handleCheckIn();
      case 'checked_in':
        return handleMarkCompleted();
      default:
        return;
    }
  };

  // Save handler for the Contact Outcome popup above — see
  // AdminEnquiries.tsx's identical handleSaveContactOutcome.
  const handleSaveContactOutcome = async (result: ContactOutcomeResult) => {
    if (!enquiry) return;
    setSavingContactOutcome(true);
    try {
      const updated = await recordContactOutcome(enquiry.id, {
        outcome: result.outcome,
        notes: result.notes,
        followUpAt: result.followUpAt || null,
        followUpTime: result.followUpTime || null,
        closedReason: result.closedReason,
      });
      setEnquiry(updated);
      setContactOutcomeOpen(false);
      // Interested is the one outcome that moves towards a booking — open
      // Track Payment right away so the admin can record the advance in
      // one flow, same as the old auto-open-on-Contacted behaviour.
      if (result.outcome === 'interested') {
        openPayment();
      }
    } catch (err) {
      console.error(err);
      alert('Failed to record contact outcome.');
    } finally {
      setSavingContactOutcome(false);
    }
  };

  // ---- Invoice PDF actions -----------------------------------------------
  const handleDownloadInvoice = async () => {
    if (!enquiry) return;
    setInvoiceBusy(true);
    try {
      const rows = await getPaymentsForEnquiry(enquiry.id);
      await downloadInvoicePdf(enquiry, rows);
    } catch (err) {
      console.error(err);
      alert('Failed to generate invoice.');
    } finally {
      setInvoiceBusy(false);
    }
  };

  const handleShareInvoice = async () => {
    if (!enquiry) return;
    setInvoiceBusy(true);
    try {
      const rows = await getPaymentsForEnquiry(enquiry.id);
      const file = await invoiceAsFile(enquiry, rows);
      const canShareFile = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
      if (canShareFile) {
        await navigator.share({
          files: [file],
          title: `ULAA Invoice — ${enquiry.booking_id || ''}`,
          text: `Invoice for booking ${enquiry.booking_id || ''} (${enquiry.trip_title || 'ULAA trip'})`,
        });
      } else {
        await downloadInvoicePdf(enquiry, rows);
        const text = encodeURIComponent(
          `Hi ${enquiry.full_name}, here's your ULAA booking summary:\n` +
          `Booking ID: ${enquiry.booking_id || '—'}\n` +
          `Trip: ${enquiry.trip_title || '—'}\n` +
          `Amount paid: ${formatPrice(enquiry.amount_paid || 0)}${enquiry.total_amount ? ` of ${formatPrice(enquiry.total_amount)}` : ''}\n` +
          `The invoice PDF has been downloaded — please attach it to this chat.`
        );
        const digits = (enquiry.phone || '').replace(/\D/g, '');
        window.open(`https://wa.me/${digits}?text=${text}`, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error(err);
      alert('Failed to share invoice.');
    } finally {
      setInvoiceBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!enquiry) return;
    const ok = await confirm({
      title: 'Delete this enquiry?',
      message: 'This permanently removes the enquiry and its payment history. This cannot be undone.',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    setBusyAction(true);
    try {
      await deleteEnquiry(enquiry);
      navigate('/admin/enquiries');
    } catch (err) {
      console.error(err);
      alert('Failed to delete enquiry.');
      setBusyAction(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout title="Enquiry Details">
        <div className="p-6 text-dark-muted text-sm">Loading…</div>
      </AdminLayout>
    );
  }

  if (notFound || !enquiry) {
    return (
      <AdminLayout title="Enquiry Details">
        <div className="p-6 space-y-3">
          <p className="text-dark-muted text-sm">This enquiry couldn't be found — it may have been deleted.</p>
          <Button variant="primary" size="sm" onClick={() => navigate('/admin/enquiries')}>
            <ArrowLeft size={14} aria-hidden="true" /> Back to Enquiries
          </Button>
        </div>
      </AdminLayout>
    );
  }

  const isGeneralContactMessage = !enquiry.trip_id && enquiry.source === 'website';

  const rowActions: ActionMenuItem[] = [];
  // "Reopen" only makes sense before any money's changed hands — once
  // there's a booking_id or a payment on record, closing the lead out is a
  // Cancel Booking decision instead (different consequences: refunds, seat
  // release, etc). "Not Interested (Close Query)" itself is intentionally
  // NOT duplicated in here — whenever it'd be eligible (canMarkNotInterested),
  // it's already shown as its own button next to this menu, so repeating it
  // here would just be the same action twice.
  if (!enquiry.cancelled_at && !enquiry.booking_id && (enquiry.amount_paid || 0) <= 0 && isNotInterested(enquiry)) {
    rowActions.push({ label: 'Reopen Enquiry', icon: RefreshCw, onClick: handleReopenEnquiry });
  }
  // Setting/editing the follow-up date is intentionally NOT duplicated here
  // — the header card already has a dedicated "Set Follow-up" chip (and,
  // once a date is set, that same chip becomes the clickable follow-up
  // badge) that does exactly that. Only Clear Follow-up stays in this menu,
  // since there's no other way to reach it. Mirrors the same rule already
  // applied to the enquiries table's row-actions menu (see useRowActions.ts).
  if (canSetFollowUp(enquiry) && enquiry.follow_up_at) {
    rowActions.push({ label: 'Clear Follow-up', icon: X, onClick: handleClearFollowUp });
  }
  if (enquiry.booking_id) {
    rowActions.push(
      { label: 'Download Invoice', icon: FileText, onClick: handleDownloadInvoice, disabled: invoiceBusy },
      { label: 'Share Invoice', icon: Share2, onClick: handleShareInvoice, disabled: invoiceBusy },
    );
  }
  // WhatsApp/Call are deliberately NOT in this menu — they're already one
  // tap away via the round quick-link icons under Email/Phone below, so
  // listing them again here would just be the same actions twice.
  // Mark/Undo No Show — gated the same way setEnquiryNoShow() is
  // server-side (spec section 18's No Show Rules): only offered on an
  // active, Fully Paid booking whose Attendance hasn't started yet (not
  // checked in), and only once the trip date has actually arrived. Undo
  // No Show has no such gate — it's a correction path.
  if (enquiry.is_no_show) {
    rowActions.push({ label: 'Undo No Show', icon: UserCheck, onClick: () => handleToggleNoShow(false) });
  } else if (
    !enquiry.cancelled_at && enquiry.journey_stage === 'fully_paid' && !enquiry.checked_in_at
    && (!enquiry.departure_date || new Date(enquiry.departure_date) <= new Date())
  ) {
    rowActions.push({ label: 'Mark No Show', icon: UserX, onClick: () => handleToggleNoShow(true) });
  }
  if (enquiry.journey_stage === 'checked_in') {
    rowActions.push({ label: 'Undo Check In', icon: LogIn, onClick: handleUndoCheckIn });
  }
  // A Completed booking can't be cancelled, and neither can one that's
  // already checked in (spec section 18: "Checked In ... Not Allowed:
  // Cancel Booking" — undo the check-in first), nor a lead that hasn't
  // agreed to book yet ("New"/"Contacted": "Not Allowed: Cancel Booking" —
  // see canCancelBooking() in AdminEnquiryCommon.tsx) — see cancelEnquiry's
  // guards in services/api.ts. Omit the action entirely rather than
  // showing it disabled or letting the click round-trip into an error
  // alert.
  if (enquiry.cancelled_at || canCancelBooking(enquiry)) {
    rowActions.push(
      enquiry.cancelled_at
        ? { label: 'Reactivate Booking', icon: RefreshCw, onClick: handleCancelToggle }
        : { label: 'Cancel Booking', icon: XCircle, danger: true, onClick: handleCancelToggle }
    );
  }
  rowActions.push({ label: 'Delete', icon: Trash2, danger: true, onClick: handleDelete });

  return (
    <AdminLayout title="Enquiry Details" subtitle={enquiry.full_name}>
      <div className="max-w-7xl mx-auto space-y-4">
        <button
          onClick={() => navigate('/admin/enquiries')}
          className="inline-flex items-center gap-1.5 text-sm font-button font-medium text-dark-muted hover:text-primary transition-colors"
        >
          <ArrowLeft size={15} aria-hidden="true" /> Back to Enquiries
        </button>

        {/* Desktop: main record (header, journey, ledger) on the left ~2/3,
            a fixed-context sidebar (who/what + history) on the right ~1/3 —
            the sidebar column never needs to scroll past the main column to
            check who you're talking to. Collapses to a single stacked
            column below the lg breakpoint. */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 space-y-4 min-w-0">

        <AdminEnquiryHeaderCard
          enquiry={enquiry}
          busyAction={busyAction}
          busyStatus={busyStatus}
          busyFollowUp={busyFollowUp}
          bookingIdCopied={bookingIdCopied}
          onCopyBookingId={handleCopyBookingId}
          onAdvance={handleAdvance}
          onMarkNotInterested={handleMarkNotInterested}
          onOpenFollowUp={handleOpenFollowUp}
          rowActions={rowActions}
        />

        <AdminEnquiryJourneyCard
          enquiry={enquiry}
          busyAction={busyAction}
          onOpenPayment={openPayment}
          onMarkCompleted={handleMarkCompleted}
          paymentForm={paymentForm}
          setPaymentForm={setPaymentForm}
          paymentErrors={paymentErrors}
          hasPaymentErrors={hasPaymentErrors}
          savingPayment={savingPayment}
          onSavePayment={handleSavePayment}
          payments={payments}
          paymentsLoading={paymentsLoading}
          togglingNoShow={togglingNoShow}
          onToggleNoShow={handleToggleNoShow}
          getTripPrice={getTripPrice}
        />

        <AdminEnquiryInvoicesCard
          enquiry={enquiry}
          payments={payments}
          paymentsLoading={paymentsLoading}
          showAllInvoices={showAllInvoices}
          setShowAllInvoices={setShowAllInvoices}
          onAddInvoice={openPayment}
          onMarkPaid={inv => markPaid.open(inv)}
          markPaidBusyId={markPaid.busyId}
        />

        </div>{/* /main column */}

        <div className="lg:col-span-1 space-y-4 min-w-0">

        <AdminEnquiryTravellerCard
          enquiry={enquiry}
          isGeneralContactMessage={isGeneralContactMessage}
          editing={!!editTarget}
          editForm={editForm}
          setEditForm={setEditForm}
          editTouched={editTouched}
          setEditTouched={setEditTouched}
          trips={trips}
          savingEdit={savingEdit}
          onStartEdit={() => openEdit(enquiry)}
          onCancelEdit={() => setEditTarget(null)}
          onSaveEdit={handleSaveEdit}
        />

        <AdminEnquiryActivityTimeline activityLog={activityLog} loading={activityLogLoading} />

        </div>{/* /sidebar column */}
        </div>{/* /grid */}
      </div>

      <AdminEnquiryPaymentModal
        isOpen={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        enquiry={enquiry}
        paymentForm={paymentForm}
        setPaymentForm={setPaymentForm}
        paymentErrors={paymentErrors}
        hasPaymentErrors={hasPaymentErrors}
        savingPayment={savingPayment}
        onSave={handleSavePayment}
        payments={payments}
        paymentsLoading={paymentsLoading}
        togglingNoShow={togglingNoShow}
        onToggleNoShow={handleToggleNoShow}
        getTripPrice={getTripPrice}
      />

      {/* Record Contact Outcome — the New -> Contacted entry point. */}
      <ContactOutcomeModal
        target={contactOutcomeOpen ? enquiry : null}
        onClose={() => setContactOutcomeOpen(false)}
        onSave={handleSaveContactOutcome}
        saving={savingContactOutcome}
      />

      <MarkPaidModal
        target={markPaid.target}
        onClose={markPaid.close}
        form={markPaid.form}
        setForm={markPaid.setForm}
        onConfirm={markPaid.confirm}
        saving={markPaid.saving}
      />

      <AdminEnquiryNotInterestedModal
        isOpen={notInterestedOpen}
        onClose={() => setNotInterestedOpen(false)}
        closedReason={closedReason}
        setClosedReason={setClosedReason}
        busy={busyStatus}
        onConfirm={handleConfirmNotInterested}
      />

      <AdminEnquiryFollowUpModal
        isOpen={followUpOpen}
        onClose={() => setFollowUpOpen(false)}
        enquiry={enquiry}
        followUpDate={followUpDate}
        setFollowUpDate={setFollowUpDate}
        busy={busyFollowUp}
        onSave={handleSaveFollowUp}
      />

      <AdminEnquiryCancelModal
        isOpen={cancelOpen}
        onClose={() => setCancelOpen(false)}
        cancelReason={cancelReason}
        setCancelReason={setCancelReason}
        cancelCharges={cancelCharges}
        setCancelCharges={setCancelCharges}
        cancelIsNoShow={cancelIsNoShow}
        setCancelIsNoShow={setCancelIsNoShow}
        cancelNotes={cancelNotes}
        setCancelNotes={setCancelNotes}
        cancelling={cancelling}
        onConfirm={handleConfirmCancel}
      />
    </AdminLayout>
  );
}
