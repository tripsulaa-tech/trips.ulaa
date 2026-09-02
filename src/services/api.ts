// Barrel re-exporting every public API function from the domain modules in
// ./api/*.ts. Kept as a thin re-export layer (rather than inlining
// everything back into one file) so every existing `from '../services/api'`
// / `from './api'` import across the app keeps working unchanged, while the
// implementation itself lives in focused, per-domain files. See ./api/*.ts
// for the actual logic — this file intentionally has none of its own.
//
// Only the names that were exported from this file before the split are
// re-exported here (some domain modules export a couple of extra
// cross-module-only helpers — e.g. getWaitlistReservedCounts,
// isAgeNotEligibleError, logActivity — purely so sibling domain files can
// import them; those are deliberately NOT re-exported here, so the public
// surface of `services/api` is unchanged).

export {
  syncStartedTripAlbums,
  getUpcomingTrips,
  getUpcomingTripBySlug,
  getAllUpcomingTripsAdmin,
  createUpcomingTrip,
  updateUpcomingTrip,
  getTripDeletionImpact,
  deleteUpcomingTripCascade,
  getCompletedTrips,
  getCompletedTripBySlug,
  getAllCompletedTripsAdmin,
  likeCompletedTrip,
  unlikeCompletedTrip,
  createCompletedTrip,
  updateCompletedTrip,
  getCompletedTripDeletionImpact,
  deleteCompletedTripCascade,
} from './api/trips';

export {
  getGalleryImages,
  addGalleryImage,
  deleteGalleryImage,
  updateGalleryFeatured,
  updateGalleryOrder,
} from './api/gallery';

export {
  COVER_IMAGE_TARGET_SIZE_BYTES,
  uploadImage,
  uploadImageFromUrl,
  deleteImage,
  getStoragePathFromUrl,
  deleteImageByUrl,
} from './api/shared';

export {
  getActivityLog,
  submitEnquiry,
  submitContactEnquiry,
  submitGroupEnquiry,
  getTripSeatSnapshot,
  getEnquiries,
  updateEnquiryStatus,
  recordContactOutcome,
  updateEnquiryDetails,
  createManualEnquiry,
  setEnquiryFollowUp,
  setBookingFollowUp,
  checkInEnquiry,
  undoCheckInEnquiry,
  markEnquiryCompleted,
  recordPayment,
  recordKidsPayment,
  getPaymentsForEnquiry,
  getAllPayments,
  recordTypedPayment,
  generatePendingInvoice,
  addExtraCharge,
  markInvoicePaid,
  cancelEnquiry,
  setEnquiryNoShow,
  deleteEnquiry,
  uncancelEnquiry,
  recordRefund,
  getKidsForEnquiry,
  getKidsForEnquiries,
  createKidsForEnquiry,
  updateKid,
  updateKidStatus,
  bulkUpdateKidsStatus,
  setKidFollowUp,
  deleteKid,
  getAllKidsFoodPreferences,
  recordKidPayment,
  generateKidPendingInvoice,
  addExtraChargeForKid,
  getPaymentsForKid,
} from './api/enquiries';

export {
  submitWaitlist,
  getWaitlistEntries,
  updateWaitlistStatus,
  markWaitlistConverted,
  deleteWaitlistEntry,
} from './api/waitlist';

export {
  getTestimonials,
  getAllTestimonialsAdmin,
  createTestimonial,
  updateTestimonial,
  deleteTestimonial,
} from './api/testimonials';

export {
  getSiteContent,
  upsertSiteContent,
} from './api/siteContent';

export {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
} from './api/notifications';
