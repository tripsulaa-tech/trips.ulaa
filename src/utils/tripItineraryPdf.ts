import { jsPDF } from 'jspdf';
// Side-effect import — patches jsPDF's prototype with `.svg(element, opts)`,
// used by drawLucideIcon (see pdf/itinerary/context.ts) to draw real
// lucide-react icons as crisp vector paths instead of hand-drawn
// approximations.
import 'svg2pdf.js';
import type { UpcomingTrip, ButtonLabelsConfig } from '../types/types-index';
import { DEFAULT_BUTTON_LABELS } from '../constants/buttonLabels';
import { getSiteContent } from '../services/api';
import { PARISIENNE_FONT_BASE64 } from './parisienneFont';
import { RUPEE_SANS_REGULAR_BASE64, RUPEE_SANS_BOLD_BASE64 } from './rupeeFont';
import {
  BRAND, PAGE_W, PAGE_H, MARGIN,
  COLORS, sanitizeTrip,
} from './pdf/itinerary/shared';
import { createPdfContext } from './pdf/itinerary/context';
import { renderCover } from './pdf/itinerary/cover';
import { renderHighlightsAndDays } from './pdf/itinerary/highlightsAndDays';
import { renderItinerary } from './pdf/itinerary/itinerary';
import { renderAccommodation } from './pdf/itinerary/accommodation';
import { renderInclusions } from './pdf/itinerary/inclusions';
import { renderGallery } from './pdf/itinerary/gallery';
import { renderFashion } from './pdf/itinerary/fashion';
import { renderConfidenceAndCarry } from './pdf/itinerary/confidenceAndCarry';
import { renderFaqs } from './pdf/itinerary/faqs';
import { renderCancellationPolicy } from './pdf/itinerary/cancellationPolicy';
import { renderTripLeaderAndBooking } from './pdf/itinerary/tripLeaderAndBooking';

// =============================================================================
// "Download Itinerary PDF" — renders a trip's public detail page as a clean,
// branded, landscape SLIDE DECK (one PowerPoint-style 16:9 slide per page)
// rather than a flowing document. Every slide is built entirely from the
// `UpcomingTrip` object passed in, so it always reflects whatever's live in
// Admin — nothing about a specific trip is hardcoded here.
//
// Design intent: reproduce the 9-slide reference deck (cover → overview +
// highlights → itinerary → inclusions/exclusions + things to carry (one
// combined slide when both fit) → meeting point → FAQs → cancellation
// policy → closing) while staying fully data-driven:
//   - Sections with no data are skipped entirely (no empty slides).
//   - Sections whose content is longer than one slide (many itinerary days,
//     many FAQs, many cancellation clauses...) automatically continue onto
//     extra slides instead of overflowing or getting silently cut off.
//   - If new list-shaped fields are added to a trip in the future and
//     surfaced through one of the section renderers below, they'll render
//     without any layout changes — see "Future compatibility" at the
//     bottom of this file for the extension point.
//
// Each slide/section now lives in its own module under
// src/utils/pdf/itinerary/ (cover.ts, itinerary.ts, inclusions.ts, ...),
// sharing drawing primitives via the `PdfCtx` built by
// pdf/itinerary/context.ts. This file just wires them together in order.
//
// Colors are kept in sync with the @theme block in src/styles/globals.css —
// update both places together if the brand palette ever changes.
// =============================================================================

// =============================================================================
// Builder
// =============================================================================

