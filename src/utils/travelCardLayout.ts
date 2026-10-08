// Pure layout helpers for the Travel Cards: card sizes, back-card text,
// cut-guide shapes and A3 sheet planning. No canvas or PDF code lives here, so
// the admin pages can import it up front without pulling in travelCard.ts
// (the heavy drawing code), which is loaded on demand.

import { MAX_PRINT_SHEETS } from '../constants/limits';
import { INSTAGRAM_HANDLE, CONTACT_PHONE_DISPLAY } from '../constants/site';

export const CARD_WIDTH = 1276;
export const CARD_HEIGHT = 2031;

export const CARD_RADIUS = 58;            // rounded outer corners (outside is transparent)

export type TravelCardRole = 'traveler' | 'leader';

/** The five editable lines on the back of the card. */
export interface BackCardText {
  topLine: string;     // small caps line above the headline
  headline: string;    // large script line
  scanLine: string;    // caption under the QR code
  instagram: string;   // handle shown next to the Instagram icon
  phone: string;       // number shown next to the WhatsApp icon
}

export const DEFAULT_BACK_CARD_TEXT: BackCardText = {
  topLine: 'Our Next',
  headline: 'Adventure Awaits.',
  scanLine: 'Scan to explore ULAA',
  instagram: INSTAGRAM_HANDLE,
  phone: CONTACT_PHONE_DISPLAY,
};

// Cut guides ----------------------------------------------------------------
// Drawn on the print sheets (and in the on-screen preview) so each card or
// badge can be cut out accurately. Shapes are in mm on the sheet.

/** 'outline' follows the shape of each card/badge; 'marks' are small corner
 *  (cards) or compass-point (badges) ticks in the gap; 'none' draws nothing. */
export type CutGuides = 'outline' | 'marks' | 'none';
export type GuideShape =
  | { t: 'rrect'; x: number; y: number; w: number; h: number; r: number }
  | { t: 'circle'; cx: number; cy: number; r: number }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number };

export const GUIDE_LINE_MM = 0.15;
const MARK_OFFSET_MM = 0.6;     // marks start this far outside the edge
const MARK_MAX_LENGTH_MM = 3;
/** Smallest gap in which corner/tick marks fit without touching a neighbour's. */
export const MIN_GAP_FOR_MARKS_MM = 2;

function markLength(gapMm: number) {
  const len = Math.min(MARK_MAX_LENGTH_MM, gapMm / 2 - MARK_OFFSET_MM);
  return len >= 0.5 ? len : 0;
}

export function cardCutGuides(slot: { x: number; y: number }, w: number, h: number, gapMm: number, guides: CutGuides): GuideShape[] {
  if (guides === 'outline') {
    const half = GUIDE_LINE_MM / 2; // sits just outside the artwork edge
    const r = (CARD_RADIUS / CARD_WIDTH) * w;
    return [{ t: 'rrect', x: slot.x - half, y: slot.y - half, w: w + GUIDE_LINE_MM, h: h + GUIDE_LINE_MM, r: r + half }];
  }
  if (guides === 'marks') {
    const len = markLength(gapMm);
    if (len === 0) return [];
    const o = MARK_OFFSET_MM;
    const shapes: GuideShape[] = [];
    for (const cx of [slot.x, slot.x + w]) {
      for (const cy of [slot.y, slot.y + h]) {
        const dx = cx === slot.x ? -1 : 1;
        const dy = cy === slot.y ? -1 : 1;
        shapes.push({ t: 'line', x1: cx + dx * o, y1: cy, x2: cx + dx * (o + len), y2: cy });
        shapes.push({ t: 'line', x1: cx, y1: cy + dy * o, x2: cx, y2: cy + dy * (o + len) });
      }
    }
    return shapes;
  }
  return [];
}

