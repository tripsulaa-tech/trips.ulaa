import type { ButtonLabelsConfig } from '../types/types-index';

// Used until an admin saves custom wording via the Home Page admin's
// "Button Naming" tab
// (site_content key "button_labels"), and as the fallback if that fetch
// fails or returns nothing. Consumed by TripDetailPage.tsx (the live
// "Pack Your Bags" buttons) and tripItineraryPdf.ts (the matching CTA on
// the generated PDF), so both stay in sync automatically.
export const DEFAULT_BUTTON_LABELS: ButtonLabelsConfig = {
  primaryCta: 'Pack Your Bags',
  waitlistCta: 'Join Waitlist',
};
