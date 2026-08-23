import type { Enquiry } from '../../../types/types-index';
import type { InvoicePdfCtx } from './context';
import type { RGB } from './shared';
import { COLORS, MARGIN, CONTENT_W, ICON_WALLET, ICON_CIRCLE_CHECK, ICON_RECEIPT_RUPEE, money } from './shared';

// =============================================================================
// Price summary — three cards: Total / Paid / Balance Due. Advances
// `ctx.cursor.y` past the card row.
// =============================================================================

export async function renderPriceCards(ctx: InvoicePdfCtx, enquiry: Enquiry): Promise<void> {
  const { doc, setFill, setText, setDraw, cursor } = ctx;

  const total = enquiry.total_amount || 0;
  const paid = enquiry.amount_paid || 0;
  const balance = Math.max(0, total - paid);

  const cardGap = 14;
  const cardW = (CONTENT_W - cardGap * 2) / 3;
  const cardH = 62;

  const CARD_ICONS = { wallet: ICON_WALLET, card: ICON_CIRCLE_CHECK, receipt: ICON_RECEIPT_RUPEE };

  async function drawIconCircle(cx: number, cy0: number, bg: RGB, fg: RGB, kind: 'wallet' | 'card' | 'receipt') {
    setFill(bg);
    doc.circle(cx, cy0, 15, 'F');
    const size = 16;
    await ctx.drawVectorIcon(CARD_ICONS[kind], cx - size / 2, cy0 - size / 2, size, fg);
  }

  async function drawPriceCard(x: number, label: string, amount: string, color: RGB, iconBg: RGB, kind: 'wallet' | 'card' | 'receipt') {
    setFill(COLORS.cream);
    setDraw(COLORS.grayLineSoft);
    doc.setLineWidth(0.75);
    doc.roundedRect(x, cursor.y, cardW, cardH, 3, 3, 'FD');
    await drawIconCircle(x + 28, cursor.y + cardH / 2, iconBg, color, kind);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    setText(COLORS.darkMuted);
    doc.text(label.toUpperCase(), x + 50, cursor.y + cardH / 2 - 6);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    setText(color);
    doc.text(amount, x + 50, cursor.y + cardH / 2 + 12);
  }

  await drawPriceCard(MARGIN, 'Total Amount', money(total), COLORS.dark, COLORS.backgroundWarm, 'wallet');
  await drawPriceCard(MARGIN + cardW + cardGap, 'Amount Paid', money(paid), COLORS.green, COLORS.greenBg, 'card');
  await drawPriceCard(
    MARGIN + (cardW + cardGap) * 2,
    'Balance Due',
    money(balance),
    balance > 0 ? COLORS.red : COLORS.green,
    balance > 0 ? COLORS.redBg : COLORS.greenBg,
    'receipt'
  );

  cursor.y += cardH + 30;
}
