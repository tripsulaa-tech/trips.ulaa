import type { PdfCtx } from './context';
import type { PdfTrip } from './shared';
import { MARGIN, CONTENT_W, CONTENT_BOTTOM, COLORS, loadCoverCroppedImage } from './shared';

  // =========================================================================
  // SLIDES — Detailed Itinerary (2×2 photo cards per slide, paginated)
  // =========================================================================
  export async function renderItinerary(ctx: PdfCtx, trip: PdfTrip): Promise<void> {
  const { doc, setFill, setText, setDraw, newSlide, clampLines, slideHeader, drawParagraph, drawBulletList } = ctx;

    if (trip.itinerary.length === 0) return;

    const cols = 2;
    const rows = 1;
    const perPage = cols * rows;
    const gridTop = 106; // clears the subtitle (only shown on the first page) with room to spare
    const colGap = 20;
    const rowGap = 16;
    const cardW = cols > 1 ? (CONTENT_W - colGap * (cols - 1)) / cols : CONTENT_W;
    const fullAvailH = CONTENT_BOTTOM - gridTop;

    for (let pageStart = 0; pageStart < trip.itinerary.length; pageStart += perPage) {
      newSlide();
      const isFirst = pageStart === 0;
      slideHeader(
        null,
        'Detailed Itinerary',
        isFirst ? `${trip.itinerary.length} day${trip.itinerary.length === 1 ? '' : 's'} of things to do` : undefined
      );

      const pageItems = trip.itinerary.slice(pageStart, pageStart + perPage);
      const rowsUsed = Math.ceil(pageItems.length / cols);
      // A page with a single row of cards (last page has 1-2 days left)
      // gets the full slide height instead of being squeezed into half of
      // it with a blank row underneath.
      const cardH = rowsUsed < rows ? fullAvailH : (fullAvailH - rowGap) / rows;

      for (let i = 0; i < pageItems.length; i++) {
        const day = pageItems[i];
        const row = Math.floor(i / cols);
        const itemsInRow = Math.min(cols, pageItems.length - row * cols);
        const rowOffset = ((cols - itemsInRow) * (cardW + colGap)) / 2; // centers an incomplete last row
        const colIdx = i % cols;
        const cx = MARGIN + rowOffset + colIdx * (cardW + colGap);
        const cy = gridTop + row * (cardH + rowGap);

        setFill(COLORS.cream);
        doc.roundedRect(cx, cy, cardW, cardH, 8, 8, 'F');
        setDraw(COLORS.grayLine);
        doc.setLineWidth(0.75);
        doc.roundedRect(cx, cy, cardW, cardH, 8, 8, 'S');

        const pad = 14;
        const hasImages = !!day.images && day.images.length > 0;
        const thumbH = hasImages ? Math.min(160, cardH * 0.34) : 0;
        const textBottom = cy + cardH - pad - thumbH - (hasImages ? 10 : 0);
        let ty = cy + pad + 12;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11.5);
        setText(COLORS.dark);
        const titleLines = clampLines(day.title, cardW - pad * 2, 2);
        doc.text(titleLines, cx + pad, ty);
        ty += titleLines.length * 15 + 8;

        const lineH = 12.5;
        const availLines = Math.max(1, Math.floor((textBottom - ty) / lineH));
        let usedLines = 0;
        const hasDescription = !!day.description && day.description.trim().length > 0;
        const dayBullets = day.bullets ?? [];
        const hasBullets = dayBullets.length > 0;

        if (hasDescription) {
          const beforeTy = ty;
          ty = drawParagraph(day.description, cx + pad, ty, cardW - pad * 2, {
            size: 8.8,
            color: COLORS.darkMuted,
            lineHeight: lineH,
            maxLines: availLines,
          });
          usedLines += Math.round((ty - beforeTy) / lineH);
          if (hasBullets && usedLines < availLines) ty += 4;
        }

        if (hasBullets) {
          const remainingLines = availLines - usedLines;
          if (remainingLines > 0) {
            drawBulletList(dayBullets, cx + pad, ty, cardW - pad * 2, {
              size: 8.8,
              color: COLORS.darkMuted,
              lineHeight: lineH,
              maxLines: remainingLines,
            });
          }
        }

        if (hasImages) {
          const imgs = (day.images || []).slice(0, 3);
          const thumbGap = 6;
          const thumbW = (cardW - pad * 2 - thumbGap * (imgs.length - 1)) / imgs.length;
          const thumbY = cy + cardH - pad - thumbH;
          const crops = await Promise.all(imgs.map(url => loadCoverCroppedImage(url, thumbW, thumbH, 4)));
          crops.forEach((cropped, idx) => {
            const tx = cx + pad + idx * (thumbW + thumbGap);
            if (cropped) {
              try {
                doc.addImage(cropped, 'JPEG', tx, thumbY, thumbW, thumbH);
                return;
              } catch {
                /* fall through to placeholder */
              }
            }
            setFill(COLORS.backgroundWarm);
            doc.roundedRect(tx, thumbY, thumbW, thumbH, 4, 4, 'F');
          });
        }
      }
    }
  }
