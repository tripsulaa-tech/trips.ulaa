import type { PdfCtx } from './context';
import type { PdfTrip } from './shared';
import { MARGIN, CONTENT_W, CONTENT_BOTTOM, COLORS } from './shared';

  // =========================================================================
  // SLIDES — FAQs (2 independent columns, balanced, paginated)
  // =========================================================================
  // Each FAQ goes into whichever column is currently shorter, so a short answer
  // never leaves a gap waiting on a tall answer next to it (no row alignment).
  // Because the reading order then zig-zags between columns, each question carries
  // a numbered badge (Q1, Q2, ...) in the order it appears on the trip page.
  export function renderFaqs(ctx: PdfCtx, trip: PdfTrip): void {
  const { doc, setFill, setText, newSlide, slideHeader, drawParagraph, measureParagraphHeight, paginateTwoColumns } = ctx;

    if (trip.faqs.length === 0) return;

    const colGap = 36;
    const colW = (CONTENT_W - colGap) / 2;
    const top = 92;
    const START_OFFSET = 14; // just under the header rule
    const ITEM_GAP = 16;
    const availH = CONTENT_BOTTOM - top - START_OFFSET;

    type NumberedFaq = { question: string; answer: string; n: number };
    const faqs: NumberedFaq[] = trip.faqs.map((faq, i) => ({ ...faq, n: i + 1 }));

    // One badge width for every question so the question text lines up.
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    const BADGE_H = 12;
    const badgeW = Math.max(18, doc.getTextWidth(`Q${faqs.length}`) + 10);
    const questionW = colW - badgeW - 8;

    const measureFaq = (faq: NumberedFaq) => {
      const qH = measureParagraphHeight(faq.question, questionW, 11.5, 15.5);
      const aH = measureParagraphHeight(faq.answer, colW - 16, 9.5, 13.5, 4);
      // + the gap after it; availH gets the same gap added back below, so the
      // last item on a slide doesn't need trailing space.
      return qH + 4 + aH + ITEM_GAP;
    };

    const pages = paginateTwoColumns(faqs, measureFaq, availH + ITEM_GAP);

    function drawColumn(x: number, startY: number, items: NumberedFaq[]) {
      let y = startY;
      items.forEach(faq => {
        setFill(COLORS.primary);
        doc.roundedRect(x, y - 10, badgeW, BADGE_H, BADGE_H / 2, BADGE_H / 2, 'F');
        setText(COLORS.white);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text(`Q${faq.n}`, x + badgeW / 2, y - 1.5, { align: 'center' });

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11.5);
        setText(COLORS.dark);
        const qLines = doc.splitTextToSize(faq.question, questionW);
        doc.text(qLines, x + badgeW + 8, y);
        y += qLines.length * 15.5 + 4;

        y = drawParagraph(faq.answer, x, y, colW, { size: 9.5, color: COLORS.darkMuted, lineHeight: 13.5, maxLines: 4 });
        y += ITEM_GAP;
      });
    }

    pages.forEach((page, p) => {
      newSlide();
      slideHeader(null, p === 0 ? 'FAQs' : 'FAQs (continued)');
      // Top-aligned (just under the header rule), not vertically centred.
      const startY = top + START_OFFSET;
      if (page.left.length) drawColumn(MARGIN, startY, page.left);
      if (page.right.length) drawColumn(MARGIN + colW + colGap, startY, page.right);
    });
  }
