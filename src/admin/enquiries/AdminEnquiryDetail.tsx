// Full CRM-style single-enquiry page — everything the Enquiries table's
// row actions and "View Details" popup offer, but with room to actually
// read it all: traveller/trip info, the Booking Journey stepper, a full
// payment/invoice ledger, an Activity Timeline (CRM spec section 14), and
// every mutating action (Track Payment, Generate Invoice, Check In,
// Cancel/Reactivate, Mark Completed, Delete). Deliberately still does NOT
// invent a Documents/Communication-History section — there's no backing
// data model for either yet, and this file only shows what's real.
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  FileText,
  ShareNetwork as Share2,
  Users,
  User,
  SealCheck as BadgeCheck,
  Plus,
  CheckCircle as CheckCircle2,
  XCircle,
  UserMinus as UserX,
  UserCheck,
  SignIn as LogIn,
  ArrowsClockwise as RefreshCw,
  Trash as Trash2,
  CurrencyInr as IndianRupee,
  Pencil,
  UserMinus,
  Bird,
  CalendarDot as CalendarClock,
  X,
  ClockCounterClockwise as History,
  Copy,
  Check,
} from '@phosphor-icons/react';
import AdminLayout from '../AdminLayout';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Select from '../../components/ui/Select';
import FoodMark from '../../components/ui/FoodMark';
import DatePicker from '../../components/ui/DatePicker';
import ActionsMenu from '../../components/ui/ActionsMenu';
import type { ActionMenuItem } from '../../components/ui/ActionsMenu';
import { ContactQuickLinks } from '../../components/ui/DataTableChrome';
import { useConfirm } from '../../components/ui/useConfirm';
import { useAlert } from '../../components/ui/useAlert';
import {
  getEnquiries, getPaymentsForEnquiry, getAllUpcomingTripsAdmin, getActivityLog,
  recordPayment, generatePendingInvoice, addExtraCharge,
  markInvoicePaid, markEnquiryCompleted, checkInEnquiry, undoCheckInEnquiry,
  updateEnquiryStatus, cancelEnquiry, uncancelEnquiry, setEnquiryNoShow,
  recordRefund, deleteEnquiry, updateEnquiryDetails, setEnquiryFollowUp,
  recordContactOutcome,
} from '../../services/api';
import type { ActivityLogEntry, CancellationReason, ClosedReason, Enquiry, Payment, UpcomingTrip } from '../../types/types-index';
import { downloadInvoicePdf, invoiceAsFile } from '../../utils/invoicePdf';
import { formatDate, formatTime, formatPrice } from '../../utils/utils-index';
import {
  parseNonNegative, PACKAGE_CONFIG, PACKAGE_OPTIONS, INVOICE_TYPE_LABEL,
  GENERATE_INVOICE_STATUS_OPTIONS, availablePaymentTypeOptions, clearsBalance,
  foodBadge, foodPreferenceKey, FOOD_PREFERENCE_OPTIONS, SOURCE_CONFIG,
  journeyBadge, nextManualAction, BookingLifecycleStepper, getTripActivePricing, isNotInterested, canMarkNotInterested,
  NOT_INTERESTED_REASON_OPTIONS, closedReasonLabel, canSetFollowUp, followUpStatus, canCancelBooking,
  CANCELLATION_REASON_OPTIONS, REFUND_METHOD_OPTIONS, PAYMENT_METHOD_OPTIONS,
  validatePaymentForm,
} from './AdminEnquiryCommon';
import type { PaymentForm } from './AdminEnquiryCommon';
import { isCancelled, bookingStateBadge, attendanceBadge } from './AdminEnquiriesShared';
import ContactOutcomeModal from './AdminContactOutcomeModal';
import type { ContactOutcomeResult } from './AdminContactOutcomeModal';
import MarkPaidModal, { emptyMarkPaidForm, type MarkPaidForm } from './AdminMarkPaidModal';
import GenerateInvoiceModal from './AdminGenerateInvoiceModal';
import { useGenerateInvoice } from './useGenerateInvoice';

const emptyPaymentForm: PaymentForm = {
  package_type: 'normal', total_amount: '', amount_paid: '', payment_type: 'advance', status: 'paid', payment_method: '', payment_utr: '', refund_amount: '',
  refund_method: '', refund_utr: '', refund_date: '', refund_notes: '', food_preference: '',
};

