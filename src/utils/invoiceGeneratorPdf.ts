import { jsPDF } from 'jspdf';
import { sanitizeForPdf } from './pdfText';
import { formatDate } from './utils-index';
import { PAGE_W, PAGE_H, MARGIN, drawVectorIcon, type RGB } from './pdf/invoice/shared';

// =============================================================================
// Admin "Invoice Generator" — a standalone tool (Admin > Invoice Generator)
// that lets an admin type in a one-off invoice (billing address, a short
// line-item table, bank details, a signatory) and get back a PDF laid out
// to match the "MEND PROMOTION" reference design exactly: serif "INVOICE"
// wordmark + lime underline, a billing-address block with a pin icon, an
// Invoice No./Date card, a dark-green table header with a highlighted
// total row, a Bank Details card, and a signature line.
//
// This is unrelated to the booking invoice in pdf/invoice/ (that one is
// generated from an Enquiry/Payment record for a trip booking) — this tool
// just turns whatever the admin typed into the form into a PDF; saving/
// reusing past invoices (invoice_generator_invoices table) is handled by
// AdminInvoiceGenerator.tsx and services/api/invoiceGenerator.ts, not
// here. It reuses the same low-level building blocks
// (PAGE_W/PAGE_H/MARGIN, drawVectorIcon via svg2pdf.js) so both PDFs share
// the same rendering approach: real vector text/shapes, not a rasterized
// screenshot.
//
// Flow:
//   buildInvoiceGeneratorPdfDoc() → assembles and returns the jsPDF doc
//   downloadInvoiceGeneratorPdf() → builds it and triggers a direct download
//   invoiceGeneratorPdfBlobUrl()  → builds it and returns an object URL,
//                                   used to drive the live <iframe> preview
//                                   and the "Open / Print" action
// =============================================================================

export interface InvoiceGeneratorLineItem {
  id: string;
  description: string;
  subDescription: string;
  amount: number;
}

export interface InvoiceGeneratorBankDetails {
  accountNumber: string;
  ifscCode: string;
  bankName: string;
  accountHolderName: string;
  gpayNumber: string;
}

export interface InvoiceGeneratorData {
  /** Bold caps heading top-right, e.g. "MEND PROMOTION". */
  invoiceTitle: string;
  /** Small caps line beneath the title, e.g. "ORGANIC VIDEO". */
  invoiceSubtitle: string;
  billingCompanyName: string;
  /** Free-form, newline-separated. */
  billingAddress: string;
  /** Short prefix for auto-generated invoice numbers, e.g. "JJ" → JJ01, JJ02… */
  invoiceNumberPrefix: string;
  invoiceNumber: string;
  /** 'YYYY-MM-DD' */
  invoiceDateISO: string;
  items: InvoiceGeneratorLineItem[];
  bank: InvoiceGeneratorBankDetails;
  signatoryName: string;
}

let itemIdCounter = 0;
/** Doesn't rely on crypto.randomUUID (not guaranteed in every embedded
 *  webview this admin panel might run in) — a monotonically increasing
 *  counter is all a client-only "key for this list row" needs. */
export function createEmptyLineItem(): InvoiceGeneratorLineItem {
  itemIdCounter += 1;
  return { id: `item-${Date.now()}-${itemIdCounter}`, description: '', subDescription: '', amount: 0 };
}

// -----------------------------------------------------------------------
// Invoice number auto-numbering. The number itself is never typed by the
// admin and never generated on the client — it's reserved atomically by
// the database (next_invoice_generator_number(), see
// supabase/migration/add_invoice_generator_records.sql and
// services/api/invoiceGenerator.ts's getNextInvoiceGeneratorNumber) so two
// admins generating invoices at the same time can't hand out the same
// number, and it's not lost the moment localStorage is cleared. The
// sequence itself is prefix-agnostic: changing the prefix just relabels
// the same running count rather than starting a second, parallel one.
// AdminInvoiceGenerator.tsx calls getNextInvoiceGeneratorNumber directly
// (once on mount, and again for "Next Number") and only ever displays
// invoiceNumber here — this module has no numbering logic of its own.
// -----------------------------------------------------------------------
export const DEFAULT_INVOICE_NUMBER_PREFIX = 'JJ';

