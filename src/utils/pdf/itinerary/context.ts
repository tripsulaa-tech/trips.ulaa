import { jsPDF } from 'jspdf';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AnyIcon, RGB } from './shared';
import { COLORS, PAGE_W, PAGE_H, MARGIN, CONTENT_W, CONTENT_BOTTOM, rgbToHex, loadCoverCroppedImage } from './shared';

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

  /** Simple line-art icon set, drawn as vectors (never rasterized) so they
   *  stay crisp at any zoom and never depend on an external icon font. */
  const icons = {
    calendar(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setDraw(color);
      doc.setLineWidth(1.4);
      doc.roundedRect(x, y - s * 0.72, s, s * 0.82, 2.5, 2.5, 'S');
      doc.line(x, y - s * 0.42, x + s, y - s * 0.42);
      doc.line(x + s * 0.25, y - s * 0.86, x + s * 0.25, y - s * 0.6);
      doc.line(x + s * 0.75, y - s * 0.86, x + s * 0.75, y - s * 0.6);
    },
    star(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setFill(color);
      const cx = x + s / 2;
      const cy = y - s * 0.4;
      const pts: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const ang = (Math.PI / 5) * i - Math.PI / 2;
        const rad = i % 2 === 0 ? s * 0.5 : s * 0.21;
        pts.push([cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad]);
      }
      const lines = pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]);
      doc.lines(lines, pts[0][0], pts[0][1], [1, 1], 'F', true);
    },
    mountain(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setFill(color);
      doc.triangle(x, y, x + s * 0.42, y - s * 0.8, x + s * 0.72, y, 'F');
      doc.triangle(x + s * 0.4, y, x + s * 0.75, y - s * 0.6, x + s, y, 'F');
    },
    backpack(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setDraw(color);
      doc.setLineWidth(1.4);
      doc.roundedRect(x + s * 0.12, y - s * 0.78, s * 0.76, s * 0.78, 3, 3, 'S');
      doc.roundedRect(x + s * 0.3, y - s * 0.95, s * 0.4, s * 0.24, 2, 2, 'S');
      doc.line(x + s * 0.24, y - s * 0.4, x + s * 0.76, y - s * 0.4);
    },
    pin(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setFill(color);
      const cx = x + s * 0.4;
      const cy = y - s * 0.65;
      doc.circle(cx, cy, s * 0.32, 'F');
      doc.triangle(cx - s * 0.24, cy + s * 0.14, cx + s * 0.24, cy + s * 0.14, cx, y, 'F');
      setFill(COLORS.white);
      doc.circle(cx, cy, s * 0.12, 'F');
    },
    plane(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setFill(color);
      const cx = x + s / 2;
      const cy = y - s * 0.5;
      // Fuselage
      doc.triangle(cx - s * 0.05, cy - s * 0.42, cx + s * 0.05, cy - s * 0.42, cx + s * 0.08, cy + s * 0.4, 'F');
      doc.triangle(cx - s * 0.05, cy - s * 0.42, cx + s * 0.08, cy + s * 0.4, cx - s * 0.08, cy + s * 0.4, 'F');
      // Wings
      doc.triangle(cx, cy - s * 0.02, cx + s * 0.5, cy + s * 0.22, cx + s * 0.04, cy + s * 0.12, 'F');
      doc.triangle(cx, cy - s * 0.02, cx - s * 0.5, cy + s * 0.22, cx - s * 0.04, cy + s * 0.12, 'F');
      // Tail fins
      doc.triangle(cx - s * 0.06, cy + s * 0.3, cx - s * 0.22, cy + s * 0.42, cx - s * 0.02, cy + s * 0.4, 'F');
      doc.triangle(cx + s * 0.06, cy + s * 0.3, cx + s * 0.22, cy + s * 0.42, cx + s * 0.02, cy + s * 0.4, 'F');
    },
    train(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setFill(color);
      const bodyW = s * 0.7;
      const bodyH = s * 0.78;
      const bx = x + (s - bodyW) / 2;
      const by = y - s * 0.92;
      doc.roundedRect(bx, by, bodyW, bodyH, bodyW * 0.22, bodyW * 0.22, 'F');
      setFill(COLORS.white);
      doc.roundedRect(bx + bodyW * 0.14, by + bodyH * 0.16, bodyW * 0.3, bodyH * 0.28, 2, 2, 'F');
      doc.roundedRect(bx + bodyW * 0.56, by + bodyH * 0.16, bodyW * 0.3, bodyH * 0.28, 2, 2, 'F');
      setFill(color);
      doc.rect(bx - bodyW * 0.08, y - s * 0.14, bodyW * 1.16, s * 0.1, 'F');
      doc.circle(bx + bodyW * 0.2, y - s * 0.04, s * 0.06, 'F');
      doc.circle(bx + bodyW * 0.8, y - s * 0.04, s * 0.06, 'F');
    },
    bus(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setFill(color);
      const bodyW = s * 0.9;
      const bodyH = s * 0.55;
      const bx = x + (s - bodyW) / 2;
      const by = y - s * 0.78;
      doc.roundedRect(bx, by, bodyW, bodyH, 4, 4, 'F');
      setFill(COLORS.white);
      for (let i = 0; i < 3; i++) {
        doc.roundedRect(bx + bodyW * 0.08 + i * bodyW * 0.3, by + bodyH * 0.2, bodyW * 0.22, bodyH * 0.35, 1.5, 1.5, 'F');
      }
      setFill(color);
      doc.circle(bx + bodyW * 0.22, by + bodyH + s * 0.05, s * 0.08, 'F');
      doc.circle(bx + bodyW * 0.78, by + bodyH + s * 0.05, s * 0.08, 'F');
    },
    question(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setFill(color);
      doc.circle(x + s / 2, y - s * 0.4, s * 0.4, 'F');
      setText(COLORS.white);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(s * 0.5);
      doc.text('?', x + s / 2, y - s * 0.28, { align: 'center' });
    },
    shield(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setFill(color);
      doc.triangle(x, y - s * 0.85, x + s * 0.5, y - s, x + s * 0.5, y - s * 0.1, 'F');
      doc.triangle(x, y - s * 0.85, x + s * 0.5, y - s * 0.1, x, y - s * 0.15, 'F');
      doc.triangle(x + s, y - s * 0.85, x + s * 0.5, y - s, x + s * 0.5, y - s * 0.1, 'F');
      doc.triangle(x + s, y - s * 0.85, x + s * 0.5, y - s * 0.1, x + s, y - s * 0.15, 'F');
    },
    check(x: number, y: number, s = 20, color: RGB = COLORS.green) {
      setFill(color);
      doc.circle(x + s / 2, y - s * 0.4, s * 0.4, 'F');
      drawCheck(x + s / 2, y - s * 0.4, s * 0.32, COLORS.white, 2);
    },
    cross(x: number, y: number, s = 20, color: RGB = COLORS.red) {
      setFill(color);
      doc.circle(x + s / 2, y - s * 0.4, s * 0.4, 'F');
      drawCross(x + s / 2, y - s * 0.4, s * 0.3, COLORS.white, 2);
    },
    // ---- Things-to-Carry item icons ----
    idcard(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setDraw(color);
      doc.setLineWidth(1.3);
      doc.roundedRect(x + s * 0.05, y - s * 0.85, s * 0.9, s * 0.7, 2.5, 2.5, 'S');
      setFill(color);
      doc.circle(x + s * 0.28, y - s * 0.58, s * 0.13, 'F');
      doc.setLineWidth(1.1);
      doc.line(x + s * 0.52, y - s * 0.62, x + s * 0.84, y - s * 0.62);
      doc.line(x + s * 0.52, y - s * 0.48, x + s * 0.74, y - s * 0.48);
    },
    cash(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setDraw(color);
      doc.setLineWidth(1.4);
      doc.roundedRect(x + s * 0.02, y - s * 0.62, s * 0.96, s * 0.5, 3, 3, 'S');
      doc.circle(x + s * 0.5, y - s * 0.37, s * 0.14, 'S');
      setFill(color);
      doc.circle(x + s * 0.14, y - s * 0.37, s * 0.045, 'F');
      doc.circle(x + s * 0.86, y - s * 0.37, s * 0.045, 'F');
    },
    shirt(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setFill(color);
      doc.roundedRect(x + s * 0.22, y - s * 0.78, s * 0.56, s * 0.7, 3, 3, 'F');
      doc.triangle(x + s * 0.22, y - s * 0.7, x + s * 0.02, y - s * 0.5, x + s * 0.22, y - s * 0.4, 'F');
      doc.triangle(x + s * 0.78, y - s * 0.7, x + s * 0.98, y - s * 0.5, x + s * 0.78, y - s * 0.4, 'F');
    },
    sun(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      const cx = x + s * 0.5;
      const cy = y - s * 0.5;
      setFill(color);
      doc.circle(cx, cy, s * 0.24, 'F');
      setDraw(color);
      doc.setLineWidth(1.5);
      doc.setLineCap('round');
      for (let i = 0; i < 8; i++) {
        const ang = (Math.PI / 4) * i;
        const r1 = s * 0.36;
        const r2 = s * 0.48;
        doc.line(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1, cx + Math.cos(ang) * r2, cy + Math.sin(ang) * r2);
      }
    },
    pill(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      const w = s * 0.8;
      const h = s * 0.34;
      const rx = x + (s - w) / 2;
      const ry = y - s * 0.6;
      setDraw(color);
      doc.setLineWidth(1.3);
      doc.roundedRect(rx, ry, w, h, h / 2, h / 2, 'S');
      setFill(color);
      doc.rect(rx + w * 0.06, ry + h * 0.1, w * 0.42, h * 0.8, 'F');
      doc.line(rx + w / 2, ry, rx + w / 2, ry + h);
    },
    plug(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setFill(color);
      doc.roundedRect(x + s * 0.18, y - s * 0.62, s * 0.64, s * 0.5, 4, 4, 'F');
      doc.rect(x + s * 0.32, y - s * 0.82, s * 0.1, s * 0.22, 'F');
      doc.rect(x + s * 0.58, y - s * 0.82, s * 0.1, s * 0.22, 'F');
      setFill(COLORS.white);
      const cx = x + s * 0.5;
      const cy = y - s * 0.38;
      doc.triangle(cx + s * 0.06, cy - s * 0.16, cx - s * 0.08, cy + s * 0.02, cx + s * 0.02, cy + s * 0.02, 'F');
      doc.triangle(cx + s * 0.02, cy + s * 0.02, cx - s * 0.06, cy + s * 0.2, cx + s * 0.08, cy - s * 0.02, 'F');
    },
    shoe(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setFill(color);
      doc.roundedRect(x + s * 0.05, y - s * 0.22, s * 0.9, s * 0.16, 3, 3, 'F');
      doc.roundedRect(x + s * 0.08, y - s * 0.55, s * 0.5, s * 0.36, 4, 4, 'F');
      doc.triangle(x + s * 0.5, y - s * 0.5, x + s * 0.95, y - s * 0.3, x + s * 0.55, y - s * 0.2, 'F');
    },
    // ---- Info-box icons (Meeting Point / Eligibility compact cards) ----
    navigation(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setFill(color);
      const cx = x + s * 0.5;
      const cy = y - s * 0.5;
      // Compass-arrow / "get directions" kite shape, pointing up-right.
      doc.triangle(cx - s * 0.04, cy - s * 0.48, cx + s * 0.4, cy + s * 0.42, cx - s * 0.04, cy + s * 0.14, 'F');
      doc.triangle(cx - s * 0.04, cy - s * 0.48, cx - s * 0.04, cy + s * 0.14, cx - s * 0.44, cy + s * 0.42, 'F');
    },
    userCheck(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setFill(color);
      const cx = x + s * 0.36;
      doc.circle(cx, y - s * 0.76, s * 0.19, 'F');
      doc.roundedRect(cx - s * 0.3, y - s * 0.5, s * 0.6, s * 0.44, s * 0.2, s * 0.2, 'F');
      setFill(COLORS.green);
      doc.circle(x + s * 0.84, y - s * 0.2, s * 0.22, 'F');
      drawCheck(x + s * 0.84, y - s * 0.2, s * 0.16, COLORS.white, 1.6);
    },
    // ---- Closing-slide icons (booking card meta row, contact bar, footer) ----
    clock(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      const cx = x + s * 0.5;
      const cy = y - s * 0.5;
      const r = s * 0.42;
      setDraw(color);
      doc.setLineWidth(1.4);
      doc.circle(cx, cy, r, 'S');
      doc.setLineWidth(1.2);
      doc.setLineCap('round');
      doc.line(cx, cy, cx, cy - r * 0.55);
      doc.line(cx, cy, cx + r * 0.42, cy + r * 0.08);
    },
    users(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setFill(color);
      const r1 = s * 0.17;
      const cx1 = x + s * 0.32;
      const cy1 = y - s * 0.7;
      doc.circle(cx1, cy1, r1, 'F');
      doc.roundedRect(cx1 - s * 0.24, y - s * 0.44, s * 0.48, s * 0.34, s * 0.17, s * 0.17, 'F');
      const r2 = s * 0.14;
      const cx2 = x + s * 0.74;
      const cy2 = y - s * 0.6;
      doc.circle(cx2, cy2, r2, 'F');
      doc.roundedRect(cx2 - s * 0.2, y - s * 0.38, s * 0.4, s * 0.3, s * 0.14, s * 0.14, 'F');
    },
    phone(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      const cx = x + s * 0.5;
      const cy = y - s * 0.5;
      setFill(color);
      doc.circle(cx - s * 0.18, cy - s * 0.18, s * 0.15, 'F');
      doc.circle(cx + s * 0.18, cy + s * 0.18, s * 0.15, 'F');
      setDraw(color);
      doc.setLineWidth(s * 0.2);
      doc.setLineCap('round');
      doc.line(cx - s * 0.1, cy - s * 0.1, cx + s * 0.1, cy + s * 0.1);
    },
    mail(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      const w = s * 0.9;
      const h = s * 0.62;
      const rx = x + (s - w) / 2;
      const ry = y - s * 0.72;
      setDraw(color);
      doc.setLineWidth(1.4);
      doc.roundedRect(rx, ry, w, h, 2, 2, 'S');
      doc.line(rx, ry, rx + w / 2, ry + h * 0.55);
      doc.line(rx + w, ry, rx + w / 2, ry + h * 0.55);
    },
    globe(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      const cx = x + s * 0.5;
      const cy = y - s * 0.5;
      const r = s * 0.42;
      setDraw(color);
      doc.setLineWidth(1.3);
      doc.circle(cx, cy, r, 'S');
      doc.ellipse(cx, cy, r * 0.42, r, 'S');
      doc.line(cx - r, cy, cx + r, cy);
    },
    instagram(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      // Sized/weighted to match the real lucide-react icons used for the
      // other contact-bar entries (Headphones/Phone/Mail/Globe), which fill
      // most of their `s`-sized box — this hand-drawn glyph previously used
      // only 72% of that box at a thinner stroke, so it read smaller and
      // lighter than its neighbors in the footer row.
      const w = s * 0.86;
      const rx = x + (s - w) / 2;
      const ry = y - s / 2 - w / 2;
      setDraw(color);
      doc.setLineWidth(1.4);
      doc.roundedRect(rx, ry, w, w, w * 0.28, w * 0.28, 'S');
      doc.circle(rx + w / 2, ry + w / 2, w * 0.26, 'S');
      setFill(color);
      doc.circle(rx + w * 0.76, ry + w * 0.24, w * 0.07, 'F');
    },
    headset(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      const cx = x + s * 0.5;
      const cy = y - s * 0.6;
      const r = s * 0.4;
      setDraw(color);
      doc.setLineWidth(1.6);
      doc.setLineCap('round');
      for (let i = 0; i < 8; i++) {
        const a1 = Math.PI + (Math.PI * i) / 8;
        const a2 = Math.PI + (Math.PI * (i + 1)) / 8;
        doc.line(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, cx + Math.cos(a2) * r, cy + Math.sin(a2) * r);
      }
      setFill(color);
      doc.roundedRect(cx - r - s * 0.06, cy - s * 0.02, s * 0.14, s * 0.26, 3, 3, 'F');
      doc.roundedRect(cx + r - s * 0.08, cy - s * 0.02, s * 0.14, s * 0.26, 3, 3, 'F');
      // Mic boom + bulb curving down-forward from the left ear cup, so the
      // icon reads as a support headset (with mic) rather than plain headphones.
      const earBottomX = cx - r - s * 0.06 + s * 0.07;
      const earBottomY = cy - s * 0.02 + s * 0.26;
      setDraw(color);
      doc.setLineWidth(1.4);
      doc.line(earBottomX, earBottomY, earBottomX + s * 0.13, earBottomY + s * 0.15);
      setFill(color);
      doc.circle(earBottomX + s * 0.15, earBottomY + s * 0.17, s * 0.06, 'F');
    },
    /** WhatsApp-style call bubble: a filled circle with a speech-bubble tail
     *  and a simple white handset glyph, used for the "Call / WhatsApp"
     *  contact item instead of the plain phone icon. */
    whatsapp(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      const cx = x + s * 0.5;
      const cy = y - s * 0.56;
      const r = s * 0.46;
      setFill(color);
      doc.circle(cx, cy, r, 'F');
      doc.triangle(cx - r * 0.15, cy + r * 0.78, cx + r * 0.35, cy + r * 0.78, cx - r * 0.05, cy + r * 1.25, 'F');
      setFill(COLORS.white);
      doc.circle(cx - r * 0.16, cy - r * 0.16, r * 0.16, 'F');
      doc.circle(cx + r * 0.16, cy + r * 0.16, r * 0.16, 'F');
      setDraw(COLORS.white);
      doc.setLineWidth(r * 0.22);
      doc.setLineCap('round');
      doc.line(cx - r * 0.08, cy - r * 0.08, cx + r * 0.08, cy + r * 0.08);
    },
    lock(x: number, y: number, s = 20, color: RGB = COLORS.white) {
      const bw = s * 0.62;
      const bh = s * 0.48;
      const bx = x + (s - bw) / 2;
      const by = y - bh;
      setFill(color);
      doc.roundedRect(bx, by, bw, bh, 2.5, 2.5, 'F');
      setDraw(color);
      doc.setLineWidth(s * 0.09);
      const cx = x + s / 2;
      const r = s * 0.2;
      for (let i = 0; i < 8; i++) {
        const a1 = Math.PI + (Math.PI * i) / 8;
        const a2 = Math.PI + (Math.PI * (i + 1)) / 8;
        doc.line(cx + Math.cos(a1) * r, by + Math.sin(a1) * r, cx + Math.cos(a2) * r, by + Math.sin(a2) * r);
      }
      setFill(COLORS.primary);
      doc.circle(cx, by + bh * 0.42, s * 0.05, 'F');
    },
    /** Small hand-drawn-style heart, used next to the cursive closing-slide
     *  headings. style 'F' fills it solid, 'S' draws an outline only. */
    heart(x: number, y: number, s = 20, color: RGB = COLORS.primary, style: 'F' | 'S' = 'F') {
      const cx = x + s * 0.5;
      const topY = y - s * 0.62;
      const r = s * 0.26;
      if (style === 'F') {
        setFill(color);
      } else {
        setDraw(color);
        doc.setLineWidth(1.3);
      }
      doc.circle(cx - r * 0.7, topY, r, style);
      doc.circle(cx + r * 0.7, topY, r, style);
      doc.triangle(cx - r * 1.55, topY + r * 0.32, cx + r * 1.55, topY + r * 0.32, cx, y, style);
    },
    /** Simple palm-silhouette doodle for the closing slide's footer band. */
    palm(x: number, y: number, s = 20, color: RGB = COLORS.white) {
      setDraw(color);
      doc.setLineWidth(1.6);
      doc.setLineCap('round');
      doc.line(x + s * 0.5, y, x + s * 0.42, y - s * 0.5);
      doc.line(x + s * 0.42, y - s * 0.5, x + s * 0.55, y - s * 0.88);
      setFill(color);
      const tipX = x + s * 0.55;
      const tipY = y - s * 0.88;
      [-0.9, -0.45, 0, 0.45, 0.9].forEach(a => {
        const ang = -Math.PI / 2 + a;
        const ex = tipX + Math.cos(ang) * s * 0.42;
        const ey = tipY + Math.sin(ang) * s * 0.42;
        const ex2 = tipX + Math.cos(ang + 0.32) * s * 0.26;
        const ey2 = tipY + Math.sin(ang + 0.32) * s * 0.26;
        doc.triangle(tipX, tipY, ex, ey, ex2, ey2, 'F');
      });
    },
    share(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      const cx = x + s * 0.5;
      const cy = y - s * 0.5;
      const pts: [number, number][] = [
        [cx - s * 0.32, cy],
        [cx + s * 0.3, cy - s * 0.3],
        [cx + s * 0.3, cy + s * 0.3],
      ];
      setDraw(color);
      doc.setLineWidth(1.3);
      doc.line(pts[0][0], pts[0][1], pts[1][0], pts[1][1]);
      doc.line(pts[0][0], pts[0][1], pts[2][0], pts[2][1]);
      setFill(color);
      pts.forEach(p => doc.circle(p[0], p[1], s * 0.11, 'F'));
    },
    download(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      const cx = x + s * 0.5;
      setDraw(color);
      doc.setLineWidth(1.4);
      doc.setLineCap('round');
      doc.line(cx, y - s * 0.9, cx, y - s * 0.3);
      doc.line(cx - s * 0.22, y - s * 0.5, cx, y - s * 0.28);
      doc.line(cx + s * 0.22, y - s * 0.5, cx, y - s * 0.28);
      doc.line(x + s * 0.12, y, x + s * 0.88, y);
    },
  };

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