type EditDetailsForm = {
  full_name: string;
  email: string;
  phone: string;
  city: string;
  age: number | '';
  trip_id: string;
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
  }, [enquiry?.id]);

  // Activity Timeline (CRM spec section 14) — re-fetched every time `load()`
  // sets a fresh `enquiry` object, same trigger as the payments effect
  // above, so any action taken on this page (which all call load()
  // afterward) picks up its own just-written log entry without a manual
  // refresh.
  useEffect(() => {
    if (!enquiry) {
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
  }, [enquiry?.id, enquiry?.updated_at]);

  // Fixed lookup for a specific package (used once the admin has picked
  // Early Bird / Normal explicitly in the Track Payment modal).
  const getTripPrice = (tripId: string | undefined, packageType: Enquiry['package_type']): number | undefined => {
    const trip = trips.find(t => t.id === tripId);
    if (!trip) return undefined;
    const price = packageType === 'early_bird' ? trip.early_bird_price : trip.price;
    return price ?? undefined;
  };

  // Which price is *currently* live for this enquiry's trip, worked out
  // from today's date against the trip's early-bird deadline — same rule
  // the public site uses to decide what a new visitor gets quoted. This is
  // what a fresh enquiry (no total_amount recorded yet) should default to,
  // instead of showing "Not set" until someone manually types a number in.
  const activePricing = enquiry ? getTripActivePricing(trips.find(t => t.id === enquiry.trip_id)) : null;

  // ---- Track Payment modal --------------------------------------------
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState<PaymentForm>(emptyPaymentForm);
  const [savingPayment, setSavingPayment] = useState(false);
  // Live, field-level errors for the Track Payment modal below — recomputed
  // every render so a bad amount, a missing payment method, etc. show up
  // the moment it's entered/selected, instead of only surfacing behind an
  // alert() after Save. Same shared validator AdminPaymentModal uses.
  const paymentErrors = paymentOpen ? validatePaymentForm(paymentForm, enquiry?.amount_paid || 0) : {};
  const hasPaymentErrors = Object.keys(paymentErrors).length > 0;
  const paymentErrorClass = 'text-red-500 text-xs mt-1';
  const [togglingNoShow, setTogglingNoShow] = useState(false);

  // 'Balance' is only meant for the payment that actually zeroes out the
  // amount due — if the admin picked it and then edits the amount (or
  // total) so it no longer does, drop back to 'Installment' rather than
  // leaving 'Balance' selected but no longer true. See clearsBalance in
  // AdminEnquiryCommon.
  useEffect(() => {
    if (!enquiry) return;
    if (paymentForm.payment_type === 'balance' && !clearsBalance(paymentForm, enquiry.amount_paid || 0)) {
      setPaymentForm(f => ({ ...f, payment_type: 'installment' }));
    }
  }, [enquiry, paymentForm]);

  const openPayment = () => {
    if (!enquiry) return;
    // If the enquiry already has a package/total_amount on record, keep it
    // — an admin's already-tracked payment shouldn't silently jump to a
    // different price just because the early-bird window has since closed.
    // Only a brand-new payment (nothing recorded yet) auto-picks whichever
    // price is live right now.
    const packageType = enquiry.package_type || activePricing?.packageType || 'normal';
    const suggested = enquiry.total_amount ?? getTripPrice(enquiry.trip_id, packageType) ?? activePricing?.amount;
    setPaymentForm({
      package_type: packageType,
      total_amount: suggested ?? '',
      // Blank, not enquiry.amount_paid — same reasoning as AdminEnquiries'
      // openPayment: this field is this-payment's-own-amount now, matching
      // Generate Invoice, not a running total to edit down to.
      amount_paid: '',
      payment_type: 'advance',
      status: 'paid',
      payment_method: '',
      payment_utr: '',
      refund_amount: enquiry.is_no_show ? 0 : enquiry.refund_amount ?? 0,
      refund_method: '',
      refund_utr: '',
      refund_date: '',
      refund_notes: '',
      food_preference: enquiry.food_preference === 'veg' || enquiry.food_preference === 'non_veg' ? enquiry.food_preference : '',
    });
    setPaymentOpen(true);
  };

  // ---- Edit Details modal (fixing wrong name/contact/trip) --------------
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<EditDetailsForm>({ full_name: '', email: '', phone: '', city: '', age: '', trip_id: '' });
  const [savingEdit, setSavingEdit] = useState(false);
  // Which fields have been blurred yet — same reasoning as the Track
  // Payment / Generate Invoice modals: full_name/phone are required, but
  // showing that the instant the modal opens (before the admin has even
  // looked at the field) would be premature, especially since this modal
  // usually opens pre-filled from the existing enquiry.
  const [editTouched, setEditTouched] = useState<Set<string>>(new Set());
  const editErrors: { full_name?: string; phone?: string } = {};
  if (!editForm.full_name.trim()) editErrors.full_name = 'Full name is required.';
  if (!editForm.phone.trim()) editErrors.phone = 'Phone number is required.';
  const hasEditErrors = !!(editErrors.full_name || editErrors.phone);

  const openEdit = () => {
    if (!enquiry) return;
    setEditForm({
      full_name: enquiry.full_name || '',
      email: enquiry.email || '',
      phone: enquiry.phone || '',
      city: enquiry.city || '',
      age: enquiry.age ?? '',
      trip_id: enquiry.trip_id || '',
    });
    setEditTouched(new Set());
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!enquiry) return;
    // Live in the modal already, plus this defense-in-depth gate in case
    // Save is reached some other way — same editErrors computed above, so
    // the two can never drift.
    if (editErrors.full_name || editErrors.phone) {
      alert(editErrors.full_name || editErrors.phone || 'Please fix the highlighted fields.');
      return;
    }
    try {
      setSavingEdit(true);
      const newTrip = editForm.trip_id ? trips.find(t => t.id === editForm.trip_id) : undefined;
      const updated = await updateEnquiryDetails(enquiry.id, {
        full_name: editForm.full_name,
        email: editForm.email,
        phone: editForm.phone,
        city: editForm.city || null,
        age: editForm.age === '' ? null : Number(editForm.age),
        trip_id: editForm.trip_id || null,
        trip_title: editForm.trip_id ? (newTrip?.title ?? null) : null,
      });
      setEnquiry(updated);
      setEditOpen(false);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to save details.');
    } finally {
      setSavingEdit(false);
    }
  };

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

  // Extra Charge and Pending both raise their own invoice row via the same
  // services/api.ts functions Generate Invoice uses (addExtraCharge /
  // generatePendingInvoice) rather than moving amount_paid through
  // recordPayment's running-total math — see the matching handleSavePayment
  // in AdminEnquiries.tsx for the full reasoning; kept in sync with it.
  const handleSavePayment = async () => {
    if (!enquiry) return;
    const totalAmount = paymentForm.total_amount === '' ? null : Number(paymentForm.total_amount);
    const thisPayment = paymentForm.amount_paid === '' ? 0 : Number(paymentForm.amount_paid);
    const isExtraCharge = paymentForm.payment_type === 'extra_charge';
    const isPending = paymentForm.status === 'pending';
    const newRunningTotal = (enquiry.amount_paid || 0) + thisPayment;
    const refundAmount = paymentForm.refund_amount === '' ? 0 : Number(paymentForm.refund_amount);
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
          food_preference: paymentForm.food_preference || null,
        });
        updated = await addExtraCharge(updated, thisPayment, {
          collectedNow: !isPending,
          payment_method: paymentForm.payment_method || undefined,
          utr_number: paymentForm.payment_utr || undefined,
        });
      } else if (isPending) {
        updated = await recordPayment(enquiry, {
          amount_paid: enquiry.amount_paid || 0,
          total_amount: totalAmount,
          package_type: paymentForm.package_type,
          food_preference: paymentForm.food_preference || null,
        });
        if (thisPayment > 0) {
          // Not extra_charge in this branch (handled above), so this is
          // always one of the four types generatePendingInvoice accepts.
          await generatePendingInvoice(enquiry.id, paymentForm.payment_type as 'full_payment' | 'advance' | 'balance' | 'installment', thisPayment);
        }
      } else {
        updated = await recordPayment(enquiry, {
          amount_paid: newRunningTotal,
          total_amount: totalAmount,
          package_type: paymentForm.package_type,
          food_preference: paymentForm.food_preference || null,
          payment_method: paymentForm.payment_method || undefined,
          utr_number: paymentForm.payment_utr || undefined,
          // Not extra_charge in this branch (handled above), so this is
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

  // ---- Generate Invoice modal -------------------------------------------
  // Shared with the Enquiries list page — see useGenerateInvoice for why
  // the state/save logic lives there instead of being duplicated here.
  const generateInvoice = useGenerateInvoice(async updated => {
    setEnquiry(updated);
    getPaymentsForEnquiry(updated.id).then(setPayments).catch(console.error);
  });
  const [invoiceRowBusyId, setInvoiceRowBusyId] = useState<string | null>(null);
  const [markPaidTarget, setMarkPaidTarget] = useState<Payment | null>(null);
  const [markPaidForm, setMarkPaidForm] = useState<MarkPaidForm>(emptyMarkPaidForm);
  const [savingMarkPaid, setSavingMarkPaid] = useState(false);

  const handleMarkInvoicePaid = (payment: Payment) => {
    setMarkPaidForm(emptyMarkPaidForm);
    setMarkPaidTarget(payment);
  };

  const handleConfirmMarkPaid = async () => {
    if (!markPaidTarget) return;
    const payment = markPaidTarget;
    try {
      setSavingMarkPaid(true);
      setInvoiceRowBusyId(payment.id);
      const updatedPayment = await markInvoicePaid(payment.id, {
        payment_method: markPaidForm.payment_method || undefined,
        utr_number: markPaidForm.utr_number || undefined,
      });
      setPayments(prev => prev.map(p => (p.id === updatedPayment.id ? updatedPayment : p)));
      setEnquiry(prev => {
        if (!prev) return prev;
        const isRefund = updatedPayment.payment_type === 'refund';
        return { ...prev, amount_paid: (prev.amount_paid || 0) + (isRefund ? 0 : updatedPayment.amount) };
      });
      setMarkPaidTarget(null);
      load();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to mark invoice as paid.');
    } finally {
      setInvoiceRowBusyId(null);
      setSavingMarkPaid(false);
    }
  };

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

  const jb = journeyBadge(enquiry);
  const nma = nextManualAction(enquiry);
  const srcCfg = SOURCE_CONFIG[enquiry.source] || SOURCE_CONFIG.other;
  const food = foodBadge(enquiry);
  const isGeneralContactMessage = !enquiry.trip_id && enquiry.source === 'website';

  const rowActions: ActionMenuItem[] = [
    { label: 'Edit Details', icon: Pencil, onClick: openEdit },
  ];
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
  if (canSetFollowUp(enquiry)) {
    rowActions.push(
      enquiry.follow_up_at
        ? { label: 'Edit Follow-up Date', icon: CalendarClock, onClick: handleOpenFollowUp }
        : { label: 'Set Follow-up Reminder', icon: CalendarClock, onClick: handleOpenFollowUp }
    );
    if (enquiry.follow_up_at) {
      rowActions.push({ label: 'Clear Follow-up', icon: X, onClick: handleClearFollowUp });
    }
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

        {/* Header */}
        <div className="bg-white rounded-lg shadow-card p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-display text-xl font-bold text-dark truncate">{enquiry.full_name}</h2>
              <div className="flex items-center flex-wrap gap-1.5 mt-1.5">
                <span title={`Booking Journey: ${jb.label}`} className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap ${jb.color}`}>
                  <jb.icon size={12} className="shrink-0" aria-hidden="true" /> {jb.label}
                </span>
                {/* Booking State — independent of Booking Journey above, per
                    CRM spec section 3. Only shown once there's an actual
                    booking (cancelling a bare lead is "Not Interested", not
                    this), and only called out when Cancelled — "Active" is
                    the unremarkable default and would just add noise next to
                    a Journey badge that already implies it. */}
                {isCancelled(enquiry) && (
                  <span title="Booking State" className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap ${bookingStateBadge(enquiry).color}`}>
                    <XCircle size={12} className="shrink-0" aria-hidden="true" /> {bookingStateBadge(enquiry).label}
                  </span>
                )}
                {/* Attendance — independent of Journey/State, per CRM spec
                    section 4. Only shown once it's meaningful (checked in or
                    a recorded no-show); "Not Started" beforehand is implied
                    by the Journey badge not yet reaching Checked In. */}
                {(enquiry.checked_in_at || enquiry.is_no_show) && (
                  <span title="Attendance" className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap ${attendanceBadge(enquiry).color}`}>
                    <LogIn size={12} className="shrink-0" aria-hidden="true" /> {attendanceBadge(enquiry).label}
                  </span>
                )}
                {isNotInterested(enquiry) && (
                  <span title={closedReasonLabel(enquiry) ? `Closed — ${closedReasonLabel(enquiry)}` : 'Closed — this was just a query, no booking followed'} className="inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap bg-red-50 text-red-600">
                    <UserMinus size={12} className="shrink-0" aria-hidden="true" /> Not Interested{closedReasonLabel(enquiry) ? ` — ${closedReasonLabel(enquiry)}` : ''}
                  </span>
                )}
                {followUpStatus(enquiry) && (
                  <button
                    onClick={handleOpenFollowUp}
                    disabled={busyFollowUp}
                    title="Click to change the follow-up date"
                    className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap hover:opacity-80 transition-opacity disabled:opacity-50 ${followUpStatus(enquiry)!.color}`}
                  >
                    <CalendarClock size={12} className="shrink-0" aria-hidden="true" /> {followUpStatus(enquiry)!.label}
                  </button>
                )}
                {enquiry.group_size && enquiry.group_size > 1 ? (
                  <span className="inline-flex items-center gap-0.5 text-[11px] font-button font-semibold px-2 py-0.5 rounded-md whitespace-nowrap bg-slate-100 text-dark-muted">
                    <Users size={10} aria-hidden="true" /> Group of {enquiry.group_size} · seat {enquiry.group_seq}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 text-[11px] font-button font-semibold px-2 py-0.5 rounded-md whitespace-nowrap bg-slate-100 text-dark-muted">
                    <User size={10} aria-hidden="true" /> Solo
                  </span>
                )}
                <span className={`inline-flex items-center gap-0.5 text-[11px] font-button font-semibold px-2 py-0.5 rounded-md whitespace-nowrap ${food.color}`}>
                  <FoodMark type={foodPreferenceKey(enquiry)} size={10} /> {food.label}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 min-w-0">
              {nma && (
                <Button variant="primary" size="sm" onClick={handleAdvance} disabled={busyAction}>
                  <nma.icon size={14} aria-hidden="true" /> {nma.label}
                </Button>
              )}
              {canMarkNotInterested(enquiry) && (
                <Button variant="outline" size="sm" onClick={handleMarkNotInterested} disabled={busyAction || busyStatus}>
                  <UserMinus size={14} aria-hidden="true" /> Not Interested
                </Button>
              )}
              {/* When there's no booking yet, Follow-up + the 3-dot menu stay
                  here at the top of the header. Once a booking exists, they
                  move down next to the Booking ID row directly below the
                  header instead. */}
              {!enquiry.booking_id && (
                <>
                  {canSetFollowUp(enquiry) && !followUpStatus(enquiry) && (
                    <Button variant="outline" size="sm" onClick={handleOpenFollowUp} disabled={busyAction || busyFollowUp}>
                      <CalendarClock size={14} aria-hidden="true" /> Set Follow-up
                    </Button>
                  )}
                  <ActionsMenu items={rowActions} disabled={busyAction || busyStatus} />
                </>
              )}
            </div>
          </div>

          {/* Booking ID, moved up here (right below the name/badges row),
              with Follow-up + the 3-dot actions menu alongside it — used to
              live inside the Booking Journey card below, but that pushed it
              too far from the header for how often it's referenced. */}
          {enquiry.booking_id && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-background-warm">
              <div className="min-w-0">
                <p className="text-dark-muted text-xs">Booking ID</p>
                <div className="flex items-center gap-1.5">
                  <p className="text-dark text-sm font-mono truncate">{enquiry.booking_id}</p>
                  <button
                    type="button"
                    onClick={handleCopyBookingId}
                    aria-label="Copy Booking ID"
                    title="Copy Booking ID"
                    className="shrink-0 p-1 rounded text-dark-muted hover:text-primary hover:bg-background-warm transition-colors"
                  >
                    {bookingIdCopied ? <Check size={13} className="text-green-600" aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 min-w-0">
                {canSetFollowUp(enquiry) && !followUpStatus(enquiry) && (
                  <Button variant="outline" size="sm" onClick={handleOpenFollowUp} disabled={busyAction || busyFollowUp}>
                    <CalendarClock size={14} aria-hidden="true" /> Set Follow-up
                  </Button>
                )}
                <ActionsMenu items={rowActions} disabled={busyAction || busyStatus} />
              </div>
            </div>
          )}
        </div>

        {/* Booking Journey */}
        {enquiry.booking_id && (
          <div className="bg-white rounded-lg shadow-card p-4 sm:p-5 space-y-3">
            <p className="text-dark text-sm font-button font-semibold">Booking Journey</p>
            <BookingLifecycleStepper enquiry={enquiry} />
            <div className="grid grid-cols-3 gap-2 bg-background-warm rounded-md px-3 py-2.5">
              <div>
                <p className="text-dark-muted text-[11px]">Total</p>
                <p className="text-dark text-sm font-semibold">{formatPrice(enquiry.total_amount || 0)}</p>
              </div>
              <div>
                <p className="text-dark-muted text-[11px]">Paid</p>
                <p className="text-green-700 text-sm font-semibold">{formatPrice(enquiry.amount_paid || 0)}</p>
              </div>
              <div>
                <p className="text-dark-muted text-[11px]">Pending</p>
                <p className="text-amber-600 text-sm font-semibold">
                  {formatPrice(Math.max(0, (enquiry.total_amount || 0) - (enquiry.amount_paid || 0)))}
                </p>
              </div>
            </div>

            <div className={`grid gap-2 ${enquiry.booking_status && enquiry.booking_status !== 'cancelled' && enquiry.booking_status !== 'completed' ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <Button variant="outline" size="sm" fullWidth onClick={openPayment}>
                <IndianRupee size={13} aria-hidden="true" /> Payment
              </Button>
              {enquiry.booking_status && enquiry.booking_status !== 'cancelled' && enquiry.booking_status !== 'completed' && (
                <Button variant="primary" size="sm" fullWidth onClick={handleMarkCompleted} disabled={busyAction}>
                  <CheckCircle2 size={13} aria-hidden="true" /> Complete Trip
                </Button>
              )}
            </div>
          </div>
        )}
        {!enquiry.booking_id && (
          <div className="bg-white rounded-lg shadow-card p-4 sm:p-5 flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-dark-muted text-sm">No payment recorded yet — no booking exists on this enquiry.</p>
              {activePricing ? (
                <p className="text-xs text-dark-muted mt-1 flex items-center gap-1">
                  {activePricing.isEarlyBird && <Bird size={12} className="shrink-0 text-purple-600" aria-hidden="true" />}
                  Current price for this trip: <span className="font-semibold text-dark">{formatPrice(activePricing.amount)}</span>
                  {' '}({activePricing.isEarlyBird ? 'Early Bird' : 'Normal'}
                  {activePricing.isEarlyBird && activePricing.deadline ? ` · ends ${formatDate(activePricing.deadline, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''})
                  — auto-filled when you track payment.
                </p>
              ) : enquiry.trip_id && (
                <p className="text-xs text-dark-muted mt-1">This trip has no price set yet — set one in Admin → Trips first.</p>
              )}
            </div>
            <Button variant="primary" size="sm" onClick={openPayment}>
              <IndianRupee size={13} aria-hidden="true" /> Payment
            </Button>
          </div>
        )}

        {/* Invoices / payment ledger */}
        {enquiry.booking_id && (
          <div className="bg-white rounded-lg shadow-card">
            <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3 border-b border-background-warm">
              <p className="text-dark text-sm font-button font-semibold flex items-center gap-1.5">
                <FileText size={14} className="shrink-0" aria-hidden="true" /> Invoices &amp; Payments
              </p>
              <Button variant="primary" size="sm" onClick={() => generateInvoice.open(enquiry)}>
                <Plus size={13} aria-hidden="true" /> Add Invoice
              </Button>
            </div>
            {paymentsLoading ? (
              <p className="text-dark-muted text-xs px-4 sm:px-5 py-4">Loading…</p>
            ) : payments.length === 0 ? (
              <p className="text-dark-muted text-xs px-4 sm:px-5 py-4">No invoices generated yet.</p>
            ) : (
              <>
                <ul className="divide-y divide-background-warm">
                  {(showAllInvoices ? payments : payments.slice(0, 3)).map(inv => {
                    const isRefund = inv.payment_type === 'refund';
                    const isPending = inv.status === 'pending';
                    return (
                      <li key={inv.id} className="flex items-center justify-between gap-2 px-4 sm:px-5 py-2.5">
                        <div className="min-w-0">
                          <p className="text-dark text-xs font-mono truncate">{inv.invoice_number || '—'}</p>
                          <p className="text-dark-muted text-[11px]">
                            {INVOICE_TYPE_LABEL[inv.payment_type] ?? inv.payment_type} · {formatDate(inv.paid_at, { day: 'numeric', month: 'short', year: 'numeric' })}
                            {inv.payment_method ? ` · ${inv.payment_method}` : ''}
                            {inv.utr_number ? ` · UTR ${inv.utr_number}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-sm font-semibold ${isRefund ? 'text-red-600' : 'text-dark'}`}>
                            {isRefund ? '− ' : ''}{formatPrice(Math.abs(inv.amount))}
                          </span>
                          <span className={`inline-flex items-center gap-0.5 text-[10px] font-button font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                            isPending ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                          }`}>
                            <BadgeCheck size={10} aria-hidden="true" /> {isPending ? 'Pending' : 'Paid'}
                          </span>
                          {isPending && (
                            <Button variant="primary" size="sm" onClick={() => handleMarkInvoicePaid(inv)} disabled={invoiceRowBusyId === inv.id}>
                              Mark Paid
                            </Button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {/* Only show 3 invoices by default; "View All Invoices"
                    expands the rest in place, like a read-more. */}
                {!showAllInvoices && payments.length > 3 && (
                  <button
                    onClick={() => setShowAllInvoices(true)}
                    className="w-full text-center text-primary text-xs font-button font-semibold px-4 sm:px-5 py-2.5 border-t border-background-warm hover:bg-background-warm transition-colors"
                  >
                    View All Invoices ({payments.length}) &gt;
                  </button>
                )}
              </>
            )}
          </div>
        )}

        </div>{/* /main column */}

        <div className="lg:col-span-1 space-y-4 min-w-0">

        {/* Traveller & trip info — an avatar-icon'd contact row up top
            (email + phone, each with a circular icon badge, plus the
            WhatsApp/call/email quick-links riding alongside), then two
            divider-separated 3-across rows for the rest. Matches the sidebar
            card's ~1/3-page width: each cell truncates/wraps rather than
            forcing the row wider. */}
        <div className="bg-white rounded-lg shadow-card p-4 sm:p-5">
          <p className="text-dark text-base font-display font-bold mb-4 flex items-center gap-2">
            <User size={18} className="shrink-0 text-dark-muted" aria-hidden="true" /> Traveller &amp; Trip
          </p>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pb-4 border-b border-background-warm">
            <div className="min-w-0">
              <p className="text-dark-muted text-xs">Email</p>
              <p className="text-dark text-sm font-semibold truncate">{enquiry.email}</p>
            </div>
            <div className="min-w-0">
              <p className="text-dark-muted text-xs">Phone</p>
              <p className="text-dark text-sm font-semibold truncate">{enquiry.phone}</p>
            </div>
            <ContactQuickLinks phone={enquiry.phone} email={enquiry.email} name={enquiry.full_name} tripTitle={enquiry.trip_title} size="md" />
          </div>

          <div className="grid grid-cols-3 gap-x-4 gap-y-3 py-4 border-b border-background-warm text-sm">
            <div className="min-w-0">
              <p className="text-dark-muted text-xs">Trip</p>
              <p className="text-dark font-semibold">
                {enquiry.trip_id ? enquiry.trip_title : (
                  <span className="text-dark-muted italic font-normal">
                    {isGeneralContactMessage ? 'None — Contact Us message' : 'None — logged without a trip'}
                  </span>
                )}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-dark-muted text-xs">City</p>
              <p className="text-dark font-semibold truncate">{enquiry.city || '—'}</p>
            </div>
            <div className="min-w-0">
              <p className="text-dark-muted text-xs">Age</p>
              <p className="text-dark font-semibold truncate">{enquiry.age ?? '—'}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 pt-4 text-sm">
            <div className="min-w-0">
              <p className="text-dark-muted text-xs">Source</p>
              <p className="text-dark font-semibold truncate inline-flex items-center gap-1">
                <srcCfg.icon size={12} className="shrink-0" aria-hidden="true" /> {srcCfg.label}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-dark-muted text-xs">Package</p>
              <p className="text-dark font-semibold truncate">{PACKAGE_CONFIG[enquiry.package_type || 'normal'].label}</p>
            </div>
            <div className="min-w-0 col-span-2 sm:col-span-1">
              <p className="text-dark-muted text-xs">Date &amp; Time</p>
              <p className="text-dark font-semibold">
                {formatDate(enquiry.created_at, { day: 'numeric', month: 'short', year: 'numeric' })} · {formatTime(enquiry.created_at)}
              </p>
            </div>
          </div>

          {enquiry.message && (
            <div className="mt-4 pt-4 border-t border-background-warm">
              <p className="text-dark-muted text-xs mb-1">Message</p>
              <p className="text-dark text-sm whitespace-pre-wrap">{enquiry.message}</p>
            </div>
          )}
        </div>

        {/* Activity Timeline — CRM spec section 14. Every meaningful action
            taken on this enquiry, chronological, oldest first, nothing
            editable or removable (see activity_log's RLS: no UPDATE/DELETE
            policy exists at all). Sits below Traveller & Trip in the same
            sidebar column, so its scroll cap is taller than before — it's
            no longer competing with a wide main column for vertical rhythm. */}
        <div className="bg-white rounded-lg shadow-card p-4 sm:p-5">
          <p className="text-dark text-sm font-button font-semibold mb-3 flex items-center gap-1.5">
            <History size={14} className="shrink-0" aria-hidden="true" /> Activity Timeline
          </p>
          {activityLogLoading ? (
            <p className="text-dark-muted text-xs">Loading…</p>
          ) : activityLog.length === 0 ? (
            <p className="text-dark-muted text-xs bg-background-warm rounded-md px-3 py-2">No activity logged yet.</p>
          ) : (
            <ol className="relative border-l-2 border-[#D9C7AC] pl-4 space-y-4 max-h-[600px] overflow-y-auto">
              {activityLog.map(entry => (
                <li key={entry.id} className="relative">
                  <span className="absolute -left-[21px] top-1 z-10 w-3 h-3 rounded-full bg-primary border-2 border-white shadow-sm" />
                  <p className="text-dark text-sm font-medium">{entry.action}</p>
                  {entry.details && <p className="text-dark-muted text-xs mt-0.5">{entry.details}</p>}
                  <p className="text-dark-muted text-[11px] mt-0.5">
                    {formatDate(entry.created_at, { day: 'numeric', month: 'short', year: 'numeric' })} · {formatTime(entry.created_at)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>

        </div>{/* /sidebar column */}
        </div>{/* /grid */}
      </div>

      {/* Track Payment modal */}
      <Modal isOpen={paymentOpen} onClose={() => setPaymentOpen(false)} title="Payment" size="sm">
        <div className="space-y-4">
          <div>
            <label htmlFor="ed-pay-food" className="block text-sm font-medium text-dark mb-1">Food Preference</label>
            <Select
              inputId="ed-pay-food"
              value={paymentForm.food_preference}
              onChange={val => setPaymentForm(f => ({ ...f, food_preference: val as PaymentForm['food_preference'] }))}
              options={FOOD_PREFERENCE_OPTIONS}
            />
          </div>
          <div>
            <label htmlFor="ed-pay-package" className="block text-sm font-medium text-dark mb-1">Package</label>
            <Select
              inputId="ed-pay-package"
              value={paymentForm.package_type}
              onChange={val => {
                const packageType = val as Enquiry['package_type'];
                const suggested = getTripPrice(enquiry.trip_id, packageType);
                setPaymentForm(f => ({ ...f, package_type: packageType, total_amount: suggested ?? f.total_amount }));
              }}
              options={PACKAGE_OPTIONS}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="ed-pay-total" className="block text-sm font-medium text-dark mb-1">Total Amount (₹)</label>
              <input
                id="ed-pay-total"
                type="number"
                min={0}
                value={paymentForm.payment_type === 'extra_charge' ? '' : paymentForm.total_amount}
                disabled={paymentForm.payment_type === 'extra_charge'}
                onChange={e => setPaymentForm(f => ({ ...f, total_amount: parseNonNegative(e.target.value) }))}
                className={`w-full px-3 py-2 rounded-md border-2 border-background-warm bg-white text-sm focus:border-primary outline-none ${paymentForm.payment_type === 'extra_charge' ? 'opacity-60 cursor-not-allowed' : ''}`}
                placeholder={paymentForm.payment_type === 'extra_charge' ? 'Updates automatically' : 'e.g. 15000'}
              />
            </div>
            <div>
              <label htmlFor="ed-pay-amount-paid" className="block text-sm font-medium text-dark mb-1">
                {paymentForm.payment_type === 'extra_charge' ? 'Extra Charge Amount (₹)' : 'Amount Being Paid Now (₹)'}
              </label>
              <input
                id="ed-pay-amount-paid"
                type="number"
                min={0}
                value={paymentForm.amount_paid}
                onChange={e => setPaymentForm(f => ({ ...f, amount_paid: parseNonNegative(e.target.value) }))}
                aria-invalid={!!paymentErrors.amount_paid}
                aria-describedby={paymentErrors.amount_paid ? 'ed-pay-amount-paid-error' : undefined}
                className="w-full px-3 py-2 rounded-md border-2 border-background-warm bg-white text-sm focus:border-primary outline-none"
                placeholder="e.g. 5000"
              />
              {paymentErrors.amount_paid && <p id="ed-pay-amount-paid-error" role="alert" className={paymentErrorClass}>{paymentErrors.amount_paid}</p>}
            </div>
          </div>

          {/* This transaction's own amount + a manually-picked type — same
              shape as Generate Invoice, rather than a running total the
              label gets inferred from. */}
          <div>
            <label htmlFor="ed-pay-type" className="block text-sm font-medium text-dark mb-1">Payment Type</label>
            <Select
              inputId="ed-pay-type"
              value={paymentForm.payment_type}
              onChange={val => setPaymentForm(f => ({ ...f, payment_type: val as PaymentForm['payment_type'] }))}
              options={availablePaymentTypeOptions(paymentForm, enquiry.amount_paid || 0)}
            />
            {paymentForm.payment_type === 'extra_charge' && (
              <p className="text-[11px] text-dark-muted mt-1">
                Adds this amount on top of the booking's total amount right away — e.g. a hotel upgrade — whether or not it's collected now.
              </p>
            )}
            {paymentForm.payment_type !== 'extra_charge' && !clearsBalance(paymentForm, enquiry.amount_paid || 0) && (
              <p className="text-[11px] text-dark-muted mt-1">
                'Balance' will appear here once the amount above clears what's still owed.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="ed-pay-status" className="block text-sm font-medium text-dark mb-1">Status</label>
            <Select
              inputId="ed-pay-status"
              value={paymentForm.status}
              onChange={val => setPaymentForm(f => ({ ...f, status: val as PaymentForm['status'] }))}
              options={GENERATE_INVOICE_STATUS_OPTIONS}
            />
          </div>

          {paymentForm.status === 'paid' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="ed-pay-method" className="block text-sm font-medium text-dark mb-1">Payment Method</label>
                <Select
                  inputId="ed-pay-method"
                  value={paymentForm.payment_method}
                  onChange={val => setPaymentForm(f => ({ ...f, payment_method: val, payment_utr: val === 'Cash' ? '' : f.payment_utr }))}
                  options={PAYMENT_METHOD_OPTIONS}
                  placeholder="Select method"
                />
                {paymentErrors.payment_method && <p role="alert" className={paymentErrorClass}>{paymentErrors.payment_method}</p>}
              </div>
              <div>
                <label htmlFor="ed-pay-utr" className="block text-sm font-medium text-dark mb-1">UTR / Reference</label>
                <input
                  id="ed-pay-utr"
                  type="text"
                  value={paymentForm.payment_utr}
                  disabled={paymentForm.payment_method === 'Cash'}
                  onChange={e => setPaymentForm(f => ({ ...f, payment_utr: e.target.value }))}
                  className={`w-full px-3 py-2 rounded-md border-2 border-background-warm bg-white text-sm focus:border-primary outline-none ${paymentForm.payment_method === 'Cash' ? 'opacity-60 cursor-not-allowed' : ''}`}
                  placeholder={paymentForm.payment_method === 'Cash' ? 'N/A for cash' : 'e.g. 426817XXXXXX'}
                />
                {paymentErrors.payment_utr && <p role="alert" className={paymentErrorClass}>{paymentErrors.payment_utr}</p>}
              </div>
            </div>
          )}

          {(() => {
            const alreadyPaid = enquiry.amount_paid || 0;
            const thisPayment = paymentForm.amount_paid === '' ? 0 : Number(paymentForm.amount_paid);
            const isExtraCharge = paymentForm.payment_type === 'extra_charge';
            const isPending = paymentForm.status === 'pending';
            const projectedTotal = isPending ? alreadyPaid : alreadyPaid + thisPayment;
            const projectedBookingTotal = isExtraCharge && paymentForm.total_amount !== ''
              ? Number(paymentForm.total_amount) + thisPayment
              : paymentForm.total_amount === '' ? null : Number(paymentForm.total_amount);
            return (
              <p className="text-sm text-dark-muted">
                Already paid <span className="font-medium text-dark">{formatPrice(alreadyPaid)}</span>
                {thisPayment > 0 && !isPending && <> · after this payment: <span className="font-semibold text-dark">{formatPrice(projectedTotal)}</span></>}
                {thisPayment > 0 && isPending && <> · <span className="font-semibold text-amber-700">{formatPrice(thisPayment)} raised as pending</span>, not yet counted as paid</>}
                {isExtraCharge && thisPayment > 0 && <> · booking total will rise by <span className="font-semibold text-dark">{formatPrice(thisPayment)}</span></>}
                {projectedBookingTotal != null && (
                  <> · Balance due: <span className="font-semibold text-dark">{formatPrice(Math.max(0, projectedBookingTotal - projectedTotal))}</span></>
                )}
              </p>
            );
          })()}

          <div>
            <label className="block text-sm font-medium text-dark mb-1">Payment History</label>
            {paymentsLoading ? (
              <p className="text-xs text-dark-muted">Loading…</p>
            ) : payments.length === 0 ? (
              <p className="text-xs text-dark-muted bg-background-warm rounded-md px-3 py-2">No payments recorded yet.</p>
            ) : (
              <div className="border border-background-warm rounded-md divide-y divide-background-warm max-h-40 overflow-y-auto">
                {payments.map(p => (
                  <div key={p.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs">
                    <div className="min-w-0">
                      <p className="text-dark font-medium truncate">
                        {INVOICE_TYPE_LABEL[p.payment_type] || p.payment_type}
                        {p.status === 'pending' && <span className="text-amber-600 font-normal"> · pending</span>}
                      </p>
                      <p className="text-dark-muted">
                        {p.paid_at ? formatDate(p.paid_at, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not yet paid'}
                        {p.payment_method ? ` · ${p.payment_method}` : ''}
                      </p>
                    </div>
                    <p className={`shrink-0 font-semibold ${p.payment_type === 'refund' ? 'text-red-600' : 'text-green-700'}`}>
                      {p.payment_type === 'refund' ? '−' : ''}{formatPrice(p.amount)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {enquiry.cancelled_at && (
            <div className="bg-red-50 rounded-md p-3 space-y-2">
              <p className="text-red-700 text-xs font-medium">This booking is cancelled. Track any refund here as you process it.</p>
              <label className="flex items-start gap-2 text-xs text-dark cursor-pointer bg-white/60 rounded px-2 py-1.5">
                <input
                  type="checkbox"
                  checked={enquiry.is_no_show}
                  disabled={togglingNoShow}
                  onChange={ev => handleToggleNoShow(ev.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Mark as <span className="font-medium">no-show</span>
                  <span className="block text-[11px] text-dark-muted">No refund is given for no-shows, per policy — this locks the refund amount to ₹0.</span>
                </span>
              </label>
              {!enquiry.is_no_show && (
                <div>
                  <label htmlFor="ed-refund-amount" className="block text-sm font-medium text-dark mb-1">Refund Amount (₹)</label>
                  <input
                    id="ed-refund-amount"
                    type="number"
                    min={0}
                    value={paymentForm.refund_amount}
                    onChange={e => setPaymentForm(f => ({ ...f, refund_amount: parseNonNegative(e.target.value) }))}
                    aria-describedby={paymentErrors.refund_amount ? 'ed-refund-amount-error' : undefined}
                    className="w-full px-3 py-2 rounded-md border-2 border-background-warm bg-white text-sm focus:border-primary outline-none"
                    placeholder="How much has been refunded so far"
                  />
                  {paymentErrors.refund_amount && <p id="ed-refund-amount-error" role="alert" className={paymentErrorClass}>{paymentErrors.refund_amount}</p>}
                </div>
              )}
              {!enquiry.is_no_show && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="ed-refund-method" className="block text-sm font-medium text-dark mb-1">Refund Method</label>
                    <Select
                      inputId="ed-refund-method"
                      value={paymentForm.refund_method}
                      onChange={val => setPaymentForm(f => ({ ...f, refund_method: val, refund_utr: val === 'Cash' ? '' : f.refund_utr }))}
                      options={REFUND_METHOD_OPTIONS}
                      placeholder="Select method"
                      size="sm"
                    />
                    {paymentErrors.refund_method && <p role="alert" className={paymentErrorClass}>{paymentErrors.refund_method}</p>}
                  </div>
                  <div>
                    <label htmlFor="ed-refund-utr" className="block text-sm font-medium text-dark mb-1">Refund UTR / Reference</label>
                    <input
                      id="ed-refund-utr"
                      type="text"
                      value={paymentForm.refund_utr}
                      disabled={paymentForm.refund_method === 'Cash'}
                      onChange={e => setPaymentForm(f => ({ ...f, refund_utr: e.target.value }))}
                      className={`w-full px-3 py-2 rounded-md border-2 border-background-warm bg-white text-sm focus:border-primary outline-none ${paymentForm.refund_method === 'Cash' ? 'opacity-60 cursor-not-allowed' : ''}`}
                      placeholder={paymentForm.refund_method === 'Cash' ? 'N/A for cash' : 'e.g. 987654XXXX'}
                    />
                    {paymentErrors.refund_utr && <p role="alert" className={paymentErrorClass}>{paymentErrors.refund_utr}</p>}
                  </div>
                  <div className="col-span-2">
                    <label htmlFor="ed-refund-date" className="block text-sm font-medium text-dark mb-1">Refund Date</label>
                    <input
                      id="ed-refund-date"
                      type="date"
                      value={paymentForm.refund_date}
                      onChange={e => setPaymentForm(f => ({ ...f, refund_date: e.target.value }))}
                      className="w-full px-3 py-2 rounded-md border-2 border-background-warm bg-white text-sm focus:border-primary outline-none"
                    />
                  </div>
                </div>
              )}
              {!enquiry.is_no_show && (
                <div>
                  <label htmlFor="ed-refund-notes" className="block text-sm font-medium text-dark mb-1">Refund Notes (optional)</label>
                  <textarea
                    id="ed-refund-notes"
                    value={paymentForm.refund_notes}
                    onChange={e => setPaymentForm(f => ({ ...f, refund_notes: e.target.value }))}
                    rows={2}
                    className="w-full px-3 py-2 rounded-md border-2 border-background-warm bg-white text-sm focus:border-primary outline-none resize-none"
                    placeholder="e.g. partial refund after cancellation charges"
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="outline" size="md" onClick={() => setPaymentOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              size="md"
              onClick={handleSavePayment}
              loading={savingPayment}
              disabled={hasPaymentErrors}
              title={hasPaymentErrors ? 'Fix the highlighted fields before saving' : undefined}
            >
              Save Payment
            </Button>
          </div>
        </div>
      </Modal>

      {/* Generate Invoice modal — same component the Enquiries list uses. */}
      <GenerateInvoiceModal
        generateInvoiceTarget={generateInvoice.target}
        onClose={generateInvoice.close}
        generateInvoiceForm={generateInvoice.form}
        setGenerateInvoiceForm={generateInvoice.setForm}
        onSave={generateInvoice.save}
        savingInvoice={generateInvoice.saving}
        paymentHistory={payments}
        paymentHistoryLoading={paymentsLoading}
      />

      {/* Record Contact Outcome — the New -> Contacted entry point. */}
      <ContactOutcomeModal
        target={contactOutcomeOpen ? enquiry : null}
        onClose={() => setContactOutcomeOpen(false)}
        onSave={handleSaveContactOutcome}
        saving={savingContactOutcome}
      />

      <MarkPaidModal
        target={markPaidTarget}
        onClose={() => setMarkPaidTarget(null)}
        form={markPaidForm}
        setForm={setMarkPaidForm}
        onConfirm={handleConfirmMarkPaid}
        saving={savingMarkPaid}
      />

      {/* Not Interested reason picker — see handleMarkNotInterested above. */}
      <Modal isOpen={notInterestedOpen} onClose={() => setNotInterestedOpen(false)} title="Mark as Not Interested" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-dark-muted">
            This closes the enquiry as a query that went nowhere — no booking was made. You can reopen it later if they get back in touch.
          </p>
          <div>
            <label htmlFor="ed-not-interested-reason" className="block text-sm font-medium text-dark mb-1">Reason</label>
            <Select
              inputId="ed-not-interested-reason"
              value={closedReason}
              onChange={val => setClosedReason(val as ClosedReason)}
              options={NOT_INTERESTED_REASON_OPTIONS}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" size="md" onClick={() => setNotInterestedOpen(false)}>Cancel</Button>
            <Button variant="primary" size="md" onClick={handleConfirmNotInterested} loading={busyStatus}>Mark Not Interested</Button>
          </div>
        </div>
      </Modal>

      {/* Follow-up reminder date picker — see handleOpenFollowUp above. */}
      <Modal isOpen={followUpOpen} onClose={() => setFollowUpOpen(false)} title="Set Follow-up Reminder" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-dark-muted">
            {enquiry.follow_up_at
              ? 'This lead is still warm — update when to check back in.'
              : "This lead is still warm but not ready to close either way — pick a date to check back in. It'll show as due on that day, and clears automatically once this lead moves past Contacted."}
          </p>
          <div>
            <label htmlFor="ed-followup-date" className="block text-sm font-medium text-dark mb-1">Follow-up Date</label>
            <DatePicker id="ed-followup-date" value={followUpDate} onChange={setFollowUpDate} />
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" size="md" onClick={() => setFollowUpOpen(false)}>Cancel</Button>
            <Button variant="primary" size="md" onClick={handleSaveFollowUp} disabled={!followUpDate} loading={busyFollowUp}>Save</Button>
          </div>
        </div>
      </Modal>

      {/* Edit Details modal — fixes wrong name/contact/trip entered for the
          wrong person. Deliberately doesn't touch money/status/journey. */}
      <Modal isOpen={editOpen} onClose={() => setEditOpen(false)} title="Edit Details" size="sm">
        <div className="space-y-4">
          <p className="text-xs text-dark-muted -mt-1">
            Fixes who this enquiry is actually about. Doesn't affect payments, status, or booking journey.
          </p>
          <div>
            <label htmlFor="ed-edit-name" className="block text-sm font-medium text-dark mb-1">Full Name</label>
            <input
              id="ed-edit-name"
              type="text"
              value={editForm.full_name}
              onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))}
              onBlur={() => setEditTouched(prev => new Set(prev).add('full_name'))}
              aria-describedby={editTouched.has('full_name') && editErrors.full_name ? 'ed-edit-name-error' : undefined}
              className="w-full px-3 py-2 rounded-md border-2 border-background-warm bg-white text-sm focus:border-primary outline-none"
              placeholder="e.g. Priya Sharma"
            />
            {editTouched.has('full_name') && editErrors.full_name && <p id="ed-edit-name-error" role="alert" className="text-red-500 text-xs mt-1">{editErrors.full_name}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="ed-edit-phone" className="block text-sm font-medium text-dark mb-1">Phone</label>
              <input
                id="ed-edit-phone"
                type="tel"
                value={editForm.phone}
                onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                onBlur={() => setEditTouched(prev => new Set(prev).add('phone'))}
                aria-describedby={editTouched.has('phone') && editErrors.phone ? 'ed-edit-phone-error' : undefined}
                className="w-full px-3 py-2 rounded-md border-2 border-background-warm bg-white text-sm focus:border-primary outline-none"
                placeholder="e.g. 98765 43210"
              />
              {editTouched.has('phone') && editErrors.phone && <p id="ed-edit-phone-error" role="alert" className="text-red-500 text-xs mt-1">{editErrors.phone}</p>}
            </div>
            <div>
              <label htmlFor="ed-edit-email" className="block text-sm font-medium text-dark mb-1">Email</label>
              <input
                id="ed-edit-email"
                type="email"
                value={editForm.email}
                onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                className="w-full px-3 py-2 rounded-md border-2 border-background-warm bg-white text-sm focus:border-primary outline-none"
                placeholder="Optional"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="ed-edit-city" className="block text-sm font-medium text-dark mb-1">City</label>
              <input
                id="ed-edit-city"
                type="text"
                value={editForm.city}
                onChange={e => setEditForm(f => ({ ...f, city: e.target.value }))}
                className="w-full px-3 py-2 rounded-md border-2 border-background-warm bg-white text-sm focus:border-primary outline-none"
                placeholder="Optional"
              />
            </div>
            <div>
              <label htmlFor="ed-edit-age" className="block text-sm font-medium text-dark mb-1">Age</label>
              <input
                id="ed-edit-age"
                type="number"
                min={0}
                value={editForm.age}
                onChange={e => setEditForm(f => ({ ...f, age: e.target.value === '' ? '' : Number(e.target.value) }))}
                className="w-full px-3 py-2 rounded-md border-2 border-background-warm bg-white text-sm focus:border-primary outline-none"
                placeholder="Optional"
              />
            </div>
          </div>
          <div>
            <label htmlFor="ed-edit-trip" className="block text-sm font-medium text-dark mb-1">Trip</label>
            <Select
              inputId="ed-edit-trip"
              value={editForm.trip_id}
              onChange={val => setEditForm(f => ({ ...f, trip_id: val }))}
              options={[{ value: '', label: '— No specific trip —' }, ...trips.map(t => ({ value: t.id, label: t.title }))]}
            />
            {editForm.trip_id !== (enquiry.trip_id || '') && (
              <p className="text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1.5 mt-1.5">
                Changing the trip doesn't update an already-tracked total amount — open Payment afterwards to re-check the price for the new trip.
              </p>
            )}
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" size="md" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              size="md"
              onClick={() => {
                setEditTouched(new Set(['full_name', 'phone']));
                handleSaveEdit();
              }}
              loading={savingEdit}
              disabled={hasEditErrors}
              title={hasEditErrors ? 'Fix the highlighted fields before saving' : undefined}
            >
              Save Changes
            </Button>
          </div>
        </div>
      </Modal>

      {/* Cancel Booking modal */}
      <Modal isOpen={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel Booking" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-dark-muted">This frees up the seat immediately. Amount paid stays on record — track any refund via Payment afterwards.</p>
          <div>
            <label htmlFor="ed-cancel-reason" className="block text-sm font-medium text-dark mb-1">Cancellation Reason</label>
            <Select
              inputId="ed-cancel-reason"
              value={cancelReason}
              onChange={val => setCancelReason(val as CancellationReason | '')}
              options={CANCELLATION_REASON_OPTIONS}
              placeholder="Select a reason — optional"
            />
          </div>
          <div>
            <label htmlFor="ed-cancel-charges" className="block text-sm font-medium text-dark mb-1">Third-Party Charges (₹, optional)</label>
            <input
              id="ed-cancel-charges"
              type="number"
              min={0}
              value={cancelCharges}
              onChange={e => setCancelCharges(parseNonNegative(e.target.value))}
              className="w-full px-3 py-2 rounded-md border-2 border-background-warm bg-white text-sm focus:border-primary outline-none"
              placeholder="e.g. airline/hotel penalty"
            />
          </div>
          <label className="flex items-start gap-2 text-xs text-dark cursor-pointer bg-background-warm rounded px-2 py-1.5">
            <input type="checkbox" checked={cancelIsNoShow} onChange={e => setCancelIsNoShow(e.target.checked)} className="mt-0.5" />
            <span>
              This is a <span className="font-medium">no-show</span>
              <span className="block text-[11px] text-dark-muted">No refund is given for no-shows, per policy.</span>
            </span>
          </label>
          <div>
            <label htmlFor="ed-cancel-notes" className="block text-sm font-medium text-dark mb-1">Notes (optional)</label>
            <textarea
              id="ed-cancel-notes"
              value={cancelNotes}
              onChange={e => setCancelNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-md border-2 border-background-warm bg-white text-sm focus:border-primary outline-none resize-none"
              placeholder="Anything worth recording about this cancellation"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" size="md" onClick={() => setCancelOpen(false)}>Back</Button>
            <Button variant="primary" size="md" onClick={handleConfirmCancel} loading={cancelling}>Confirm Cancellation</Button>
          </div>
        </div>
      </Modal>
    </AdminLayout>
  );
}
