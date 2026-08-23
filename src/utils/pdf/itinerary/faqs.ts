import type { PdfCtx } from './context';
import type { PdfTrip } from './shared';
import { MARGIN, CONTENT_W, CONTENT_BOTTOM, COLORS } from './shared';

  // =========================================================================
  // SLIDES — FAQs (2-column, balanced, paginated)
  // =========================================================================
  export function renderFaqs(ctx: PdfCtx, trip: PdfTrip): void {
  const { doc, setFill, setText, newSlide, slideHeader, drawParagraph, measureParagraphHeight, paginateTwoColumns, centeredTop } = ctx;

    if (trip.faqs.length === 0) return;

    const colGap = 36;
    const colW = (CONTENT_W - colGap) / 2;
    const top = 92;
    const availH = CONTENT_BOTTOM - top;

    const measureFaq = (faq: { question: string; answer: string }) => {
      const qH = measureParagraphHeight(faq.question, colW - 16, 11.5, 15.5);
      const aH = measureParagraphHeight(faq.answer, colW - 16, 9.5, 13.5, 4);
      return qH + aH + 22;
    };

    const balanced = paginateTwoColumns(trip.faqs, measureFaq, availH);

    function drawColumn(x: number, startY: number, faqs: { question: string; answer: string }[]) {
      let y = startY;
      faqs.forEach(faq => {
        setFill(COLORS.primary);
        doc.circle(x + 6, y - 4, 6, 'F');
        setText(COLORS.white);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text('Q', x + 6, y - 1.5, { align: 'center' });

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11.5);
        setText(COLORS.dark);
        const qLines = doc.splitTextToSize(faq.question, colW - 20);
        doc.text(qLines, x + 18, y);
        y += qLines.length * 15.5 + 4;

        y = drawParagraph(faq.answer, x, y, colW, { size: 9.5, color: COLORS.darkMuted, lineHeight: 13.5, maxLines: 4 });
        y += 18;
      });
    }

    balanced.forEach((page, p) => {
      newSlide();
      slideHeader(null, p === 0 ? 'FAQs' : 'FAQs (continued)');
      const startY = centeredTop(top, CONTENT_BOTTOM, Math.max(page.leftH, page.rightH));
      if (page.left.length) drawColumn(MARGIN, startY, page.left);
      if (page.right.length) drawColumn(MARGIN + colW + colGap, startY, page.right);
    });
  }
