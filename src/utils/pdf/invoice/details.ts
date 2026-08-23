import type { Enquiry } from '../../../types/types-index';
import type { InvoicePdfCtx } from './context';
import { COLORS, MARGIN, CONTENT_W, val, fdate } from './shared';

// =============================================================================
// Two-column details: Traveller Details / Trip Details. Advances
// `ctx.cursor.y` past whichever column ends up taller.
// =============================================================================

export function renderDetails(ctx: InvoicePdfCtx, enquiry: Enquiry): void {
  const { doc, setFill, setText, cursor } = ctx;
  const packageLabel = enquiry.package_type === 'early_bird' ? 'Early Bird' : 'Normal';

  function drawPill(text: string, x: number, y: number) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    const w = doc.getTextWidth(text) + 20;
    setFill(COLORS.primaryDark);
    doc.roundedRect(x, y, w, 18, 3, 3, 'F');
    setText(COLORS.white);
    doc.text(text, x + w / 2, y + 12.5, { align: 'center' });
  }

  function drawField(label: string, value: string, x: number, y: number, w: number): number {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setText(COLORS.darkMuted);
    doc.text(label.toUpperCase(), x, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    setText(COLORS.dark);
    const lines = doc.splitTextToSize(value, w);
    doc.text(lines, x, y + 14);
    return y + 14 + lines.length * 13 + 10;
  }

  const colW = (CONTENT_W - 30) / 2;
  const col2X = MARGIN + colW + 30;

  drawPill('TRAVELLER DETAILS', MARGIN, cursor.y);
  drawPill('TRIP DETAILS', col2X, cursor.y);
  let leftY = cursor.y + 34;
  let rightY = cursor.y + 34;

  leftY = drawField('Traveller Name', val(enquiry.full_name), MARGIN, leftY, colW);
  leftY = drawField('Phone', val(enquiry.phone), MARGIN, leftY, colW);
  leftY = drawField('Email', val(enquiry.email), MARGIN, leftY, colW);
  if (enquiry.group_size && enquiry.group_size > 1) {
    leftY = drawField('Group Booking', `Seat ${enquiry.group_seq} of ${enquiry.group_size}`, MARGIN, leftY, colW);
  }

  rightY = drawField('Trip', val(enquiry.trip_title), col2X, rightY, colW);
  rightY = drawField('Departure Date', fdate(enquiry.departure_date), col2X, rightY, colW);
  rightY = drawField('Package', packageLabel, col2X, rightY, colW);
  rightY = drawField('City', val(enquiry.city), col2X, rightY, colW);

  cursor.y = Math.max(leftY, rightY) + 4;
}
