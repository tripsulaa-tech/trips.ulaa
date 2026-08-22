// Shared text-sanitization helper for jsPDF output. Previously duplicated
// (near byte-for-byte) between invoicePdf.ts and tripItineraryPdf.ts —
// centralized here so both PDFs stay in sync instead of drifting apart.

/** The ₹ glyph isn't in the core PDF font's charset (renders as a stray
 *  mis-measured character, which throws off layout math based on its
 *  width), and emoji/pictographs aren't either. Every piece of
 *  admin/enquiry-authored text drawn into a PDF passes through this first.
 *  Accepts null/undefined defensively (some callers pass optional fields
 *  straight through) and returns '' for any falsy input. */
export function sanitizeForPdf(text: string | null | undefined): string {
  if (!text) return '';
  return String(text)
    .replace(/\u20B9/g, 'Rs. ')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '')
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '')
    .replace(/\u{FE0F}/gu, '')
    .replace(/\u200D/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
