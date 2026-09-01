// Barrel re-exporting every export from the enquiries/*.ts domain files.
// Kept as a thin re-export layer (rather than inlining everything back into
// one file) so every existing `from './enquiries'` / `from './api/enquiries'`
// import across the app keeps working unchanged, while the implementation
// itself lives in focused, per-concern files. See ./enquiries/*.ts for the
// actual logic — this file intentionally has none of its own.
//
// isAgeNotEligibleError and logActivity are re-exported here (in addition
// to everything services/api.ts's own barrel re-exports) purely because
// waitlist.ts imports them from './enquiries' as cross-module-only helpers
// — see the comment in services/api.ts for why they're deliberately NOT
// re-exported from that outer barrel.

export {
  isAgeNotEligibleError,
} from './enquiries/shared';

export {
  logActivity,
  getActivityLog,
} from './enquiries/activity';

export {
  submitEnquiry,
  submitContactEnquiry,
  submitGroupEnquiry,
  getTripSeatSnapshot,
  createManualEnquiry,
} from './enquiries/create';

export {
  getEnquiries,
  updateEnquiryStatus,
  recordContactOutcome,
  updateEnquiryDetails,
  setEnquiryFollowUp,
  setBookingFollowUp,
  checkInEnquiry,
  undoCheckInEnquiry,
  markEnquiryCompleted,
  setEnquiryNoShow,
} from './enquiries/status';

export {
  recordPayment,
  recordKidsPayment,
  getPaymentsForEnquiry,
  getAllPayments,
} from './enquiries/payments';

export {
  recordTypedPayment,
  generatePendingInvoice,
  addExtraCharge,
  markInvoicePaid,
} from './enquiries/invoices';

export {
  cancelEnquiry,
  deleteEnquiry,
  uncancelEnquiry,
  recordRefund,
} from './enquiries/cancellation';

export {
  getKidsForEnquiry,
  createKidsForEnquiry,
  updateKid,
  updateKidStatus,
  bulkUpdateKidsStatus,
  setKidFollowUp,
  deleteKid,
  getAllKidsFoodPreferences,
} from './enquiries/kids';