/** Starting shape for a new invoice. invoiceNumber is left blank — the
 *  caller (AdminInvoiceGenerator) fills it in right after, from the
 *  server-reserved number, once it's back. */
export function defaultInvoiceGeneratorData(): InvoiceGeneratorData {
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return {
    invoiceTitle: 'MEND PROMOTION',
    invoiceSubtitle: 'ORGANIC VIDEO',
    billingCompanyName: '',
    billingAddress: '',
    invoiceNumberPrefix: DEFAULT_INVOICE_NUMBER_PREFIX,
    invoiceNumber: '',
    invoiceDateISO: iso,
    items: [createEmptyLineItem()],
    bank: { accountNumber: '', ifscCode: '', bankName: '', accountHolderName: '', gpayNumber: '' },
    signatoryName: '',
  };
}

export function invoiceGeneratorTotal(items: InvoiceGeneratorLineItem[]): number {
  return items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
}

// -----------------------------------------------------------------------
// Palette / icons — matched against the reference screenshot (sampled
// pixel colors), not the site's own orange brand palette. This document
// is its own self-contained design, not an Ulaa-branded page.
// -----------------------------------------------------------------------
const COLORS = {
  darkGreen: [42, 58, 43] as RGB,
  lime: [167, 189, 58] as RGB,
  cream: [247, 247, 243] as RGB,
  totalBg: [225, 234, 211] as RGB,
  gray: [128, 128, 122] as RGB,
  darkText: [26, 30, 24] as RGB,
  white: [255, 255, 255] as RGB,
  divider: [223, 221, 211] as RGB,
  red: [190, 70, 65] as RGB,
} as const;

// Lucide-style stroke icons (24x24 viewBox), same convention as
// pdf/invoice/shared.ts's ICON_GLOBE/ICON_MAIL/ICON_PHONE — rendered as
// real vector shapes via drawVectorIcon(), not raster art.
const ICON_MAP_PIN = '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>';
const ICON_FILE_TEXT = '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>';
const ICON_CALENDAR = '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>';
const ICON_LANDMARK = '<path d="M10 18v-7"/><path d="M11.12 2.198a2 2 0 0 1 1.76.006l7.866 3.847c.476.233.31.949-.22.949H3.474c-.53 0-.695-.716-.22-.949z"/><path d="M14 18v-7"/><path d="M18 18v-7"/><path d="M3 22h18"/><path d="M6 18v-7"/>';

const CONTENT_W = PAGE_W - MARGIN * 2;

function fmtAmount(n: number): string {
  const v = Number(n) || 0;
  const sign = v < 0 ? '\u2212 ' : '';
  return `${sign}${Math.abs(Math.round(v)).toLocaleString('en-IN')}/-`;
}

function fmtDate(iso: string): string {
  if (!iso) return '\u2014';
  return sanitizeForPdf(formatDate(iso, { day: 'numeric', month: 'long', year: 'numeric' }));
}

/** Starts a new page (top margin only — this document has no repeating
 *  page chrome, since a one-off invoice like this essentially never spills
 *  past a single page; a long item list is the only realistic case). */
function ensureSpace(doc: jsPDF, cursor: { y: number }, needed: number) {
  if (cursor.y + needed > PAGE_H - MARGIN) {
    doc.addPage([PAGE_W, PAGE_H], 'portrait');
    cursor.y = MARGIN;
  }
}

