import { jsPDF } from 'jspdf';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AnyIcon, RGB } from './shared';
import { COLORS, PAGE_W, PAGE_H, MARGIN, CONTENT_W, CONTENT_BOTTOM, rgbToHex, loadCoverCroppedImage } from './shared';
import { createIcons } from './icons';

// =============================================================================
// Shared drawing context for the itinerary-PDF slide deck.
// -----------------------------------------------------------------------------
// Every section renderer (cover.ts, itinerary.ts, inclusions.ts, ...) is
// handed one `PdfCtx` built by `createPdfContext(doc)` below. It bundles the
// low-level drawing primitives, the hand-drawn `icons` set, and the
// text/layout helpers that used to be closures inside one giant
// `buildTripItineraryPdfDoc` function in tripItineraryPdf.ts — extracted
// here, unchanged, so every section can share them without duplicating any
// drawing logic.
// =============================================================================

/** Builds the shared drawing context for one PDF document. Called once per
 *  `buildTripItineraryPdfDoc` run, then passed into every section renderer. */
export function createPdfContext(doc: jsPDF) {
  const setFill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const setText = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const setDraw = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);

  let firstSlide = true;
  function newSlide() {
    if (!firstSlide) doc.addPage([PAGE_W, PAGE_H], 'landscape');
    firstSlide = false;
    setFill(COLORS.background);
    doc.rect(0, 0, PAGE_W, PAGE_H, 'F');
  }

  function withOpacity(opacity: number, draw: () => void) {
    try {
      doc.saveGraphicsState();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      doc.setGState(new (doc as any).GState({ opacity }));
      draw();
    } finally {
      try {
        doc.restoreGraphicsState();
      } catch {
        /* older jsPDF builds may no-op restoreGraphicsState — safe to ignore */
      }
    }
  }

  function clampLines(text: string, maxWidth: number, maxLines: number): string[] {
    const lines: string[] = doc.splitTextToSize(text, maxWidth);
    if (lines.length <= maxLines) return lines;
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    // Prefer dropping whole words over chopping mid-word. Only fall back to
    // a character-by-character trim if a single word is wider than the box.
    while (doc.getTextWidth(`${last}\u2026`) > maxWidth && last.includes(' ')) {
      last = last.slice(0, last.lastIndexOf(' ')).trimEnd();
    }
    while (doc.getTextWidth(`${last}\u2026`) > maxWidth && last.length > 1) {
      last = last.slice(0, -1).trimEnd();
    }
    kept[maxLines - 1] = `${last}\u2026`;
    return kept;
  }

  // `icon` is optional — pass `null` to render a plain text-only header
  // (no leading icon glyph), used for sections where the icon is now
  // deliberately omitted. Text simply starts at MARGIN instead of being
  // indented to make room for the icon.
  function slideHeader(icon: ((x: number, y: number) => void) | null, title: string, subtitle?: string) {
    const textX = icon ? MARGIN + 30 : MARGIN;
    if (icon) icon(MARGIN, 40);
    setText(COLORS.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(19);
    doc.text(title, textX, 46);
    setDraw(COLORS.grayLine);
    doc.setLineWidth(1);
    doc.line(MARGIN, 66, PAGE_W - MARGIN, 66);
    // Subtitle sits below the divider line (same placement as the
    // "Travel with Confidence" / "Things to Carry" descriptions) instead
    // of being squeezed between the title and the line — with breathing
    // room both above (from the line) and below (before slide content).
    if (subtitle) {
      setText(COLORS.darkMuted);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.text(subtitle, textX, 92);
    }
  }

  function drawCheck(cx: number, cy: number, r: number, color: RGB, weight = 1.6) {
    setDraw(color);
    doc.setLineWidth(weight);
    doc.setLineCap('round');
    doc.setLineJoin('round');
    doc.line(cx - r * 0.55, cy, cx - r * 0.1, cy + r * 0.5);
    doc.line(cx - r * 0.1, cy + r * 0.5, cx + r * 0.62, cy - r * 0.45);
  }

  function drawCross(cx: number, cy: number, r: number, color: RGB, weight = 1.6) {
    setDraw(color);
    doc.setLineWidth(weight);
    doc.setLineCap('round');
    doc.line(cx - r * 0.5, cy - r * 0.5, cx + r * 0.5, cy + r * 0.5);
    doc.line(cx - r * 0.5, cy + r * 0.5, cx + r * 0.5, cy - r * 0.5);
  }

  /** Small "→" arrow glyph (shaft + head), used next to CTA button labels
   *  like "Secure Your Spot" — cheaper and crisper than relying on the
   *  core font's arrow character support. */
  function drawArrowRight(cx: number, cy: number, r: number, color: RGB, weight = 1.6) {
    setDraw(color);
    doc.setLineWidth(weight);
    doc.setLineCap('round');
    doc.setLineJoin('round');
    doc.line(cx - r * 0.6, cy, cx + r * 0.5, cy);
    doc.line(cx + r * 0.1, cy - r * 0.4, cx + r * 0.5, cy);
    doc.line(cx + r * 0.1, cy + r * 0.4, cx + r * 0.5, cy);
  }

  /** Draws one line of text made of differently-colored/weighted runs,
   *  left-to-right starting at `x` — used for the booking card's reserve
   *  box ("Reserve today with only <amount>") where only the amount is
   *  highlighted, matching the live site's <BookingForm> styling. */
  function drawMixedLine(x: number, y: number, parts: { text: string; color: RGB; bold?: boolean }[], size: number) {
    let runX = x;
    parts.forEach(part => {
      doc.setFont('helvetica', part.bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      setText(part.color);
      doc.text(part.text, runX, y);
      runX += doc.getTextWidth(part.text);
    });
  }

  /** Measures the total width of a mixed-style line (see drawMixedLine)
   *  without drawing it, so callers can center the group before drawing. */
  function mixedLineWidth(parts: { text: string; bold?: boolean }[], size: number): number {
    let w = 0;
    parts.forEach(part => {
      doc.setFont('helvetica', part.bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      w += doc.getTextWidth(part.text);
    });
    return w;
  }

  const icons = createIcons({ doc, setDraw, setFill, setText, drawCheck, drawCross, COLORS });

  /** Renders an actual lucide-react icon (the same component
   *  TripHighlightIconDisplay / TripDetailPage.tsx render on the live site)
   *  into the PDF as real vector paths via svg2pdf.js — not a hand-drawn
   *  approximation from the `icons` set above. Follows the same
   *  "x, y = bottom-left anchor" convention as every `icons.*` helper so
   *  call sites read the same either way: `y` is the icon's bottom edge,
   *  `s` is both its width and height. Best-effort: a failed render (e.g.
   *  an unsupported SVG feature) is swallowed rather than breaking the
   *  whole PDF, matching the same defensive pattern used for image loads
   *  elsewhere in this file. */
  async function drawLucideIcon(Icon: AnyIcon, x: number, y: number, s = 20, color: RGB = COLORS.primary) {
    try {
      const markup = renderToStaticMarkup(
        createElement(Icon, { size: s, color: rgbToHex(color), strokeWidth: 2 })
      );
      const svgEl = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
      await doc.svg(svgEl, { x, y: y - s, width: s, height: s });
    } catch {
      /* icon glyph skipped — see comment above */
    }
  }

  // ---------------------------------------------------------------------
  // Text primitive: draws left-aligned wrapped text and returns the y
  // position immediately below the last line (top-down, single block).
  // ---------------------------------------------------------------------
  function drawParagraph(
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    opts?: { size?: number; color?: RGB; bold?: boolean; lineHeight?: number; maxLines?: number }
  ): number {
    const size = opts?.size ?? 11;
    const color = opts?.color ?? COLORS.darkMuted;
    const lh = opts?.lineHeight ?? size * 1.42;
    doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    setText(color);
    const lines: string[] = opts?.maxLines
      ? clampLines(text, maxWidth, opts.maxLines)
      : doc.splitTextToSize(text, maxWidth);
    doc.text(lines, x, y);
    return y + lines.length * lh;
  }

  // ---------------------------------------------------------------------
  // Bullet list primitive: draws a small dot-marker + wrapped text for
  // each item, sharing one line budget (`opts.maxLines`) across the whole
  // list so it truncates gracefully (with an ellipsis on the last line
  // drawn) instead of overflowing its container. Returns the y position
  // immediately below the last line drawn.
  // ---------------------------------------------------------------------
  function drawBulletList(
    items: string[],
    x: number,
    y: number,
    maxWidth: number,
    opts?: { size?: number; color?: RGB; lineHeight?: number; maxLines?: number }
  ): number {
    const size = opts?.size ?? 8.8;
    const color = opts?.color ?? COLORS.darkMuted;
    const lh = opts?.lineHeight ?? size * 1.42;
    const markerIndent = 10;
    const textWidth = maxWidth - markerIndent;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);

    let remaining = opts?.maxLines ?? Infinity;
    let cy = y;
    for (const item of items) {
      if (remaining <= 0) break;
      const wrapped: string[] = doc.splitTextToSize(item, textWidth);
      const lines = wrapped.length > remaining ? clampLines(item, textWidth, remaining) : wrapped;
      if (lines.length === 0) break;

      setFill(COLORS.secondary);
      doc.circle(x + 2.5, cy - size * 0.35, 1.4, 'F');
      setText(color);
      doc.text(lines, x + markerIndent, cy);

      cy += lines.length * lh;
      remaining -= lines.length;
    }
    return cy;
  }

  function measureParagraphHeight(
    text: string,
    maxWidth: number,
    size: number,
    lineHeight?: number,
    maxLines?: number
  ): number {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);
    const lh = lineHeight ?? size * 1.42;
    const lines: string[] = doc.splitTextToSize(text, maxWidth);
    const count = maxLines ? Math.min(lines.length, maxLines) : lines.length;
    return count * lh;
  }

  /** Spreads one shared list across two side-by-side
   *  columns, always dropping the next item into whichever column is
   *  currently shorter. This keeps both columns filled evenly (rather than
   *  a naive odd/even split, which can leave a continuation page with a
   *  single item in one column and the other totally empty). */
  function paginateTwoColumns<T>(
    items: T[],
    measure: (item: T) => number,
    availH: number
  ): { left: T[]; right: T[]; leftH: number; rightH: number }[] {
    if (items.length === 0) return [];
    const pages: { left: T[]; right: T[]; leftH: number; rightH: number }[] = [];
    let left: T[] = [];
    let right: T[] = [];
    let leftH = 0;
    let rightH = 0;

    for (const item of items) {
      const h = measure(item);
      const shortIsLeft = leftH <= rightH;
      const fitsShort = (shortIsLeft ? leftH : rightH) + h <= availH;
      const fitsOther = (shortIsLeft ? rightH : leftH) + h <= availH;
      const isEmptyPage = left.length === 0 && right.length === 0;

      if (fitsShort || isEmptyPage) {
        if (shortIsLeft) {
          left.push(item);
          leftH += h;
        } else {
          right.push(item);
          rightH += h;
        }
      } else if (fitsOther) {
        if (shortIsLeft) {
          right.push(item);
          rightH += h;
        } else {
          left.push(item);
          leftH += h;
        }
      } else {
        pages.push({ left, right, leftH, rightH });
        left = [item];
        right = [];
        leftH = h;
        rightH = 0;
      }
    }
    pages.push({ left, right, leftH, rightH });
    return pages;
  }

  /** Returns a y-offset that centers a block of the given height within
   *  [top, bottom] — used so slides with little content (a short packing
   *  list, a single cancellation clause on a continuation page, etc.) read
   *  as an intentionally-composed card instead of a mostly-empty page. */
  function centeredTop(top: number, bottom: number, contentH: number): number {
    const avail = bottom - top;
    if (contentH >= avail) return top;
    return top + (avail - contentH) / 2;
  }

  // =========================================================================
  // Shared square-photo-wall grid used by both the Accommodation and Fashion
  // Aesthetics slides. Two rows: row 1 holds up to 4 photos, row 2 holds up
  // to 3 — so a 7th photo gets a real tile in row 1 instead of being folded
  // into a "+N" overlay. For 6 or fewer photos, row 1 stays at 3 across
  // (matching the original 3x2 layout); it only grows to 4 once a 7th photo
  // needs a home. Anything past 7 photos still collapses into a dimmed
  // "+N" badge on the last tile.
  async function drawSquarePhotoWall(allPhotos: string[], contentTop: number): Promise<void> {
    const ROW1_MAX = 4;
    const ROW2_MAX = 3;
    const CAP = ROW1_MAX + ROW2_MAX;
    const shown = allPhotos.slice(0, CAP);
    const remaining = allPhotos.length - shown.length;

    const row1Count = shown.length >= 7 ? ROW1_MAX : Math.min(3, shown.length);
    const row2Count = shown.length - row1Count;
    const rowCounts = row2Count > 0 ? [row1Count, row2Count] : [row1Count];
    const maxCols = Math.max(...rowCounts, 1);
    const rows = rowCounts.length;

    const colGap = 14;
    const rowGap = 14;

    // Square size is whichever of width- or height-driven fits smaller, so
    // the grid always stays made of true squares. Left-aligned to MARGIN
    // (not centered), so any leftover width sits to the right of the grid
    // instead of splitting evenly.
    const squareByWidth = (CONTENT_W - colGap * (maxCols - 1)) / maxCols;
    const availH = CONTENT_BOTTOM - contentTop;
    const squareByHeight = (availH - rowGap * (rows - 1)) / rows;
    const square = Math.min(squareByWidth, squareByHeight);

    const gridH = rows * square + rowGap * (rows - 1);
    const gridX = MARGIN;
    const gridY = centeredTop(contentTop, CONTENT_BOTTOM, gridH);

    const crops = await Promise.all(shown.map(url => loadCoverCroppedImage(url, square, square, 8)));

    let i = 0;
    rowCounts.forEach((count, row) => {
      for (let col = 0; col < count; col++) {
        const cropped = crops[i];
        const x = gridX + col * (square + colGap);
        const y = gridY + row * (square + rowGap);
        if (cropped) {
          try {
            doc.addImage(cropped, 'JPEG', x, y, square, square);
          } catch {
            setFill(COLORS.backgroundWarm);
            doc.roundedRect(x, y, square, square, 8, 8, 'F');
            setDraw(COLORS.grayLineSoft);
            doc.setLineWidth(0.75);
            doc.roundedRect(x, y, square, square, 8, 8, 'S');
          }
        } else {
          setFill(COLORS.backgroundWarm);
          doc.roundedRect(x, y, square, square, 8, 8, 'F');
          setDraw(COLORS.grayLineSoft);
          doc.setLineWidth(0.75);
          doc.roundedRect(x, y, square, square, 8, 8, 'S');
        }

        if (i === shown.length - 1 && remaining > 0) {
          withOpacity(0.55, () => {
            setFill(COLORS.dark);
            doc.roundedRect(x, y, square, square, 8, 8, 'F');
          });
          setText(COLORS.white);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(16);
          doc.text(`+${remaining}`, x + square / 2, y + square / 2 + 5, { align: 'center' });
        }

        i++;
      }
    });
  }

  return {
    doc,
    setFill,
    setText,
    setDraw,
    newSlide,
    withOpacity,
    clampLines,
    slideHeader,
    drawCheck,
    drawCross,
    drawArrowRight,
    drawMixedLine,
    mixedLineWidth,
    icons,
    drawLucideIcon,
    drawParagraph,
    drawBulletList,
    measureParagraphHeight,
    paginateTwoColumns,
    centeredTop,
    drawSquarePhotoWall,
  };
}

export type PdfCtx = ReturnType<typeof createPdfContext>;