async function buildTripItineraryPdfDoc(rawTrip: UpcomingTrip): Promise<jsPDF> {
  const trip = sanitizeTrip(rawTrip);
  const doc = new jsPDF({ unit: 'pt', format: [PAGE_W, PAGE_H], orientation: 'landscape' });

  // Admin-editable "Pack Your Bags" / "Join Waitlist" button text (see
  // the Home Page admin's "Button Naming" tab). Read once up front so the
  // CTA button on the Trip Leader & Booking slide matches whatever the live
  // trip detail page is currently showing. Falls back to the defaults if
  // nothing's been saved yet or the fetch fails.
  const buttonLabels: ButtonLabelsConfig = await getSiteContent<ButtonLabelsConfig>('button_labels')
    .then(data => (data && data.primaryCta ? data : DEFAULT_BUTTON_LABELS))
    .catch(() => DEFAULT_BUTTON_LABELS);

  // Register the cursive "Parisienne" script font (site-wide --font-script,
  // see globals.css) for the closing slide's handwritten-style headings.
  // jsPDF only knows fonts it's been given directly — the @font-face import
  // in globals.css has no effect here — so the TTF bytes are embedded as
  // base64 (parisienneFont.ts) and registered once, up front. Best-effort:
  // if this ever fails, every doc.setFont('Parisienne', ...) call below
  // silently falls back to jsPDF's default font instead of breaking PDF
  // generation.
  try {
    doc.addFileToVFS('Parisienne-Regular.ttf', PARISIENNE_FONT_BASE64);
    doc.addFont('Parisienne-Regular.ttf', 'Parisienne', 'normal');
  } catch {
    /* falls back to the default font — see comment above */
  }

  // Register a tiny Roboto subset (digits, comma, period, space, "RS" and
  // the ₹ glyph itself) so the hero price on the "Trip Leader & Booking"
  // slide can show the real ₹ symbol — helvetica's Windows-1252 charset
  // doesn't include it (see heroMoneyRupee() in pdf/itinerary/shared.ts).
  // Same best-effort pattern as Parisienne above: on failure, callers fall
  // back to helvetica.
  try {
    doc.addFileToVFS('RupeeSans-Regular.ttf', RUPEE_SANS_REGULAR_BASE64);
    doc.addFont('RupeeSans-Regular.ttf', 'RupeeSans', 'normal');
    doc.addFileToVFS('RupeeSans-Bold.ttf', RUPEE_SANS_BOLD_BASE64);
    doc.addFont('RupeeSans-Bold.ttf', 'RupeeSans', 'bold');
  } catch {
    /* falls back to jsPDF's default font — see comment above */
  }

  const ctx = createPdfContext(doc);
  const { setFill, setText } = ctx;

  // =========================================================================
  // Assemble the deck. Sections with no data render nothing (see the
  // `if` guard at the top of each section renderer), so the final page
  // count is always exactly what this specific trip's content needs.
  // =========================================================================
  await renderCover(ctx, trip);
  await renderHighlightsAndDays(ctx, trip);
  await renderItinerary(ctx, trip);
  await renderAccommodation(ctx, trip);
  await renderInclusions(ctx, trip);
  await renderGallery(ctx, trip);
  await renderFashion(ctx, trip);
  await renderConfidenceAndCarry(ctx, trip);
  renderFaqs(ctx, trip);
  await renderCancellationPolicy(ctx, trip);
  await renderTripLeaderAndBooking(ctx, trip, buttonLabels);

  // ---------------------------------------------------------------------
  // Page-number badge on every slide, added last so the final total is
  // known no matter how many slides the content above generated.
  // ---------------------------------------------------------------------
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    const label = `${String(p).padStart(2, '0')} / ${String(pageCount).padStart(2, '0')}`;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    const w = doc.getTextWidth(label) + 16;
    setFill(COLORS.dark);
    doc.roundedRect(PAGE_W - MARGIN - w, PAGE_H - 30, w, 18, 9, 9, 'F');
    setText(COLORS.white);
    doc.text(label, PAGE_W - MARGIN - w / 2, PAGE_H - 18, { align: 'center' });
  }

  return doc;
}

/** Builds the itinerary PDF and triggers a browser download. */
export async function downloadTripItineraryPdf(trip: UpcomingTrip): Promise<void> {
  const doc = await buildTripItineraryPdfDoc(trip);
  doc.save(`${trip.slug || 'ulaa-trip'}-itinerary.pdf`);
}

