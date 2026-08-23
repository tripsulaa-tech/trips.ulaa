import type { Payment } from '../../../types/types-index';
import type { InvoicePdfCtx } from './context';
import type { RGB } from './shared';
import { COLORS, MARGIN, PAGE_H, PAGE_W, CONTENT_W, FOOTER_RESERVE, PAYMENT_TYPE_LABEL, val, money, fdate } from './shared';

// =============================================================================
// Payment history table — column positions sized from actual measured max
// text widths for each column's content (invoice numbers, dates, UTR
// strings, etc.) plus a fixed buffer, not guesses, so no column's text can
// ever run into the next column or its divider line. Every row checks
// `ctx.checkPageBreak` so a break always falls cleanly on a row boundary —
// never mid-row — and redraws the table header on the new page. Advances
// `ctx.cursor.y` past the table and its bottom divider.
// =============================================================================

export function renderPaymentTable(ctx: InvoicePdfCtx, payments: Payment[]): void {
  const { doc, setFill, setText, setDraw, cursor } = ctx;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  setText(COLORS.dark);
  doc.text('PAYMENT HISTORY', MARGIN, cursor.y);
  setDraw(COLORS.grayLine);
  doc.setLineWidth(0.75);
  doc.line(MARGIN, cursor.y + 6, PAGE_W - MARGIN, cursor.y + 6);
  cursor.y += 24;

  const colInvoice = MARGIN;       // 40
  const colDate = MARGIN + 88;     // 128
  const colType = MARGIN + 149;    // 189
  const colMethod = MARGIN + 228;  // 268
  const colUtr = MARGIN + 293;     // 333
  const colAmountRight = MARGIN + 443; // 483, right-aligned
  const colStatus = MARGIN + 447;      // 487, badge centered at colStatus+32

  // Vertical divider x-positions, one centered in each gap between columns.
  const TABLE_DIVIDERS = [123, 184, 263, 328, 423, 488];

  function drawColumnDividers(y: number, h: number, color: RGB) {
    setDraw(color);
    doc.setLineWidth(0.5);
    TABLE_DIVIDERS.forEach((x) => doc.line(x, y, x, y + h));
  }

  function drawTableHeader() {
    setFill(COLORS.primaryDark);
    doc.rect(MARGIN, cursor.y, CONTENT_W, 24, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    setText(COLORS.white);
    doc.text('INVOICE #', colInvoice + 8, cursor.y + 15.5);
    doc.text('DATE', colDate, cursor.y + 15.5);
    doc.text('TYPE', colType, cursor.y + 15.5);
    doc.text('METHOD', colMethod, cursor.y + 15.5);
    doc.text('UTR / TXN ID', colUtr, cursor.y + 15.5);
    doc.text('AMOUNT', colAmountRight, cursor.y + 15.5, { align: 'right' });
    doc.text('STATUS', colStatus + 32, cursor.y + 15.5, { align: 'center' });
    drawColumnDividers(cursor.y, 24, COLORS.secondary);
    cursor.y += 24;
  }

  drawTableHeader();

  if (payments.length === 0) {
    ctx.checkPageBreak(30);
    setFill(COLORS.cream);
    doc.rect(MARGIN, cursor.y, CONTENT_W, 30, 'F');
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9.5);
    setText(COLORS.darkMuted);
    doc.text('No payments recorded yet.', PAGE_W / 2, cursor.y + 19, { align: 'center' });
    cursor.y += 30;
  } else {
    payments.forEach((p, i) => {
      const rowH = 24;

      // If a break happens here, redraw the table header on the new page
      // so a reader who lands mid-table on page 2 still sees column
      // labels — the break itself always falls on a row boundary.
      if (cursor.y + rowH > PAGE_H - FOOTER_RESERVE) {
        ctx.newPage();
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        setText(COLORS.dark);
        doc.text('PAYMENT HISTORY (continued)', MARGIN, cursor.y);
        cursor.y += 18;
        drawTableHeader();
      }

      const isRefund = p.payment_type === 'refund';
      const isPending = p.status === 'pending';

      if (i % 2 === 0) {
        setFill(COLORS.cream);
        doc.rect(MARGIN, cursor.y, CONTENT_W, rowH, 'F');
      }

      const textY = cursor.y + 15.5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      setText(COLORS.dark);
      doc.text(val(p.invoice_number), colInvoice + 8, textY);
      doc.text(fdate(p.paid_at), colDate, textY);
      doc.text(PAYMENT_TYPE_LABEL[p.payment_type] ?? p.payment_type, colType, textY);

      const methodLines = doc.splitTextToSize(val(p.payment_method), 55);
      doc.text(methodLines[0], colMethod, textY);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.8);
      setText(p.utr_number ? COLORS.dark : COLORS.darkMuted);
      const utrLines = doc.splitTextToSize(val(p.utr_number), 85);
      doc.text(utrLines[0], colUtr, textY);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      setText(isRefund ? COLORS.red : COLORS.green);
      doc.text(`${isRefund ? '\u2212 ' : ''}${money(Math.abs(p.amount))}`, colAmountRight, textY, { align: 'right' });

      const badgeText = isPending ? 'Pending' : 'Paid';
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      const badgeW = doc.getTextWidth(badgeText) + 14;
      const badgeX = colStatus + 32 - badgeW / 2;
      setFill(isPending ? COLORS.amberBg : COLORS.greenBg);
      doc.roundedRect(badgeX, cursor.y + rowH / 2 - 8, badgeW, 16, 8, 8, 'F');
      setText(isPending ? COLORS.primaryDark : COLORS.green);
      doc.text(badgeText, colStatus + 32, cursor.y + rowH / 2 + 3, { align: 'center' });

      drawColumnDividers(cursor.y, rowH, COLORS.grayLineSoft);
      cursor.y += rowH;
    });
  }

  setDraw(COLORS.grayLineSoft);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, cursor.y, PAGE_W - MARGIN, cursor.y);
  cursor.y += 26;
}