export function badgeCutGuides(slot: { x: number; y: number }, d: number, gapMm: number, guides: CutGuides): GuideShape[] {
  const cx = slot.x + d / 2;
  const cy = slot.y + d / 2;
  const r = d / 2;
  if (guides === 'outline') return [{ t: 'circle', cx, cy, r: r + GUIDE_LINE_MM / 2 }];
  if (guides === 'marks') {
    const len = markLength(gapMm);
    if (len === 0) return [];
    const a = r + MARK_OFFSET_MM;
    const b = a + len;
    return [
      { t: 'line', x1: cx, y1: cy - a, x2: cx, y2: cy - b },
      { t: 'line', x1: cx, y1: cy + a, x2: cx, y2: cy + b },
      { t: 'line', x1: cx - a, y1: cy, x2: cx - b, y2: cy },
      { t: 'line', x1: cx + a, y1: cy, x2: cx + b, y2: cy },
    ];
  }
  return [];
}

export function cutGuideOptions(shape: 'card' | 'badge') {
  return [
    { value: 'outline', label: `Outline around each ${shape}` },
    { value: 'marks', label: shape === 'card' ? 'Corner marks (needs a 2 mm gap)' : 'Tick marks (needs a 2 mm gap)' },
    { value: 'none', label: 'No cut guides' },
  ];
}

export function isCutGuides(v: unknown): v is CutGuides {
  return v === 'outline' || v === 'marks' || v === 'none';
}
export const MARKS_GAP_HINT = `Corner marks need a gap of at least ${MIN_GAP_FOR_MARKS_MM} mm. Increase the gap or use the outline.`;
export const GUIDE_NOTE = `Cut guides are thin ${GUIDE_LINE_MM} mm grey lines drawn just outside each edge.`;

export const A3_WIDTH_MM = 297;
export const A3_HEIGHT_MM = 420;
const SHEET_MARGIN_MM = 10;     // unprinted border most printers need
export const MAX_SHEETS = MAX_PRINT_SHEETS;

export interface BadgeSheetSettings {
  diameterMm: number;   // finished badge size, e.g. 58
  gapMm: number;       // space between badges for cutting
  guides?: CutGuides;  // cut guides drawn on the sheet (default none)
}
export interface BadgeSlot { x: number; y: number }   // top-left corner on the sheet, in mm

function squareSlots(d: number, gap: number): BadgeSlot[] {
  const pitch = d + gap;
  const availW = A3_WIDTH_MM - 2 * SHEET_MARGIN_MM;
  const availH = A3_HEIGHT_MM - 2 * SHEET_MARGIN_MM;
  const cols = Math.floor((availW + gap) / pitch);
  const rows = Math.floor((availH + gap) / pitch);
  if (cols < 1 || rows < 1) return [];
  const x0 = (A3_WIDTH_MM - (cols * d + (cols - 1) * gap)) / 2;
  const y0 = (A3_HEIGHT_MM - (rows * d + (rows - 1) * gap)) / 2;
  const slots: BadgeSlot[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) slots.push({ x: x0 + c * pitch, y: y0 + r * pitch });
  return slots;
}

// Alternate rows shifted by half a badge so the circles nest together and
// more fit on the sheet.
function staggeredSlots(d: number, gap: number): BadgeSlot[] {
  const pitch = d + gap;
  const rowPitch = (pitch * Math.sqrt(3)) / 2;
  const availW = A3_WIDTH_MM - 2 * SHEET_MARGIN_MM;
  const availH = A3_HEIGHT_MM - 2 * SHEET_MARGIN_MM;
  if (availW < d || availH < d) return [];
  const rows = Math.floor((availH - d) / rowPitch) + 1;
  const evenCols = Math.floor((availW + gap) / pitch);
  const oddCols = Math.floor((availW - pitch / 2 + gap) / pitch);
  if (evenCols < 1) return [];
  const raw: BadgeSlot[] = [];
  let maxX = 0;
  for (let r = 0; r < rows; r++) {
    const odd = r % 2 === 1;
    const cols = odd ? oddCols : evenCols;
    for (let c = 0; c < cols; c++) {
      const x = c * pitch + (odd ? pitch / 2 : 0);
      raw.push({ x, y: r * rowPitch });
      maxX = Math.max(maxX, x + d);
    }
  }
  const usedH = (rows - 1) * rowPitch + d;
  const x0 = (A3_WIDTH_MM - maxX) / 2;
  const y0 = (A3_HEIGHT_MM - usedH) / 2;
  return raw.map(s => ({ x: s.x + x0, y: s.y + y0 }));
}

