import type { Enquiry } from '../../../types/types-index';
import type { InvoicePdfCtx } from './context';
import { BRAND, COLORS, MARGIN, PAGE_W, ICON_GLOBE, ICON_MAIL, ICON_PHONE, ICON_CALENDAR, val, fdate } from './shared';

// =============================================================================
// Header — logo/tagline/contact on the left, invoice title/booking ID/date
// on the right. Advances `ctx.cursor.y` past the divider line beneath it.
// =============================================================================

export async function renderHeader(
  ctx: InvoicePdfCtx,
  enquiry: Enquiry,
  logo: { dataUrl: string; ratio: number } | null
): Promise<void> {
  const { doc, setFill, setText, setDraw, cursor } = ctx;
  const invoiceDate = fdate(new Date().toISOString());

  const headerTop = cursor.y;
  const logoBoxW = 120;
  const logoBoxH = 84;

  // Left block — logo, tagline and website share one centre line, so the
  // three read as a single centred lockup.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  const tagW = doc.getTextWidth(BRAND.tagline);
  const webIconSize = 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const webUnitW = webIconSize + 5 + doc.getTextWidth(BRAND.website);

  let drawW = 0;
  let drawH = 0;
  if (logo) {
    drawH = Math.min(logoBoxH, logoBoxW / logo.ratio);
    drawW = drawH * logo.ratio;
  }
  const blockW = Math.max(drawW, tagW, webUnitW);
  const centreX = MARGIN + blockW / 2;

  if (logo) {
    const format = logo.dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
    doc.addImage(logo.dataUrl, format, centreX - drawW / 2, headerTop, drawW, drawH);
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    setText(COLORS.primary);
    doc.text(BRAND.name, centreX, headerTop + 24, { align: 'center' });
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setText(COLORS.darkMuted);
  doc.text(BRAND.tagline, centreX, headerTop + logoBoxH + 12, { align: 'center' });

  const webY = headerTop + logoBoxH + 28;
  const webX = centreX - webUnitW / 2;
  await ctx.drawVectorIcon(ICON_GLOBE, webX, webY - webIconSize + 1.5, webIconSize, COLORS.primaryDark);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setText(COLORS.darkMuted);
  doc.text(BRAND.website, webX + webIconSize + 5, webY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  setText(COLORS.dark);
  doc.text('BOOKING INVOICE', PAGE_W - MARGIN, headerTop + 16, { align: 'right' });

  setDraw(COLORS.gold);
  doc.setLineWidth(1);
  doc.line(PAGE_W - MARGIN - 150, headerTop + 26, PAGE_W - MARGIN, headerTop + 26);
  setFill(COLORS.gold);
  doc.circle(PAGE_W - MARGIN - 75, headerTop + 26, 2.4, 'F');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  setText(COLORS.darkMuted);
  doc.text('BOOKING ID', PAGE_W - MARGIN, headerTop + 38, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  const bookingIdText = val(enquiry.booking_id);
  const bidW = doc.getTextWidth(bookingIdText) + 20;
  setFill(COLORS.backgroundWarm);
  doc.roundedRect(PAGE_W - MARGIN - bidW, headerTop + 43, bidW, 20, 4, 4, 'F');
  setText(COLORS.primaryDark);
  doc.text(bookingIdText, PAGE_W - MARGIN - bidW / 2, headerTop + 57, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setText(COLORS.darkMuted);
  const dateText = `Invoice Date: ${invoiceDate}`;
  const dateTextW = doc.getTextWidth(dateText);
  doc.text(dateText, PAGE_W - MARGIN, headerTop + 77, { align: 'right' });
  await ctx.drawVectorIcon(ICON_CALENDAR, PAGE_W - MARGIN - dateTextW - 5 - 9, headerTop + 77 - 9 + 1.5, 9, COLORS.primaryDark);

  // Website / email / phone — right-aligned under the invoice date, each
  // led by the same icon the site's footer uses (vector shapes). Keeps the
  // left column to just logo + tagline so both sides of the header carry
  // similar weight.
  let contactY = headerTop + 96;
  const contactRows: { text: string; icon: string }[] = [
    { text: BRAND.email, icon: ICON_MAIL },
    { text: BRAND.phone, icon: ICON_PHONE },
  ];
  const contactIconSize = 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  for (const row of contactRows) {
    const textW = doc.getTextWidth(row.text);
    const textX = PAGE_W - MARGIN - textW;
    setText(COLORS.darkMuted);
    doc.text(row.text, textX, contactY);
    await ctx.drawVectorIcon(row.icon, textX - contactIconSize - 5, contactY - contactIconSize + 1.5, contactIconSize, COLORS.primaryDark);
    contactY += 13;
  }

  // Divider sits just under whichever column is taller.
  cursor.y = Math.max(webY + 14, contactY + 1);
  setDraw(COLORS.grayLine);
  doc.setLineWidth(0.75);
  doc.line(MARGIN, cursor.y, PAGE_W - MARGIN, cursor.y);
  cursor.y += 22;
}