async function drawHeader(doc: jsPDF, data: InvoiceGeneratorData, cursor: { y: number }) {
  doc.setFont('times', 'bold');
  doc.setFontSize(38);
  doc.setTextColor(...COLORS.darkGreen);
  doc.text('INVOICE', MARGIN, cursor.y + 32);

  doc.setFillColor(...COLORS.lime);
  doc.rect(MARGIN, cursor.y + 40, 44, 3.5, 'F');

  const title = sanitizeForPdf(data.invoiceTitle).toUpperCase();
  const subtitle = sanitizeForPdf(data.invoiceSubtitle).toUpperCase();

  if (title) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...COLORS.darkGreen);
    doc.setCharSpace(1.3);
    doc.text(title, MARGIN + CONTENT_W, cursor.y + 8, { align: 'right' });
    doc.setCharSpace(0);
  }
  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.gray);
    doc.setCharSpace(2);
    doc.text(subtitle, MARGIN + CONTENT_W, cursor.y + 22, { align: 'right' });
    doc.setCharSpace(0);
  }

  cursor.y += 64;
}

async function drawBillingAndMeta(doc: jsPDF, data: InvoiceGeneratorData, cursor: { y: number }) {
  const leftW = CONTENT_W * 0.56;
  const gap = 18;
  const rightX = MARGIN + leftW + gap;
  const rightW = CONTENT_W - leftW - gap;
  const topY = cursor.y;
  const circleR = 11;

  // ---- Left: billing address ----
  doc.setFillColor(234, 238, 220);
  doc.circle(MARGIN + circleR, topY + circleR, circleR, 'F');
  await drawVectorIcon(doc, ICON_MAP_PIN, MARGIN + circleR - 6, topY + circleR - 6, 12, COLORS.darkGreen);

  const textX = MARGIN + circleR * 2 + 10;
  const textW = leftW - circleR * 2 - 10;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.gray);
  doc.setCharSpace(0.4);
  doc.text('BILLING ADDRESS', textX, topY + 8);
  doc.setCharSpace(0);

  let ly = topY + 25;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.setTextColor(...COLORS.darkText);
  const companyName = sanitizeForPdf(data.billingCompanyName) || 'Client Name';
  const companyLines: string[] = doc.splitTextToSize(companyName, textW);
  companyLines.forEach(line => { doc.text(line, textX, ly); ly += 15; });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...COLORS.gray);
  const addrRaw = sanitizeForPdf(data.billingAddress);
  const paragraphs = addrRaw ? addrRaw.split('\n').map(l => l.trim()).filter(Boolean) : [];
  paragraphs.forEach(p => {
    const wrapped: string[] = doc.splitTextToSize(p, textW);
    wrapped.forEach(line => { doc.text(line, textX, ly); ly += 13; });
  });
  const leftBottom = ly;

  // ---- Right: Invoice No. / Invoice Date card ----
  const rowH = 42;
  const cardH = rowH * 2;
  doc.setFillColor(...COLORS.cream);
  doc.roundedRect(rightX, topY, rightW, cardH, 6, 6, 'F');
  doc.setDrawColor(...COLORS.divider);
  doc.setLineWidth(0.6);
  doc.line(rightX + 14, topY + rowH, rightX + rightW - 14, topY + rowH);

  const iconCol = rightX + 14;
  const labelCol = iconCol + circleR * 2 + 8;

  async function metaRow(icon: string, label: string, value: string, rowIndex: number) {
    const rowTop = topY + rowIndex * rowH;
    const cy = rowTop + rowH / 2;
    doc.setFillColor(...COLORS.white);
    doc.circle(iconCol + circleR, cy, circleR, 'F');
    await drawVectorIcon(doc, icon, iconCol + circleR - 6, cy - 6, 12, COLORS.darkGreen);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.gray);
    doc.text(label, labelCol, cy - 5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...COLORS.darkText);
    doc.text(value, labelCol, cy + 11);
  }

  await metaRow(ICON_FILE_TEXT, 'Invoice No.', sanitizeForPdf(data.invoiceNumber) || '\u2014', 0);
  await metaRow(ICON_CALENDAR, 'Invoice Date', fmtDate(data.invoiceDateISO), 1);

  cursor.y = Math.max(leftBottom, topY + cardH) + 26;
}