/** Where each badge goes on one A3 sheet: whichever packing fits more. */
export function layoutBadgeSheet({ diameterMm, gapMm }: BadgeSheetSettings): BadgeSlot[] {
  if (!(diameterMm > 0) || gapMm < 0) return [];
  const square = squareSlots(diameterMm, gapMm);
  const staggered = staggeredSlots(diameterMm, gapMm);
  return staggered.length > square.length ? staggered : square;
}

/** Badges per sheet and sheets needed for a quantity (capped at MAX_SHEETS). */
export function planBadgeSheets(settings: BadgeSheetSettings, quantity: number) {
  const perSheet = layoutBadgeSheet(settings).length;
  const sheets = perSheet > 0 && quantity > 0 ? Math.ceil(quantity / perSheet) : 0;
  return { perSheet, sheets, tooManySheets: sheets > MAX_SHEETS };
}

export const CARD_ASPECT = CARD_HEIGHT / CARD_WIDTH;

/** One card to print: a front for a named person, or the (common) back. */
export type CardSheetItem =
  | { kind: 'front'; name: string; role: TravelCardRole }
  | { kind: 'back'; text: BackCardText };

export interface CardSheetSettings {
  widthMm: number;   // finished card width, e.g. 54 (height follows the design)
  gapMm: number;     // space between cards for cutting
  guides?: CutGuides; // cut guides drawn on the sheet (default none)
}

export interface CardSheetLayout {
  landscape: boolean;
  pageWidth: number;     // mm
  pageHeight: number;    // mm
  cardWidth: number;     // mm
  cardHeight: number;    // mm
  slots: BadgeSlot[];    // top-left corner of each card, mm
}

function gridSlots(pageW: number, pageH: number, w: number, h: number, gap: number): BadgeSlot[] {
  const cols = Math.floor((pageW - 2 * SHEET_MARGIN_MM + gap) / (w + gap));
  const rows = Math.floor((pageH - 2 * SHEET_MARGIN_MM + gap) / (h + gap));
  if (cols < 1 || rows < 1) return [];
  const x0 = (pageW - (cols * w + (cols - 1) * gap)) / 2;
  const y0 = (pageH - (rows * h + (rows - 1) * gap)) / 2;
  const slots: BadgeSlot[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) slots.push({ x: x0 + c * (w + gap), y: y0 + r * (h + gap) });
  return slots;
}

export function layoutCardSheet({ widthMm, gapMm }: CardSheetSettings): CardSheetLayout {
  const cardWidth = widthMm;
  const cardHeight = widthMm * CARD_ASPECT;
  const none: CardSheetLayout = { landscape: false, pageWidth: A3_WIDTH_MM, pageHeight: A3_HEIGHT_MM, cardWidth, cardHeight, slots: [] };
  if (!(widthMm > 0) || gapMm < 0) return none;
  const portrait = gridSlots(A3_WIDTH_MM, A3_HEIGHT_MM, cardWidth, cardHeight, gapMm);
  const landscape = gridSlots(A3_HEIGHT_MM, A3_WIDTH_MM, cardWidth, cardHeight, gapMm);
  return landscape.length > portrait.length
    ? { landscape: true, pageWidth: A3_HEIGHT_MM, pageHeight: A3_WIDTH_MM, cardWidth, cardHeight, slots: landscape }
    : { ...none, slots: portrait };
}

/** Cards per sheet and sheets needed for a number of cards (capped at MAX_SHEETS). */
export function planCardSheets(settings: CardSheetSettings, count: number) {
  const layout = layoutCardSheet(settings);
  const perSheet = layout.slots.length;
  const sheets = perSheet > 0 && count > 0 ? Math.ceil(count / perSheet) : 0;
  return { layout, perSheet, sheets, tooManySheets: sheets > MAX_SHEETS };
}

export function cardSheetItemKey(item: CardSheetItem): string {
  return item.kind === 'front' ? `f|${item.role}|${item.name}` : `b|${JSON.stringify(item.text)}`;
}
