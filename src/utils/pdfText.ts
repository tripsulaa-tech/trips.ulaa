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
    // Arrows aren't in the core PDF font either: jsPDF draws a garbled glyph and
    // spaces out the whole line (e.g. "Haputale → Ella" came out as "Haputale !' Ella").
    .replace(/\s*[\u2192\u2794\u279C\u279D\u279E\u27F6\u21D2\u21E2]\s*/g, ' to ')
    .replace(/\s*[\u2190\u27F5\u21D0]\s*/g, ' from ')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '')
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '')
    .replace(/\u{FE0F}/gu, '')
    .replace(/\u200D/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