/** Column layout for the line-item table, shared by the header row, every
 *  data row, and the total row so nothing can drift between them. */
const COL_NUM_X = MARGIN + 12;
const COL_NUM_W = 40;
const COL_DESC_X = MARGIN + COL_NUM_W + 12;
const DIVIDER_1_X = MARGIN + COL_NUM_W;
const AMOUNT_COL_W = 130;
const DIVIDER_2_X = MARGIN + CONTENT_W - AMOUNT_COL_W;
const COL_AMOUNT_RIGHT = MARGIN + CONTENT_W - 14;
const COL_DESC_W = DIVIDER_2_X - COL_DESC_X - 10;

function drawTableHeader(doc: jsPDF, cursor: { y: number }): number {
  const h = 28;
  doc.setFillColor(...COLORS.darkGreen);
  doc.rect(MARGIN, cursor.y, CONTENT_W, h, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...COLORS.white);
  doc.text('#', COL_NUM_X, cursor.y + h / 2 + 3.5);
  doc.text('Description', COL_DESC_X, cursor.y + h / 2 + 3.5);
  doc.text('Amount (INR)', COL_AMOUNT_RIGHT, cursor.y + h / 2 + 3.5, { align: 'right' });
  return h;
}

function drawColumnDividers(doc: jsPDF, top: number, bottom: number) {
  doc.setDrawColor(...COLORS.divider);
  doc.setLineWidth(0.6);
  doc.line(DIVIDER_1_X, top, DIVIDER_1_X, bottom);
  doc.line(DIVIDER_2_X, top, DIVIDER_2_X, bottom);
}

function drawTable(doc: jsPDF, data: InvoiceGeneratorData, cursor: { y: number }) {
  ensureSpace(doc, cursor, 28 + 46);
  let tableTop = cursor.y;
  let rowHeaderH = drawTableHeader(doc, cursor);
  cursor.y += rowHeaderH;

  const items = data.items.filter(it => it.description.trim() || it.subDescription.trim() || it.amount);
  const rows = items.length > 0 ? items : [{ id: 'placeholder', description: 'Item description', subDescription: '', amount: 0 } as InvoiceGeneratorLineItem];

  doc.setFont('helvetica', 'normal');
  rows.forEach((item, i) => {
    const desc = sanitizeForPdf(item.description) || 'Item description';
    const sub = sanitizeForPdf(item.subDescription);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    const descLines: string[] = doc.splitTextToSize(desc, COL_DESC_W);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    const subLines: string[] = sub ? doc.splitTextToSize(sub, COL_DESC_W) : [];
    const textH = descLines.length * 13 + subLines.length * 12;
    const rowH = Math.max(46, textH + 20);

    // A new page mid-table redraws the header at the top of that page, so
    // a reader who only sees page 2 still knows what each column means.
    if (cursor.y + rowH > PAGE_H - MARGIN) {
      drawColumnDividers(doc, tableTop, cursor.y);
      doc.addPage([PAGE_W, PAGE_H], 'portrait');
      cursor.y = MARGIN;
      tableTop = cursor.y;
      rowHeaderH = drawTableHeader(doc, cursor);
      cursor.y += rowHeaderH;
      doc.setFont('helvetica', 'normal');
    }

    doc.setFillColor(...COLORS.cream);
    doc.rect(MARGIN, cursor.y, CONTENT_W, rowH, 'F');
    if (i > 0) {
      doc.setDrawColor(...COLORS.divider);
      doc.setLineWidth(0.5);
      doc.line(MARGIN, cursor.y, MARGIN + CONTENT_W, cursor.y);
    }

    const textTop = cursor.y + rowH / 2 - textH / 2 + 9;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.darkText);
    doc.text(String(i + 1), COL_NUM_X, cursor.y + rowH / 2 + 3.5);

    let ly = textTop;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...COLORS.darkText);
    descLines.forEach(line => { doc.text(line, COL_DESC_X, ly); ly += 13; });
    if (subLines.length) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(...COLORS.gray);
      subLines.forEach(line => { doc.text(line, COL_DESC_X, ly); ly += 12; });
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...(item.amount < 0 ? COLORS.red : COLORS.darkText));
    doc.text(fmtAmount(item.amount), COL_AMOUNT_RIGHT, cursor.y + rowH / 2 + 3.5, { align: 'right' });

    cursor.y += rowH;
  });

  const total = invoiceGeneratorTotal(data.items);
  const totalRowH = 36;
  const beforeTotalY = cursor.y;
  ensureSpace(doc, cursor, totalRowH);
  // ensureSpace may have started a fresh page without the table header —
  // that's fine for the total row, which reads on its own. If it did,
  // the column dividers below should only span the total row itself, not
  // reach back up to a table body that's now on the previous page.
  if (cursor.y !== beforeTotalY) tableTop = cursor.y;
  doc.setFillColor(...COLORS.white);
  doc.rect(MARGIN, cursor.y, DIVIDER_2_X - MARGIN, totalRowH, 'F');
  doc.setFillColor(...COLORS.totalBg);
  doc.rect(DIVIDER_2_X, cursor.y, MARGIN + CONTENT_W - DIVIDER_2_X, totalRowH, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.darkText);
  doc.text('TOTAL', DIVIDER_2_X - 14, cursor.y + totalRowH / 2 + 4, { align: 'right' });
  doc.setFontSize(13);
  doc.text(fmtAmount(total), COL_AMOUNT_RIGHT, cursor.y + totalRowH / 2 + 4, { align: 'right' });

  drawColumnDividers(doc, tableTop, cursor.y + totalRowH);
  doc.setDrawColor(...COLORS.divider);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, cursor.y, MARGIN + CONTENT_W, cursor.y);

  cursor.y += totalRowH + 30;
}

