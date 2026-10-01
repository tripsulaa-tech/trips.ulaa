import type { Enquiry } from '../../../types/types-index';
import type { InvoicePdfCtx } from './context';
import { COLORS, MARGIN, CONTENT_W, val } from './shared';
import { formatPhone } from '../../formatPhone';

// =============================================================================
// Billed-to / Trip block — two plain columns split by a thin vertical line:
//
//   BILLED TO                 │  TRIP
//   Irine Thomas              │  Varkala Girls Escape
//   +91 82811 35894           │  Package - Premium
//   irinethomas07@gmail.com   │  City - Bengaluru
//
// No boxes or pills — just a small label and the details beneath it.
// Advances `ctx.cursor.y` past whichever column is taller.
// =============================================================================

export function renderDetails(ctx: InvoicePdfCtx, enquiry: Enquiry): void {
  const { doc, setText, setDraw, cursor } = ctx;
  const tripPackage = (enquiry.package_name || '').trim();
  const packageName = tripPackage || (enquiry.package_type === 'early_bird' ? 'Early Bird' : 'Normal');

  const gutter = 36;
  const colW = (CONTENT_W - gutter) / 2;
  const col2X = MARGIN + colW + gutter;
  const top = cursor.y;

  function label(text: string, x: number) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    setText(COLORS.primaryDark);
    doc.text(text, x, top + 8);
  }

  // Draws wrapped lines and returns the y of the next free line.
  function line(text: string, x: number, y: number, opts: { bold?: boolean; size?: number; muted?: boolean }): number {
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(opts.size ?? 10);
    setText(opts.muted ? COLORS.darkMuted : COLORS.dark);
    const lines: string[] = doc.splitTextToSize(text, colW);
    doc.text(lines, x, y);
    return y + lines.length * 14;
  }

  // --- Billed to ---------------------------------------------------------
  label('BILLED TO', MARGIN);
  let leftY = top + 25;
  leftY = line(val(enquiry.full_name), MARGIN, leftY, { bold: true, size: 11.5 });
  leftY = line(formatPhone(enquiry.phone) || '\u2014', MARGIN, leftY, { muted: true });
  leftY = line(val(enquiry.email), MARGIN, leftY, { muted: true });

  // --- Trip --------------------------------------------------------------
  label('TRIP', col2X);
  let rightY = top + 25;
  const tripNameY = rightY;
  rightY = line(val(enquiry.trip_title), col2X, rightY, { bold: true, size: 11.5 });
  // Whole trip-name block links to that trip's details page.
  if (ctx.tripUrl) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    const nameLines: string[] = doc.splitTextToSize(val(enquiry.trip_title), colW);
    const nameW = Math.min(colW, Math.max(...nameLines.map((l) => doc.getTextWidth(l))));
    doc.link(col2X, tripNameY - 11, nameW, nameLines.length * 14, { url: ctx.tripUrl });
  }

  // Package and city, plain black text, one per line:
  //   Package - Premium
  //   City - Bengaluru
  // The package is the trip package (Premium / Basic); trips with no
  // packages fall back to the booking's own type (Normal / Early Bird).
  rightY = line(`Package - ${packageName}`, col2X, rightY, {});
  const city = val(enquiry.city);
  if (enquiry.city && city !== '\u2014') {
    rightY = line(`City - ${city}`, col2X, rightY, {});
  }

  // --- Divider -----------------------------------------------------------
  const bottom = Math.max(leftY, rightY);
  setDraw(COLORS.grayLine);
  doc.setLineWidth(0.75);
  const dividerX = MARGIN + colW + gutter / 2;
  doc.line(dividerX, top, dividerX, bottom - 8);

  cursor.y = bottom + 18;
}
