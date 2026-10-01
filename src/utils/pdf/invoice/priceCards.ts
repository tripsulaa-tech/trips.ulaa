import type { Enquiry } from '../../../types/types-index';
import type { InvoicePdfCtx } from './context';
import type { RGB } from './shared';
import { COLORS, MARGIN, CONTENT_W, ICON_WALLET, ICON_CIRCLE_CHECK, ICON_RECEIPT_RUPEE, money, fdate } from './shared';

// =============================================================================
// Price summary — three cards: Total / Paid / Balance Due. (The discount
// is shown once, in the payment summary card under the table, rather than
// in its own banner here — that kept a simple invoice on a single page.) Advances
// `ctx.cursor.y` past the card row.
// =============================================================================

const ICON_CLOCK = '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>';

// Amber "balance pending" strip under the cards, shown only while money is
// still owed (a fully paid booking needs none — the Balance Due card
// already shows it).
async function renderPendingStrip(ctx: InvoicePdfCtx, enquiry: Enquiry, balance: number): Promise<void> {
  const { doc, setFill, setText, setDraw, cursor } = ctx;
  const h = 40;
  const title = `Balance of ${money(balance)} is pending`;
  const sub = enquiry.balance_due_date
    ? `Please complete the payment by ${fdate(enquiry.balance_due_date)} to keep your seat.`
    : 'Please complete the remaining payment to keep your seat.';

  setFill(COLORS.amberBg);
  setDraw(COLORS.gold);
  doc.setLineWidth(0.75);
  doc.roundedRect(MARGIN, cursor.y, CONTENT_W, h, 6, 6, 'FD');

  const cx = MARGIN + 26;
  const cy = cursor.y + h / 2;
  setFill(COLORS.secondary);
  doc.circle(cx, cy, 12, 'F');
  await ctx.drawVectorIcon(ICON_CLOCK, cx - 7, cy - 7, 14, COLORS.white);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  setText(COLORS.primaryDark);
  doc.text(title, MARGIN + 50, cursor.y + 17);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  setText(COLORS.darkMuted);
  doc.text(sub, MARGIN + 50, cursor.y + 30);

  cursor.y += h;
}

export async function renderPriceCards(ctx: InvoicePdfCtx, enquiry: Enquiry): Promise<void> {
  const { doc, setFill, setText, setDraw, cursor } = ctx;

  const total = enquiry.total_amount || 0;
  const paid = enquiry.amount_paid || 0;
  const balance = Math.max(0, total - paid);

  const cardGap = 10;
  const cardW = (CONTENT_W - cardGap * 2) / 3;
  const cardH = 40;

  const CARD_ICONS = { wallet: ICON_WALLET, card: ICON_CIRCLE_CHECK, receipt: ICON_RECEIPT_RUPEE };

  // One style per card: neutral cream for the total, soft green for what's
  // been paid, and for the balance either the same soft green (settled) or a soft red
  // one (money still owed).
  type CardStyle = { fill: RGB; border: RGB; label: RGB; amount: RGB; iconBg: RGB; iconFg: RGB };
  const STYLE_TOTAL: CardStyle = {
    fill: [250, 245, 238], border: [232, 220, 205], label: [125, 95, 70], amount: COLORS.dark,
    iconBg: [240, 228, 212], iconFg: COLORS.primaryDark,
  };
  const STYLE_PAID: CardStyle = {
    fill: [236, 246, 240], border: [190, 222, 200], label: [62, 112, 82], amount: [28, 110, 70],
    iconBg: [210, 235, 219], iconFg: [28, 110, 70],
  };
  // Settled balance: soft brand-gold, so it reads as its own card (not a
  // second green one) while staying inside the invoice's brown/gold theme.
  const STYLE_SETTLED: CardStyle = {
    fill: [253, 246, 228], border: [238, 216, 164], label: [150, 108, 28], amount: [156, 104, 12],
    iconBg: [248, 232, 190], iconFg: [176, 124, 20],
  };
  const STYLE_DUE: CardStyle = {
    fill: [253, 238, 234], border: [236, 196, 188], label: [150, 72, 60], amount: [185, 50, 40],
    iconBg: [248, 214, 208], iconFg: [185, 50, 40],
  };

  async function drawPriceCard(x: number, label: string, amount: string, st: CardStyle, kind: 'wallet' | 'card' | 'receipt', note?: string) {
    setFill(st.fill);
    setDraw(st.border);
    doc.setLineWidth(0.75);
    doc.roundedRect(x, cursor.y, cardW, cardH, 3, 3, 'FD');

    const cx = x + 20;
    const cy = cursor.y + cardH / 2;
    setFill(st.iconBg);
    doc.circle(cx, cy, 10, 'F');
    const size = 11;
    await ctx.drawVectorIcon(CARD_ICONS[kind], cx - size / 2, cy - size / 2, size, st.iconFg);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    setText(st.label);
    doc.text(label.toUpperCase(), x + 38, cy - 3.5);
    doc.setFontSize(12);
    setText(st.amount);
    doc.text(amount, x + 38, cy + 10);

    if (note) {
      const amtW = doc.getTextWidth(amount);
      doc.setFontSize(7.5);
      setText(st.label);
      doc.text(note, x + 38 + amtW + 7, cy + 9.5);
    }
  }

  const settled = balance === 0 && total > 0;
  await drawPriceCard(MARGIN, 'Total Amount', money(total), STYLE_TOTAL, 'wallet');
  await drawPriceCard(MARGIN + cardW + cardGap, 'Amount Paid', money(paid), STYLE_PAID, 'card');
  await drawPriceCard(
    MARGIN + (cardW + cardGap) * 2,
    'Balance Due',
    money(balance),
    settled ? STYLE_SETTLED : STYLE_DUE,
    'receipt',
    settled ? 'All settled' : undefined
  );

  if (balance > 0 && total > 0) {
    cursor.y += cardH + 14;
    await renderPendingStrip(ctx, enquiry, balance);
    cursor.y += 22;
  } else {
    cursor.y += cardH + 30;
  }
}