const BANK_FIELD_LABELS: { key: keyof InvoiceGeneratorBankDetails; label: string }[] = [
  { key: 'accountNumber', label: 'Account Number' },
  { key: 'ifscCode', label: 'IFSC Code' },
  { key: 'bankName', label: 'Bank Name' },
  { key: 'accountHolderName', label: 'Name' },
  { key: 'gpayNumber', label: 'GPAY No.' },
];

async function drawBankDetails(doc: jsPDF, data: InvoiceGeneratorData, cursor: { y: number }) {
  const rows = BANK_FIELD_LABELS.filter(f => sanitizeForPdf(data.bank[f.key]));
  if (rows.length === 0) return;

  const padTop = 44;
  const rowH = 18;
  const cardH = padTop + rows.length * rowH + 16;
  ensureSpace(doc, cursor, cardH + 10);

  const top = cursor.y;
  doc.setFillColor(...COLORS.cream);
  doc.roundedRect(MARGIN, top, CONTENT_W, cardH, 8, 8, 'F');

  const circleR = 13;
  doc.setFillColor(...COLORS.white);
  doc.circle(MARGIN + 22, top + 26, circleR, 'F');
  await drawVectorIcon(doc, ICON_LANDMARK, MARGIN + 22 - 7, top + 26 - 7, 14, COLORS.darkGreen);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.setTextColor(...COLORS.darkText);
  doc.text('Bank Details', MARGIN + 44, top + 30);

  const labelX = MARGIN + 44;
  const valueX = MARGIN + 190;
  let ly = top + padTop;
  rows.forEach(({ key, label }) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...COLORS.gray);
    doc.text(label, labelX, ly);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...COLORS.darkText);
    doc.text(sanitizeForPdf(data.bank[key]), valueX, ly);
    ly += rowH;
  });

  cursor.y = top + cardH + 40;
}