// =============================================================================
// Sharing the PDF directly (not just downloading it)
// -----------------------------------------------------------------------------
// `doc.save()` above is a plain browser download — fine on desktop/Android,
// but on iOS Safari a blob download can't be forced: Safari instead opens
// the PDF in its own viewer at a `blob:https://...` URL, and if the person
// taps iOS's native share icon *from that viewer*, iOS shares whatever it
// has — the ephemeral blob: URL (meaningless outside that browser tab) AND
// the file, as two separate, ugly attachments in WhatsApp/etc.
//
// `shareTripItineraryPdf` avoids all of that by handing the PDF to the
// native share sheet ourselves as a real `File`, via the Web Share API's
// file-sharing capability (Level 2) — no blob: URL is ever exposed, and we
// control exactly what travels with it: the trip title plus a real,
// clickable link back to this trip's page.
// =============================================================================

/** True only when the browser can actually hand a file to the native OS
 *  share sheet (iOS Safari 15+, Chrome/Android, some desktop browsers with
 *  a registered share target). Most desktop browsers return false here —
 *  callers should treat that as "just download, no sharing option to offer". */
export function canShareItineraryPdf(): boolean {
  if (typeof navigator === 'undefined' || !navigator.canShare) return false;
  try {
    const probe = new File([''], 'probe.pdf', { type: 'application/pdf' });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/** Canonical, clean URL for a trip's public detail page — always what
 *  travels alongside a shared PDF, never a transient `blob:` URL. */
function getTripPageUrl(trip: UpcomingTrip): string {
  return `https://${BRAND.website.replace('www.', '')}/trips/${trip.slug}`;
}

/**
 * Builds the itinerary PDF and shares it via the native OS share sheet as a
 * real file, alongside the trip title and a clickable link back to this
 * trip's page. Callers should gate this behind `canShareItineraryPdf()` —
 * on browsers without file-sharing support `navigator.share` either doesn't
 * exist or rejects the file outright.
 */
export async function shareTripItineraryPdf(trip: UpcomingTrip): Promise<'shared' | 'cancelled'> {
  const doc = await buildTripItineraryPdfDoc(trip);
  const blob = doc.output('blob');
  const file = new File([blob], `${trip.slug || 'ulaa-trip'}-itinerary.pdf`, { type: 'application/pdf' });

  try {
    await navigator.share({
      title: trip.title,
      text: trip.title,
      url: getTripPageUrl(trip),
      files: [file],
    });
    return 'shared';
  } catch (err) {
    // AbortError fires when the person just closes the native share sheet —
    // that's a normal cancel, not a failure worth logging/surfacing.
    if (err instanceof Error && err.name === 'AbortError') return 'cancelled';
    throw err;
  }
}

// =============================================================================
// Future compatibility
// -----------------------------------------------------------------------------
// This generator reads every field straight off the `UpcomingTrip` object —
// nothing about a specific trip is hardcoded above. If Admin grows a new
// *list-shaped* field that should appear on the Trip Details page and in
// this PDF (e.g. an "Add-on Experiences" list, or a "Packing List by
// Category" grouping), the pattern to extend is:
//
//   1. Add the field to `UpcomingTrip` in src/types/index.ts.
//   2. Add a new `render<Section>(ctx, trip)` module under
//      src/utils/pdf/itinerary/ following the shape of
//      `renderInclusions` (paired columns) or `renderFaqs`
//      (question/answer columns) — whichever is the closest match —
//      computing a `rowsPerPage`/`itemsPerPage` split so it automatically
//      spills onto extra slides if the list is long.
//   3. Call it from the assembly block in `buildTripItineraryPdfDoc` above,
//      guarded by the same `if (list.length === 0) return;` pattern so
//      trips without that field don't get an empty slide.
//
// No changes to the cover, page-numbering, or any other section are ever
// needed to add a new one.
// =============================================================================
