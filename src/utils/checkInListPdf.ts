import { jsPDF } from 'jspdf';
import type { Enquiry, UpcomingTrip } from '../types/types-index';
import { formatDate, slugify } from './utils-index';
import { formatPhone } from './formatPhone';
import { sanitizeForPdf } from './pdfText';
import { foodBadge, foodPreferenceKey } from '../admin/enquiries/AdminEnquiryCommon';
import { COLORS_BASE, BRAND_BASE } from './pdf/shared';
import { drawVectorIcon } from './pdf/invoice/shared';
import { isPremiumPackage } from './tripOptions';

// =============================================================================
// Traveller list PDF — opened from the trip's Check-in popup (the single
// download icon there). One clean table, one row per booked traveller:
//
//   #   Name   Age   Phone   Food   Package
//
// Food and Package use the same colours as the popup: Veg green with a leaf,
// Non-veg red with a drumstick, not-set grey with a dashed box; Premium in
// gold, any other package in brand brown, each on a soft tinted pill.
//
// Real vector text (jsPDF), A4 portrait, rows never split across pages, and
// the header row repeats on every page.
// =============================================================================

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;
const ROW_H = 26;
const HEAD_H = 26;

const dash = (s: string | null | undefined) => sanitizeForPdf(s) || '\u2014';

type RGB = readonly [number, number, number];

// Same Tabler/lucide-style 24x24 stroke icons the popup's FoodMark draws.
const ICON_LEAF = '<path d="M5 21c.5 -4.5 2.5 -8 7 -10"/><path d="M9 18c6.218 0 10.5 -3.288 11 -12v-2h-4.014c-9 0 -11.986 4 -12 9c0 1 0 3 2 5h3l.014 0"/>';
const ICON_MEAT = '<path d="M13.62 8.382l1.966 -1.967a2 2 0 1 1 3.414 -1.415a2 2 0 1 1 -1.413 3.414l-1.82 1.821"/><path d="M5.904 18.596c2.733 2.734 5.9 4 7.07 2.829c1.172 -1.172 -.094 -4.338 -2.828 -7.071c-2.733 -2.734 -5.9 -4 -7.07 -2.829c-1.172 1.172 .094 4.338 2.828 7.071"/><path d="M7.5 16l1 1"/><path d="M12.975 21.425c3.905 -3.906 4.855 -9.288 2.121 -12.021c-2.733 -2.734 -8.115 -1.784 -12.02 2.121"/>';
const ICON_NOT_SET = '<rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="3 2.5"/>';

// Tailwind green-700 / red-700, as in the popup's Food text.
const FOOD_STYLE: Record<'veg' | 'non_veg' | 'not_set', { color: RGB; icon: string }> = {
  veg: { color: [21, 128, 61], icon: ICON_LEAF },
  non_veg: { color: [185, 28, 28], icon: ICON_MEAT },
  not_set: { color: COLORS_BASE.darkMuted, icon: ICON_NOT_SET },
};

// Package pill colours: text + the same colour at 10% over white.
const PKG_PREMIUM = { text: [168, 122, 14] as RGB, bg: [250, 245, 234] as RGB };
const PKG_OTHER = { text: COLORS_BASE.primary as RGB, bg: [246, 239, 234] as RGB };