function drawThankYouAndSignature(doc: jsPDF, data: InvoiceGeneratorData, cursor: { y: number }) {
  ensureSpace(doc, cursor, 70);
  const top = cursor.y;

  // "Thank You!" — jsPDF's core fonts don't include a script/cursive
  // face, so a bold italic serif is the closest built-in approximation of
  // the handwritten flourish in the reference design.
  doc.setFont('times', 'bolditalic');
  doc.setFontSize(26);
  doc.setTextColor(...COLORS.darkGreen);
  doc.text('Thank You!', MARGIN, top + 22);

  doc.setFillColor(...COLORS.lime);
  doc.rect(MARGIN, top + 32, 30, 3, 'F');

  // Signature line, right-aligned.
  const sigLineW = 160;
  const sigRight = MARGIN + CONTENT_W;
  doc.setDrawColor(...COLORS.darkText);
  doc.setLineWidth(0.7);
  doc.line(sigRight - sigLineW, top + 42, sigRight, top + 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...COLORS.darkText);
  const signatory = sanitizeForPdf(data.signatoryName) || sanitizeForPdf(data.bank.accountHolderName);
  if (signatory) doc.text(signatory, sigRight, top + 58, { align: 'right' });

  cursor.y = top + 70;
}

async function buildInvoiceGeneratorPdfDoc(data: InvoiceGeneratorData): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'pt', format: [PAGE_W, PAGE_H], orientation: 'portrait' });
  const cursor = { y: MARGIN };

  await drawHeader(doc, data, cursor);
  await drawBillingAndMeta(doc, data, cursor);
  drawTable(doc, data, cursor);
  await drawBankDetails(doc, data, cursor);
  drawThankYouAndSignature(doc, data, cursor);

  return doc;
}

/** Filename used for both the download and the "open in new tab" preview. */
export function invoiceGeneratorFileName(data: InvoiceGeneratorData): string {
  const base = sanitizeForPdf(data.invoiceTitle) || 'Invoice';
  const num = sanitizeForPdf(data.invoiceNumber);
  const slug = base.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'Invoice';
  return `${slug}${num ? `-${num.replace(/[^a-zA-Z0-9]+/g, '')}` : ''}.pdf`;
}

/** Builds the invoice and triggers a direct browser download. */
export async function downloadInvoiceGeneratorPdf(data: InvoiceGeneratorData): Promise<void> {
  const doc = await buildInvoiceGeneratorPdfDoc(data);
  doc.save(invoiceGeneratorFileName(data));
}

/** Builds the invoice and returns a blob: object URL — used to drive the
 *  live preview `<iframe>` (so the preview the admin sees is the actual
 *  PDF, not a hand-built approximation of it) and the "Open / Print"
 *  action. Callers own the returned URL and should revoke it
 *  (URL.revokeObjectURL) once it's no longer needed/replaced. */
export async function invoiceGeneratorPdfBlobUrl(data: InvoiceGeneratorData): Promise<string> {
  const doc = await buildInvoiceGeneratorPdfDoc(data);
  const blob = doc.output('blob');
  return URL.createObjectURL(blob);
}

/** Opens the generated PDF in a new tab so the admin can print it (or save
 *  it as a PDF again) using the browser's own PDF viewer controls — jsPDF
 *  has no direct "send to printer" call, and every browser already has a
 *  Print button built into its PDF viewer. */
export async function printInvoiceGeneratorPdf(data: InvoiceGeneratorData): Promise<void> {
  const doc = await buildInvoiceGeneratorPdfDoc(data);
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank', 'noopener');
  if (!win) {
    // Popup blocked — fall back to a direct download so the admin still
    // gets the PDF one way or another.
    doc.save(invoiceGeneratorFileName(data));
  }
  // Deliberately not revoked immediately — the new tab needs the blob to
  // still exist while it loads/renders the PDF. The browser cleans up the
  // object URL when that tab/page is closed.
}
