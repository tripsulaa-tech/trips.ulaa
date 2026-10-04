import type { Payment } from '../../../types/types-index';
import type { InvoicePdfCtx } from './context';
import { sanitizeForPdf } from '../../pdfText';
import type { RGB } from './shared';
import { formatPrice } from '../../utils-index';
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
      // An add-on row carries its name (what it was for) as a small second
      // line under "Add-on", so that row is a little taller.
      const addonName = p.payment_type === 'addon' && p.notes ? p.notes.trim() : '';
      const rowH = addonName ? 34 : 24;

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
      if (addonName) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7.5);
        setText(COLORS.darkMuted);
        // The Type column is narrow, so wrap to its width and keep one line
        // (with an ellipsis if it runs long) so it can't touch the next column.
        const nameLines: string[] = doc.splitTextToSize(sanitizeForPdf(addonName), colMethod - colType - 8);
        doc.text(nameLines.length > 1 ? `${nameLines[0].replace(/\s+\S*$/, '')}\u2026` : nameLines[0], colType, textY + 10);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        setText(COLORS.dark);
      }

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
  cursor.y += 16;

  const { enquiry } = ctx;
  const addonsAll = payments.reduce((sum, p) => sum + (p.payment_type === 'addon' ? Math.abs(p.amount) : 0), 0);
  const discount = enquiry.discount_amount || 0;
  const totalAmount = enquiry.total_amount || 0;
  // Sum of the settled rows above (pending ones excluded, refunds subtracted),
  // so this line always ties back to the table.
  const totalPaid = payments.reduce((sum, p) => {
    if (p.status === 'pending') return sum;
    return sum + (p.payment_type === 'refund' ? -Math.abs(p.amount) : p.amount);
  }, 0);

  // Totals block, right-aligned under the table:
  //   Trip Fare / (Add-ons) / (Referral Discount)
  //   ──────────────
  //   Total Payable
  //   ──────────────
  //   Paid / Balance Due
  // Labels use helvetica; amounts use the embedded RupeeSans subset so the
  // real ₹ glyph prints (helvetica's charset has none). If that font failed
  // to register, amounts fall back to the sanitized "Rs." form.
  const hasRupee = Boolean((doc.getFontList() as Record<string, unknown>).RupeeSans);
  const amountText = (n: number) => (hasRupee ? formatPrice(n) : money(n));

  function drawAmount(n: number, y: number, color: RGB, opts: { bold?: boolean; size: number; minus?: boolean }) {
    const x = PAGE_W - MARGIN;
    setText(color);
    doc.setFontSize(opts.size);
    doc.setFont(hasRupee ? 'RupeeSans' : 'helvetica', opts.bold ? 'bold' : 'normal');
    const txt = amountText(n);
    doc.text(txt, x, y, { align: 'right' });
    if (opts.minus) {
      // Drawn as a short bar: the core PDF font has no true minus glyph.
      const w = doc.getTextWidth(txt);
      const barW = 5;
      const gap = 4;
      setDraw(color);
      doc.setLineWidth(1.1);
      doc.line(x - w - gap - barW, y - opts.size * 0.3, x - w - gap, y - opts.size * 0.3);
    }
  }

  function drawRow(label: string, n: number, y: number, o: { labelColor: RGB; valueColor: RGB; bold: boolean; size: number; minus?: boolean }) {
    doc.setFont('helvetica', o.bold ? 'bold' : 'normal');
    doc.setFontSize(o.size);
    setText(o.labelColor);
    doc.text(label, left, y);
    drawAmount(n, y, o.valueColor, { bold: true, size: o.size, minus: o.minus });
  }

  const tripFare = Math.max(0, totalAmount - addonsAll + discount);
  const balanceDue = Math.max(0, totalAmount - totalPaid);

  const sumW = 240;
  const left = PAGE_W - MARGIN - sumW;
  const right = PAGE_W - MARGIN;
  const lineH = 18;
  const rows = 1 + (addonsAll > 0 ? 1 : 0) + (discount > 0 ? 1 : 0);
  ctx.checkPageBreak(rows * lineH + 110);

  let ty = cursor.y + 10;
  drawRow('Trip Fare', tripFare, ty, { labelColor: COLORS.darkMuted, valueColor: COLORS.dark, bold: false, size: 9.5 });
  ty += lineH;
  if (addonsAll > 0) {
    drawRow('Add-ons', addonsAll, ty, { labelColor: COLORS.darkMuted, valueColor: COLORS.dark, bold: false, size: 9.5 });
    ty += lineH;
  }
  if (discount > 0) {
    const reason = sanitizeForPdf(enquiry.discount_reason);
    const label = !reason ? 'Discount' : /discount/i.test(reason) ? reason : `${reason} Discount`;
    drawRow(label, discount, ty, { labelColor: COLORS.darkMuted, valueColor: COLORS.green, bold: false, size: 9.5, minus: true });
    ty += lineH;
  }

  ty -= 4;
  setDraw(COLORS.primaryDark);
  doc.setLineWidth(1);
  doc.line(left, ty, right, ty);
  ty += 16;
  drawRow('Total Payable', totalAmount, ty, { labelColor: COLORS.dark, valueColor: COLORS.dark, bold: true, size: 11 });

  ty += 10;
  doc.line(left, ty, right, ty);
  ty += 16;
  drawRow('Paid', totalPaid, ty, { labelColor: COLORS.green, valueColor: COLORS.green, bold: true, size: 10.5 });
  ty += 18;
  const balColor = balanceDue > 0 ? COLORS.red : COLORS.green;
  drawRow('Balance Due', balanceDue, ty, { labelColor: balColor, valueColor: balColor, bold: true, size: 10.5 });

  cursor.y = ty + 22;
}
