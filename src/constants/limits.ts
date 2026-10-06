// Shared numeric settings that used to be repeated or buried in individual files.

/** Character counters in the admin content editors. "Soft": the counter turns red, typing isn't blocked. */
export const CONTENT_LIMITS = {
  whyUlaa: { title: 24, description: 95 },
  journey: { heading: 30, description: 85 },
  whyDifferent: { heading: 26, description: 85 },
} as const;

/** The public Contact Us message box. */
export const CONTACT_MESSAGE_MAX_LENGTH = 500;

export const TIMING = {
  /** Wait after the last invoice edit before re-rendering the PDF preview. */
  invoicePreviewDebounceMs: 500,
  /** How often the app checks whether a newer version was deployed. */
  versionCheckIntervalMs: 4_000,
  /** Saved form drafts older than this are discarded. */
  draftExpiryMs: 24 * 60 * 60 * 1000,
  /** A form submitted faster than this is treated as a bot. */
  botMinFillMs: 1200,
} as const;

/** Most A3/A4 print sheets one travel-card or badge download may produce. */
export const MAX_PRINT_SHEETS = 100;

/** If a payment would leave no more than this many rupees owed, the payment form asks
 *  the admin whether they meant to settle the whole balance. */
export const PAYMENT_NEAR_BALANCE_RUPEES = 100;
