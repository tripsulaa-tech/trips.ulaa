import type { CancellationPolicy } from '../types';

// =============================================
// Default Cancellation Policy
// Pre-fills the "Cancellation Policy" field when a new trip is created in
// Admin, and is shown on the public trip page as a fallback for any older
// trip that doesn't have its own policy saved yet. Admins can edit the day
// thresholds per-trip in Admin → Upcoming Trips → Add/Edit Trip.
// =============================================

export const DEFAULT_CANCELLATION_POLICY: CancellationPolicy = {
  payment_due_days: 30,
  tiers: [
    {
      min_days: 45,
      max_days: null,
      description:
        "The advance amount is non-refundable. Any additional amount paid beyond the advance amount will be refunded after deducting applicable third-party cancellation charges, if any.",
    },
    {
      min_days: 31,
      max_days: 45,
      description:
        "Refunds will be processed after deducting the advance amount and all actual non-refundable charges already incurred, including airline tickets, hotel reservations, transportation, activity bookings, and any other third-party expenses.",
    },
    {
      min_days: null,
      max_days: 30,
      description: "No refund will be provided.",
    },
  ],
  refund_min_days: 7,
  refund_max_days: 14,
};

// Sections of the policy that don't vary by trip (no day thresholds admins
// need to change), shown alongside the day-based tiers above.
export const CANCELLATION_POLICY_STATIC_SECTIONS = {
  bookingConfirmation: [
    'Your booking is confirmed only after payment of the advance amount.',
    "The advance amount is non-refundable and non-transferable under all circumstances unless the trip is cancelled by the organizer due to reasons solely within the organizer's control.",
  ],
  noShow:
    'Participants who fail to report at the designated meeting point, date, or time will be considered a No Show. No refund, trip credit, or rescheduling will be provided.',
  missedServices:
    'No refund or partial refund will be provided for any unused accommodation, transportation, meals, sightseeing, activities, or other services due to late arrival, illness, personal reasons, or voluntary withdrawal from the trip.',
  organizerCancellation: [
    'If the trip is cancelled by the organizer due to reasons within the organizer\'s control, participants will receive a full refund of the amount paid.',
    'If the trip is cancelled, postponed, or modified due to circumstances beyond the organizer\'s control—including but not limited to natural disasters, adverse weather, political unrest, government restrictions, flight cancellations, pandemics, strikes, or other force majeure events—refunds, if applicable, will be subject to the amounts recovered from airlines, hotels, transport providers, activity operators, and other third-party vendors. Any unrecoverable expenses will be borne by the participant.',
  ],
  minimumGroupSize: {
    intro: 'This trip requires a minimum number of participants to operate. If the minimum group size is not met, the organizer reserves the right to:',
    options: [
      'Reschedule the trip,',
      'Offer a credit towards a future trip, or',
      'Process a refund after deducting any non-refundable third-party expenses already incurred.',
    ],
  },
  acceptance:
    'By paying the advance amount, participants acknowledge that they have read, understood, and agreed to this Cancellation Policy.',
};
