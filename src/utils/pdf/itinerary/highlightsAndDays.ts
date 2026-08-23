import { Star } from 'lucide-react';
import type { PdfCtx } from './context';
import type { RGB, PdfTrip } from './shared';
import type { TripHighlightCard, ItineraryDay } from '../../../types/types-index';
import { MARGIN, PAGE_W, CONTENT_W, CONTENT_BOTTOM, COLORS, resolveIcon } from './shared';
import { getTripHighlightIcon } from '../../../constants/tripHighlightIcons';

/** Renders "Why You'll Love This Trip" (highlight cards) + "N Days of
 *  Unforgettable Moments" (day badge strip). Extracted from
 *  tripItineraryPdf.ts. */
export async function renderHighlightsAndDays(ctx: PdfCtx, trip: PdfTrip): Promise<void> {
  const { doc, setFill, setText, setDraw, newSlide, clampLines, drawLucideIcon } = ctx;

  // =========================================================================
  // SLIDE — "Why You'll Love This Trip" (highlight cards) + "N Days of
  // Unforgettable Moments" (day badge strip). Mirrors the two sections that
  // sit back-to-back on the public Trip Detail page. Both are short by
  // nature (a handful of cards, a handful of days) so they normally share
  // one slide; if a trip has an unusually long list of either, each section
  // gets its own paginated slide(s) instead of squeezing/overflowing.
  // =========================================================================
  const CARD_PALETTE: RGB[] = [COLORS.primary, COLORS.secondary, COLORS.gold, COLORS.green];

  function drawSectionTitle(title: string, top: number): number {
    setText(COLORS.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(19);
    doc.text(title, PAGE_W / 2, top + 14, { align: 'center' });
    return top + 34;
  }

  async function drawHighlightCard(card: TripHighlightCard, x: number, y: number, w: number, h: number, color: RGB) {
    setFill(COLORS.cream);
    doc.roundedRect(x, y, w, h, 10, 10, 'F');
    setDraw(COLORS.grayLineSoft);
    doc.setLineWidth(0.75);
    doc.roundedRect(x, y, w, h, 10, 10, 'S');

    const cx = x + w / 2;
    const iconCy = y + 28;
    setFill(color);
    doc.circle(cx, iconCy, 15, 'F');
    // The admin's actual picked icon (same TripHighlightIconDisplay renders
    // on the live site), not a fixed star — falls back to Star only for
    // legacy/emoji values the picker predates.
    await drawLucideIcon(resolveIcon(card.icon, Star), cx - 9, iconCy + 9, 18, COLORS.white);

    let ty = iconCy + 32;
    setText(COLORS.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    const headingLines = clampLines(card.heading, w - 24, 1);
    doc.text(headingLines, cx, ty, { align: 'center' });
    ty += 16;

    setText(COLORS.darkMuted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const descLines = clampLines(card.description, w - 28, 3);
    doc.text(descLines, cx, ty, { align: 'center', lineHeightFactor: 1.35 });
  }

  const HIGHLIGHT_CARD_H = 110;
  const HIGHLIGHT_ROW_GAP = 16;
  const HIGHLIGHT_PER_ROW = 3;

  /** Draws up to `cards.length` highlight cards as a wrapping 3-across grid
   *  and returns the y position immediately below the grid. */
  async function drawHighlightGrid(cards: TripHighlightCard[], top: number): Promise<number> {
    const colGap = 20;
    const cardW = (CONTENT_W - colGap * (HIGHLIGHT_PER_ROW - 1)) / HIGHLIGHT_PER_ROW;
    for (let i = 0; i < cards.length; i++) {
      const row = Math.floor(i / HIGHLIGHT_PER_ROW);
      const col = i % HIGHLIGHT_PER_ROW;
      const x = MARGIN + col * (cardW + colGap);
      const y = top + row * (HIGHLIGHT_CARD_H + HIGHLIGHT_ROW_GAP);
      await drawHighlightCard(cards[i], x, y, cardW, HIGHLIGHT_CARD_H, CARD_PALETTE[i % CARD_PALETTE.length]);
    }
    const rows = Math.ceil(cards.length / HIGHLIGHT_PER_ROW);
    return top + rows * HIGHLIGHT_CARD_H + Math.max(0, rows - 1) * HIGHLIGHT_ROW_GAP;
  }

  const DAY_ROW_PITCH = 100;
  const DAY_PER_ROW = 6;

  /** Draws the "N Days of Unforgettable Moments" heading plus a row (or
   *  wrapped rows) of day badges — a circle with the day number, connected
   *  by a dotted line, with the day's title underneath — echoing the
   *  itinerary-day strip at the top of the public trip page. `totalLabel`
   *  lets a continuation slide keep showing the true overall day count
   *  while only laying out its own chunk of days. When a day has an
   *  admin-picked icon (day.icon), the badge shows that icon instead of the
   *  day number — matching the live site's itinerary-day button, which
   *  swaps in the same icon in place of the number once one is set. */
  async function drawDaysSection(days: ItineraryDay[], top: number, totalLabel?: string) {
    setText(COLORS.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    const heading = totalLabel ?? `${days.length} Day${days.length === 1 ? '' : 's'} of Unforgettable Moments`;
    doc.text(heading, PAGE_W / 2, top + 12, { align: 'center' });

    const rowTop = top + 40;
    const perRow = Math.min(days.length, DAY_PER_ROW);
    const cellW = CONTENT_W / perRow;
    const circleR = 20;

    for (let i = 0; i < days.length; i++) {
      const day = days[i];
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const cx = MARGIN + col * cellW + cellW / 2;
      const cy = rowTop + row * DAY_ROW_PITCH + circleR;

      // Dotted connector to the next badge in the same row.
      if (col < perRow - 1 && i < days.length - 1) {
        setDraw(COLORS.grayLine);
        doc.setLineWidth(1);
        doc.setLineDashPattern([2, 2], 0);
        doc.line(cx + circleR, cy, cx + cellW - circleR, cy);
        doc.setLineDashPattern([], 0);
      }

      setFill(COLORS.primary);
      doc.circle(cx, cy, circleR, 'F');
      const dayMeta = day.icon ? getTripHighlightIcon(day.icon) : undefined;
      if (dayMeta) {
        await drawLucideIcon(dayMeta.Icon, cx - 10, cy + 10, 20, COLORS.white);
      } else {
        setText(COLORS.white);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.text('DAY', cx, cy - 4, { align: 'center' });
        doc.setFontSize(13);
        doc.text(String(day.day), cx, cy + 9, { align: 'center' });
      }

      setText(COLORS.dark);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      const titleLines = clampLines(day.title, cellW - 12, 2);
      doc.text(titleLines, cx, cy + circleR + 16, { align: 'center' });
    }
  }

  async function renderHighlightCardsSlides(cards: TripHighlightCard[]) {
    const perSlide = HIGHLIGHT_PER_ROW * 2;
    for (let i = 0; i < cards.length; i += perSlide) {
      newSlide();
      const top = drawSectionTitle("Why You'll Love This Trip", MARGIN);
      await drawHighlightGrid(cards.slice(i, i + perSlide), top);
    }
  }

  async function renderDaySlides(days: ItineraryDay[]) {
    const perSlide = DAY_PER_ROW * 2;
    for (let i = 0; i < days.length; i += perSlide) {
      newSlide();
      const label = `${days.length} Day${days.length === 1 ? '' : 's'} of Unforgettable Moments`;
      await drawDaysSection(days.slice(i, i + perSlide), MARGIN, label);
    }
  }

  async function run() {
    const cards = trip.highlight_cards;
    const days = trip.itinerary;
    if (cards.length === 0 && days.length === 0) return;

    const cardRows = cards.length ? Math.ceil(cards.length / HIGHLIGHT_PER_ROW) : 0;
    const cardsBlockH = cards.length ? 34 + cardRows * HIGHLIGHT_CARD_H + Math.max(0, cardRows - 1) * HIGHLIGHT_ROW_GAP : 0;
    const dayPerRow = Math.min(days.length, DAY_PER_ROW);
    const dayRows = dayPerRow ? Math.ceil(days.length / dayPerRow) : 0;
    const daysBlockH = days.length ? 40 + dayRows * DAY_ROW_PITCH : 0;
    const gapBetween = cards.length && days.length ? 28 : 0;
    const availH = CONTENT_BOTTOM - MARGIN;

    if (cardsBlockH + gapBetween + daysBlockH <= availH) {
      newSlide();
      let y = MARGIN;
      if (cards.length) {
        y = drawSectionTitle("Why You'll Love This Trip", y);
        y = await drawHighlightGrid(cards, y);
        y += gapBetween;
      }
      if (days.length) {
        await drawDaysSection(days, y);
      }
    } else {
      if (cards.length) await renderHighlightCardsSlides(cards);
      if (days.length) await renderDaySlides(days);
    }
  }


  await run();
}