export async function downloadCheckInListPdf(trip: UpcomingTrip, travellers: Enquiry[]): Promise<void> {
  const doc = new jsPDF({ unit: 'pt', format: [PAGE_W, PAGE_H], orientation: 'portrait' });
  const C = COLORS_BASE;
  const fill = (c: readonly [number, number, number]) => doc.setFillColor(c[0], c[1], c[2]);
  const text = (c: readonly [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);
  const draw = (c: readonly [number, number, number]) => doc.setDrawColor(c[0], c[1], c[2]);

  // Column x-positions (left edges) — sized for the longest realistic values.
  const colNo = MARGIN + 10;
  const colName = MARGIN + 40;
  const colAge = MARGIN + 190;
  const colPhone = MARGIN + 235;
  const colFood = MARGIN + 345;
  const colPkg = MARGIN + 435;

  let y = 0;

  function pageTop(first: boolean) {
    fill(C.primary);
    doc.rect(0, 0, PAGE_W, 4, 'F');
    y = MARGIN;
    if (first) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(17);
      text(C.dark);
      doc.text(dash(trip.title), MARGIN, y + 6);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      text(C.darkMuted);
      const when = formatDate(trip.start_date, { day: 'numeric', month: 'short', year: 'numeric' });
      doc.text(`Traveller list  \u2022  ${when}  \u2022  ${dash(trip.destination)}  \u2022  ${travellers.length} travellers`, MARGIN, y + 24);
      draw(C.secondary);
      doc.setLineWidth(1);
      doc.line(MARGIN, y + 34, PAGE_W - MARGIN, y + 34);
      y += 52;
    } else {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      text(C.dark);
      doc.text(`${dash(trip.title)} \u2014 Traveller list (continued)`, MARGIN, y + 6);
      y += 24;
    }
  }

  function tableHeader() {
    fill(C.primaryDark);
    doc.rect(MARGIN, y, CONTENT_W, HEAD_H, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    text([255, 255, 255]);
    const ty = y + 17;
    doc.text('#', colNo, ty);
    doc.text('NAME', colName, ty);
    doc.text('AGE', colAge, ty);
    doc.text('PHONE', colPhone, ty);
    doc.text('FOOD', colFood, ty);
    doc.text('PACKAGE', colPkg, ty);
    y += HEAD_H;
  }

  pageTop(true);
  tableHeader();

  for (let i = 0; i < travellers.length; i++) {
    const e = travellers[i];
    if (y + ROW_H > PAGE_H - MARGIN) {
      doc.addPage([PAGE_W, PAGE_H], 'portrait');
      pageTop(false);
      tableHeader();
    }
    if (i % 2 === 0) {
      fill(C.cream);
      doc.rect(MARGIN, y, CONTENT_W, ROW_H, 'F');
    }
    const ty = y + 17;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    text(C.darkMuted);
    doc.text(String(i + 1), colNo, ty);

    text(C.dark);
    doc.setFont('helvetica', 'bold');
    const nameLines: string[] = doc.splitTextToSize(dash(e.full_name), colAge - colName - 12);
    doc.text(nameLines[0], colName, ty);

    doc.setFont('helvetica', 'normal');
    doc.text(e.age ? String(e.age) : '\u2014', colAge, ty);
    doc.text(e.phone ? formatPhone(e.phone) || '\u2014' : '\u2014', colPhone, ty);
    // Food: coloured leaf / drumstick / dashed box + coloured label.
    const foodKey = foodPreferenceKey(e);
    const food = FOOD_STYLE[foodKey];
    await drawVectorIcon(doc, food.icon, colFood, ty - 9, 11, food.color);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    text(food.color);
    doc.text(sanitizeForPdf(foodBadge(e).label) || '\u2014', colFood + 15, ty);

    // Package: tinted pill, gold for Premium, brand brown otherwise.
    const pkgName = sanitizeForPdf(e.package_name);
    if (pkgName) {
      const pk = isPremiumPackage(e.package_name) ? PKG_PREMIUM : PKG_OTHER;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      const label: string = doc.splitTextToSize(pkgName, PAGE_W - MARGIN - colPkg - 14)[0];
      const w = doc.getTextWidth(label) + 12;
      fill(pk.bg);
      doc.roundedRect(colPkg, y + ROW_H / 2 - 8, w, 16, 4, 4, 'F');
      text(pk.text);
      doc.text(label, colPkg + 6, ty - 0.5);
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      text(C.darkMuted);
      doc.text('\u2014', colPkg, ty);
    }

    draw(C.grayLineSoft);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, y + ROW_H, PAGE_W - MARGIN, y + ROW_H);
    y += ROW_H;
  }

  // Page numbers + brand line on every page.
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    text(C.darkMuted);
    doc.text(`${BRAND_BASE.name} \u2022 ${BRAND_BASE.website}`, MARGIN, PAGE_H - 20);
    doc.text(`Page ${p} of ${pages}`, PAGE_W - MARGIN, PAGE_H - 20, { align: 'right' });
  }

  doc.save(`Ulaa-Travellers-${slugify(trip.title) || 'trip'}.pdf`);
}
