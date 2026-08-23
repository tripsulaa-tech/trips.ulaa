import type { PdfCtx } from './context';
import type { PdfTrip } from './shared';
import { BRAND, PAGE_W, PAGE_H, MARGIN, CONTENT_W, COLORS, money, loadCoverCroppedImage } from './shared';
import { sanitizeForPdf } from '../../pdfText';
import { loadContainImage } from '../../pdfImageLoading';
import { formatDateRange, formatAgeRange, getActivePrice } from '../../utils-index';

/** Renders the "Cover" slide — trip hero photo, title, meta pills, and
 *  description strip. Extracted from tripItineraryPdf.ts (see that file's
 *  history for the original single-module version). */
export async function renderCover(ctx: PdfCtx, trip: PdfTrip): Promise<void> {
  const { doc, setFill, setText, setDraw, newSlide, withOpacity, clampLines, icons, drawParagraph } = ctx;

  // =========================================================================
  // SLIDE — Cover
  // =========================================================================
  async function run() {
    newSlide();
    const heroH = PAGE_H * 0.56;

    let heroDrawn = false;
    if (trip.cover_image) {
      const cropped = await loadCoverCroppedImage(trip.cover_image, PAGE_W, heroH, 0);
      if (cropped) {
        try {
          doc.addImage(cropped, 'JPEG', 0, 0, PAGE_W, heroH);
          heroDrawn = true;
        } catch {
          heroDrawn = false;
        }
      }
    }
    if (!heroDrawn) {
      setFill(COLORS.backgroundWarm);
      doc.rect(0, 0, PAGE_W, heroH, 'F');
    }

    // Subtle bottom gradient over the photo so a logo/badge sitting near
    // the seam stays legible regardless of the photo's own colors.
    withOpacity(0.28, () => {
      setFill(COLORS.dark);
      doc.rect(0, heroH - 70, PAGE_W, 70, 'F');
    });

    // Brand mark, top-left over the photo.
    const logo = await loadContainImage('/ULAA-logo-Footer.png');
    if (logo) {
      const logoH = 40;
      const logoW = logoH * logo.ratio;
      try {
        doc.addImage(logo.dataUrl, 'PNG', MARGIN, 22, logoW, logoH);
      } catch {
        drawTextLogo(MARGIN, 22, true);
      }
    } else {
      drawTextLogo(MARGIN, 22, true);
    }

    // Cream information strip below the photo.
    setFill(COLORS.background);
    doc.rect(0, heroH, PAGE_W, PAGE_H - heroH, 'F');
    setFill(COLORS.secondary);
    doc.rect(0, heroH, PAGE_W, 3, 'F');

    // Soft decorative arcs, bottom-right — a quiet echo of the brand mark
    // rather than a literal illustration, so it never looks out of place
    // for any destination.
    withOpacity(0.5, () => {
      setDraw(COLORS.grayLine);
      doc.setLineWidth(1);
      doc.circle(PAGE_W - 46, PAGE_H - 40, 30, 'S');
      doc.circle(PAGE_W - 80, PAGE_H - 26, 16, 'S');
    });

    let ty = heroH + 34;
    setText(COLORS.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    const titleMaxW = CONTENT_W - 130;
    const titleLines: string[] = clampLines(trip.title, titleMaxW, 2);
    doc.text(titleLines, MARGIN, ty);
    ty += titleLines.length * 27 + 4;

    // Destination line, directly under the title.
    if (trip.destination) {
      icons.pin(MARGIN, ty + 11, 13);
      setText(COLORS.darkMuted);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.text(trip.destination, MARGIN + 17, ty + 7);
      ty += 22;
    }

    // Meta row: dates • duration • total seats • age eligibility • early bird.
    // Pills auto-wrap onto a second row if the full set doesn't fit one line
    // (long destinations/durations, or an early-bird pill, can push it over).
    const { activePrice, isEarlyBird } = getActivePrice(trip.price, trip.early_bird_price, trip.early_bird_deadline);
    const metaParts = [
      formatDateRange(trip.start_date, trip.end_date),
      trip.duration,
      trip.total_seats ? `${trip.total_seats} Travelers` : '',
      formatAgeRange(trip.min_age, trip.max_age),
      isEarlyBird && activePrice ? `Early Bird ${money(activePrice)}` : '',
    ]
      .filter(Boolean)
      .map(sanitizeForPdf);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    const pillH = 20;
    const pillGap = 8;
    const rowGap = 8;
    let mx = MARGIN;
    metaParts.forEach((part, i) => {
      const w = doc.getTextWidth(part) + 16;
      if (mx + w > MARGIN + CONTENT_W && mx > MARGIN) {
        mx = MARGIN;
        ty += pillH + rowGap;
      }
      setFill(i === 0 ? COLORS.primary : COLORS.backgroundWarm);
      doc.roundedRect(mx, ty, w, pillH, 10, 10, 'F');
      setText(i === 0 ? COLORS.white : COLORS.darkMuted);
      doc.text(part, mx + 8, ty + 13.5);
      mx += w + pillGap;
    });
    ty += pillH + 16;

    if (trip.description) {
      const descBottom = PAGE_H - 34;
      const descLineHeight = 14;
      const maxLines = Math.max(1, Math.floor((descBottom - ty) / descLineHeight));
      drawParagraph(trip.description, MARGIN, ty, CONTENT_W - 130, {
        size: 10,
        color: COLORS.darkMuted,
        maxLines,
        lineHeight: descLineHeight,
      });
    }

    setText(COLORS.darkMuted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(BRAND.website, MARGIN, PAGE_H - 20);
  }

  function drawTextLogo(x: number, y: number, onDark: boolean) {
    setText(onDark ? COLORS.gold : COLORS.primary);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(BRAND.name, x, y + 13);
    setText(onDark ? COLORS.whiteMuted : COLORS.darkMuted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text(BRAND.tagline.toUpperCase(), x, y + 22);
  }

  await run();
}
