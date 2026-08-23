import type { Enquiry } from '../../../types/types-index';
import type { InvoicePdfCtx } from './context';
import { BRAND, COLORS, MARGIN, PAGE_W, ICON_GLOBE, ICON_MAIL, ICON_PHONE, val, fdate } from './shared';

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
  const logoBoxW = 132;
  const logoBoxH = 42;
  if (logo) {
    const drawH = Math.min(logoBoxH, logoBoxW / logo.ratio);
    const drawW = drawH * logo.ratio;
    const format = logo.dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
    doc.addImage(logo.dataUrl, format, MARGIN, headerTop, drawW, drawH);
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    setText(COLORS.primary);
    doc.text(BRAND.name, MARGIN, headerTop + 24);
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setText(COLORS.darkMuted);
  doc.text(BRAND.tagline, MARGIN, headerTop + logoBoxH + 12);

  // Website / email / phone rows — each led by the same lucide icon (Globe
  // / Mail / Phone) the site itself uses in the footer's contact list,
  // drawn as real vector shapes instead of the old plain bullet dot.
  let contactY = headerTop + logoBoxH + 28;
  const contactRows: { text: string; icon: string }[] = [
    { text: BRAND.website, icon: ICON_GLOBE },
    { text: BRAND.email, icon: ICON_MAIL },
    { text: BRAND.phone, icon: ICON_PHONE },
  ];
  const contactIconSize = 8;
  for (const row of contactRows) {
    await ctx.drawVectorIcon(row.icon, MARGIN, contactY - contactIconSize + 1.5, contactIconSize, COLORS.primaryDark);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    setText(COLORS.darkMuted);
    doc.text(row.text, MARGIN + contactIconSize + 5, contactY);
    contactY += 13;
  }

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
  doc.text('BOOKING ID', PAGE_W - MARGIN, headerTop + 42, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  const bookingIdText = val(enquiry.booking_id);
  const bidW = doc.getTextWidth(bookingIdText) + 20;
  setFill(COLORS.backgroundWarm);
  doc.roundedRect(PAGE_W - MARGIN - bidW, headerTop + 48, bidW, 20, 4, 4, 'F');
  setText(COLORS.primaryDark);
  doc.text(bookingIdText, PAGE_W - MARGIN - bidW / 2, headerTop + 62, { align: 'center' });

  setFill(COLORS.secondary);
  doc.circle(PAGE_W - MARGIN - bidW - 84, headerTop + 82, 2, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setText(COLORS.darkMuted);
  doc.text(`Invoice Date: ${invoiceDate}`, PAGE_W - MARGIN, headerTop + 86, { align: 'right' });

  cursor.y = headerTop + 110;
  setDraw(COLORS.grayLine);
  doc.setLineWidth(0.75);
  doc.line(MARGIN, cursor.y, PAGE_W - MARGIN, cursor.y);
  cursor.y += 26;
}
