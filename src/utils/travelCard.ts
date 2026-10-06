// Draws the ULAA "Travel Card" (name tag, front and back) on a canvas and
// downloads it as a PNG. The front is layered exactly like the design file:
//   1. background.jpg   - sunset scene with the lanyard hole
//   2. overlay.png      - ULAA logo + divider (transparent PNG)
//   3. the traveler's name (script font) and the "TRAVELER" label, drawn here
// The back card (back-background.png + back-overlay.png) keeps its logo, QR
// code and icons as artwork and only the five text lines are drawn here, so
// they can be edited. All coordinates are in the design's own 1276 x 2031
// pixel space, measured from the final cards, so the output matches 1:1.

import { drawCover, getTravelCardArt, inkOver, loadArtImage } from './travelCardArt';

export const CARD_WIDTH = 1276;
export const CARD_HEIGHT = 2031;

const ASSET_BASE = '/travel-card';
const CARD_RADIUS = 58;            // rounded outer corners (outside is transparent)
const INK = '#2E241E';             // name + label colour sampled from the design

const NAME_CENTER_X = CARD_WIDTH / 2;
const NAME_BASELINE_Y = 898;       // baseline of the script name
const NAME_MAX_SIZE = 138.4;       // px, from the design
const NAME_MIN_SIZE = 95;          // below this, long names wrap onto two lines instead
const NAME_MAX_WIDTH = 1010;       // keep clear of the card edges

export type TravelCardRole = 'traveler' | 'leader';
const ROLE_LABEL: Record<TravelCardRole, string> = { traveler: 'TRAVELER', leader: 'TRIP LEADER' };
const LABEL_BASELINE_Y = 1082;
const LABEL_SIZE = 65;             // Montserrat Medium, from the design
const LABEL_TRACKING = 13;         // 200 tracking = 0.2em

const SCRIPT_FAMILY = 'TravelCardScript';
const LABEL_FAMILY = 'TravelCardLabel';

// The name font is not in the repo bundle: drop the file in
// public/travel-card/fonts/ (see README.txt there). Any of these names work.
const SCRIPT_FILES = ['RasleyHeights.ttf', 'RasleyHeights.otf', 'RasleyHeights.woff2'];
const SCRIPT_FALLBACK = 'Parisienne'; // already bundled with the site

let assetsPromise: Promise<{ bg: HTMLImageElement; overlay: HTMLImageElement; scriptFont: string }> | null = null;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

async function loadScriptFont(): Promise<string> {
  for (const file of SCRIPT_FILES) {
    try {
      const face = new FontFace(SCRIPT_FAMILY, `url(${ASSET_BASE}/fonts/${file})`);
      await face.load();
      document.fonts.add(face);
      return SCRIPT_FAMILY;
    } catch {
      // try the next file name
    }
  }
  try { await document.fonts.load(`${NAME_MAX_SIZE}px ${SCRIPT_FALLBACK}`, 'Aa'); } catch { /* use cursive */ }
  return `${SCRIPT_FALLBACK}, cursive`;
}

function loadAssets() {
  if (!assetsPromise) {
    assetsPromise = (async () => {
      const label = new FontFace(LABEL_FAMILY, `url(${ASSET_BASE}/fonts/montserrat-500.woff2)`, { weight: '500' });
      const [bg, overlay, scriptFont] = await Promise.all([
        loadImage(`${ASSET_BASE}/background.jpg`),
        loadImage(`${ASSET_BASE}/overlay.png`),
        loadScriptFont(),
        label.load().then(f => { document.fonts.add(f); }),
      ]);
      return { bg, overlay, scriptFont };
    })().catch(err => { assetsPromise = null; throw err; });
  }
  return assetsPromise;
}

/** True when the real name font file is present (otherwise the stand-in is used). */
export async function usingCustomNameFont(): Promise<boolean> {
  const { scriptFont } = await loadAssets();
  return scriptFont === SCRIPT_FAMILY;
}

function roundedRectPath(ctx: CanvasRenderingContext2D, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(w, 0, w, h, r);
  ctx.arcTo(w, h, 0, h, r);
  ctx.arcTo(0, h, 0, 0, r);
  ctx.arcTo(0, 0, w, 0, r);
  ctx.closePath();
}

// Canvas letterSpacing is not in every browser yet, so tracking is applied by
// hand: draw one character at a time and add the gap after each.
function drawTracked(ctx: CanvasRenderingContext2D, text: string, centerX: number, baselineY: number, tracking: number) {
  const chars = [...text];
  const widths = chars.map(c => ctx.measureText(c).width);
  // The last character's trailing gap is not part of the visible text.
  const total = widths.reduce((s, w) => s + w, 0) + tracking * (chars.length - 1);
  let x = centerX - total / 2;
  ctx.textAlign = 'left';
  chars.forEach((c, i) => {
    ctx.fillText(c, x, baselineY);
    x += widths[i] + tracking;
  });
}

function fitName(ctx: CanvasRenderingContext2D, font: string, name: string) {
  const measure = (size: number, lines: string[]) => {
    ctx.font = `${size}px ${font}`;
    return Math.max(...lines.map(l => ctx.measureText(l).width));
  };
  // Largest size (up to the design size) at which these lines fit the width.
  const fitSize = (lines: string[], cap: number, floor: number) => {
    const w = measure(cap, lines);
    const size = w > NAME_MAX_WIDTH ? cap * (NAME_MAX_WIDTH / w) : cap;
    return Math.max(floor, size);
  };

  // 1. One line, shrunk if needed, as long as it stays comfortably readable.
  const oneLine = [name];
  const singleSize = fitSize(oneLine, NAME_MAX_SIZE, 1);
  if (singleSize >= NAME_MIN_SIZE || !name.includes(' ')) {
    const size = Math.max(40, singleSize);
    ctx.font = `${size}px ${font}`;
    return { lines: oneLine, size, lineHeight: size };
  }

  // 2. Too long for one line: split at the space that balances the two
  //    lines best and size both to fit.
  const words = name.split(' ');
  let best: string[] = oneLine;
  let bestWidth = Infinity;
  for (let i = 1; i < words.length; i++) {
    const candidate = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
    const w = measure(NAME_MAX_SIZE, candidate);
    if (w < bestWidth) { bestWidth = w; best = candidate; }
  }
  const size = Math.max(40, fitSize(best, NAME_MAX_SIZE * 0.85, 1));
  ctx.font = `${size}px ${font}`;
  // Script capitals and descenders reach far, so give the lines real air.
  return { lines: best, size, lineHeight: size * 1.02 };
}

/** Renders one traveler's card onto a new canvas. */
export async function renderTravelCard(rawName: string, role: TravelCardRole = 'traveler'): Promise<HTMLCanvasElement> {
  const { bg, overlay, scriptFont } = await loadAssets();
  const name = rawName.replace(/\s+/g, ' ').trim();
  // Artwork designed in Logo Studio replaces the bundled background + overlay.
  const art = await getTravelCardArt();
  const custom = art.front ? await loadArtImage(art.front) : null;

  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not supported in this browser.');

  ctx.save();
  roundedRectPath(ctx, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
  ctx.clip();
  if (custom) {
    drawCover(ctx, custom, CARD_WIDTH, CARD_HEIGHT);
  } else {
    ctx.drawImage(bg, 0, 0, CARD_WIDTH, CARD_HEIGHT);
    ctx.drawImage(overlay, 0, 0, CARD_WIDTH, CARD_HEIGHT);
  }
  ctx.restore();

  // Name (script)
  ctx.fillStyle = custom ? inkOver(ctx, 140, 760, CARD_WIDTH - 280, 360, INK) : INK;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
  const { lines, lineHeight } = fitName(ctx, scriptFont, name);
  const firstBaseline = NAME_BASELINE_Y - lineHeight * (lines.length - 1);
  lines.forEach((line, i) => ctx.fillText(line, NAME_CENTER_X, firstBaseline + i * lineHeight));

  // "TRAVELER" label
  ctx.font = `500 ${LABEL_SIZE}px ${LABEL_FAMILY}`;
  drawTracked(ctx, ROLE_LABEL[role], CARD_WIDTH / 2, LABEL_BASELINE_Y, LABEL_TRACKING);

  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not create the image.'))), 'image/png');
  });
}

export async function renderTravelCardBlob(name: string, role: TravelCardRole = 'traveler'): Promise<Blob> {
  return canvasToBlob(await renderTravelCard(name, role));
}

export function travelCardFileName(name: string, role: TravelCardRole = 'traveler'): string {
  const safe = name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || (role === 'leader' ? 'Trip-Leader' : 'Traveler');
  return `${role === 'leader' ? 'ULAA-Trip-Leader-Card' : 'ULAA-Travel-Card'}-${safe}.png`;
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Renders and downloads one front card as a PNG. */
export async function downloadTravelCard(name: string, role: TravelCardRole = 'traveler'): Promise<void> {
  saveBlob(await renderTravelCardBlob(name, role), travelCardFileName(name, role));
}

// ---------------------------------------------------------------------------
// Back card
// ---------------------------------------------------------------------------

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
  instagram: 'ulaa.trips',
  phone: '+91 63813 36772',
};

// Measured from the final back-card design.
const BACK_INK = INK;
const TOP_LINE = { size: 47.5, tracking: 8.85, baseline: 714, centerX: 638 };
const HEADLINE = { designWidth: 977, maxWidth: 1040, minSize: 36, baseline: 852, centerX: 636 };
const SCAN_LINE = { size: 34.5, tracking: 4.3, baseline: 1493, centerX: 627, maxWidth: 900 };
const CONTACT_FAMILY = 'TravelCardContact'; // Carlito Bold, a Calibri look-alike (the design uses Calibri)
const CONTACT = { size: 42.5, baseline: 1602, instaX: 339, instaMaxWidth: 205, phoneX: 703, phoneMaxWidth: 520 };

let backAssetsPromise: Promise<{ bg: HTMLImageElement; overlay: HTMLImageElement; scriptFont: string }> | null = null;

function loadBackAssets() {
  if (!backAssetsPromise) {
    backAssetsPromise = (async () => {
      const contact = new FontFace(CONTACT_FAMILY, `url(${ASSET_BASE}/fonts/carlito-bold.woff2)`);
      const [bg, overlay, base] = await Promise.all([
        loadImage(`${ASSET_BASE}/back-background.png`),
        loadImage(`${ASSET_BASE}/back-overlay.png`),
        loadAssets(), // label font + name script font, shared with the front
        contact.load().then(f => { document.fonts.add(f); }),
      ]);
      return { bg, overlay, scriptFont: base.scriptFont };
    })().catch(err => { backAssetsPromise = null; throw err; });
  }
  return backAssetsPromise;
}

function fitWidth(ctx: CanvasRenderingContext2D, text: string, size: number, maxWidth: number) {
  ctx.font = ctx.font.replace(/[\d.]+px/, `${size}px`);
  const w = ctx.measureText(text).width;
  return w > maxWidth ? Math.max(10, size * (maxWidth / w)) : size;
}

/** Renders the back of the card with the given text. */
export async function renderTravelCardBack(text: BackCardText): Promise<HTMLCanvasElement> {
  const { bg, overlay, scriptFont } = await loadBackAssets();
  const art = await getTravelCardArt();
  const custom = art.back ? await loadArtImage(art.back) : null;
  const clean = (v: string) => v.replace(/\s+/g, ' ').trim();
  const topLine = clean(text.topLine).toUpperCase();
  const headline = clean(text.headline);
  const scanLine = clean(text.scanLine).toUpperCase();
  const instagram = clean(text.instagram);
  const phone = clean(text.phone);

  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not supported in this browser.');

  ctx.save();
  roundedRectPath(ctx, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
  ctx.clip();
  if (custom) {
    drawCover(ctx, custom, CARD_WIDTH, CARD_HEIGHT);
  } else {
    ctx.drawImage(bg, 0, 0, CARD_WIDTH, CARD_HEIGHT);
    ctx.drawImage(overlay, 0, 0, CARD_WIDTH, CARD_HEIGHT);
  }
  ctx.restore();

  ctx.fillStyle = custom ? inkOver(ctx, 120, 650, CARD_WIDTH - 240, 1000, BACK_INK) : BACK_INK;
  ctx.textBaseline = 'alphabetic';

  // Small line above the headline
  if (topLine) {
    ctx.font = `500 ${TOP_LINE.size}px ${LABEL_FAMILY}`;
    drawTracked(ctx, topLine, TOP_LINE.centerX, TOP_LINE.baseline, TOP_LINE.tracking);
  }

  // Headline: sized so the default wording spans the design's width with
  // whatever script font is loaded; longer wording shrinks to fit.
  if (headline) {
    ctx.font = `100px ${scriptFont}`;
    const designSize = (100 * HEADLINE.designWidth) / ctx.measureText(DEFAULT_BACK_CARD_TEXT.headline).width;
    ctx.font = `${designSize}px ${scriptFont}`;
    const natural = ctx.measureText(headline).width;
    const size = Math.max(HEADLINE.minSize, natural > HEADLINE.maxWidth ? designSize * (HEADLINE.maxWidth / natural) : designSize);
    ctx.font = `${size}px ${scriptFont}`;
    ctx.textAlign = 'center';
    ctx.fillText(headline, HEADLINE.centerX, HEADLINE.baseline);
  }

  // Caption under the QR code
  if (scanLine) {
    ctx.font = `500 ${SCAN_LINE.size}px ${LABEL_FAMILY}`;
    const widthAtSize = [...scanLine].reduce((s, c) => s + ctx.measureText(c).width, 0) + SCAN_LINE.tracking * (scanLine.length - 1);
    const scale = widthAtSize > SCAN_LINE.maxWidth ? SCAN_LINE.maxWidth / widthAtSize : 1;
    ctx.font = `500 ${SCAN_LINE.size * scale}px ${LABEL_FAMILY}`;
    drawTracked(ctx, scanLine, SCAN_LINE.centerX, SCAN_LINE.baseline, SCAN_LINE.tracking * scale);
  }

  // Instagram + phone (icons and divider are part of the artwork)
  ctx.textAlign = 'left';
  ctx.font = `${CONTACT.size}px ${CONTACT_FAMILY}`;
  if (instagram) {
    ctx.font = `${fitWidth(ctx, instagram, CONTACT.size, CONTACT.instaMaxWidth)}px ${CONTACT_FAMILY}`;
    ctx.fillText(instagram, CONTACT.instaX, CONTACT.baseline);
  }
  ctx.font = `${CONTACT.size}px ${CONTACT_FAMILY}`;
  if (phone) {
    ctx.font = `${fitWidth(ctx, phone, CONTACT.size, CONTACT.phoneMaxWidth)}px ${CONTACT_FAMILY}`;
    ctx.fillText(phone, CONTACT.phoneX, CONTACT.baseline);
  }

  return canvas;
}

export async function renderTravelCardBackBlob(text: BackCardText): Promise<Blob> {
  return canvasToBlob(await renderTravelCardBack(text));
}

/** Renders and downloads the back of the card as a PNG. */
export async function downloadTravelCardBack(text: BackCardText): Promise<void> {
  saveBlob(await renderTravelCardBackBlob(text), 'ULAA-Travel-Card-Back.png');
}

// ---------------------------------------------------------------------------
// Badge (round pin / sticker)
// ---------------------------------------------------------------------------
// Two 2000 x 2000 layers that line up exactly: the round background with the
// red ring (transparent outside the circle) and the ULAA logo with the Tamil
// "உலா". The badge is the same for everyone, so it can be downloaded once or
// laid out many times on A3 sheets for printing.

export const BADGE_SIZE = 2000;

let badgeAssetsPromise: Promise<{ bg: HTMLImageElement; logo: HTMLImageElement }> | null = null;

function loadBadgeAssets() {
  if (!badgeAssetsPromise) {
    badgeAssetsPromise = Promise.all([
      loadImage(`${ASSET_BASE}/badge-background.png`),
      loadImage(`${ASSET_BASE}/badge-logo.png`),
    ]).then(([bg, logo]) => ({ bg, logo })).catch(err => { badgeAssetsPromise = null; throw err; });
  }
  return badgeAssetsPromise;
}

async function renderBadgeCanvas(sizePx: number = BADGE_SIZE): Promise<HTMLCanvasElement> {
  const art = await getTravelCardArt();
  const custom = art.badge ? await loadArtImage(art.badge) : null;
  const { bg, logo } = await loadBadgeAssets();
  const canvas = document.createElement('canvas');
  canvas.width = sizePx;
  canvas.height = sizePx;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not supported in this browser.');
  ctx.imageSmoothingQuality = 'high';
  if (custom) {
    // Artwork designed in Logo Studio fills the round badge.
    ctx.beginPath();
    ctx.arc(sizePx / 2, sizePx / 2, sizePx / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    drawCover(ctx, custom, sizePx, sizePx);
    return canvas;
  }
  ctx.drawImage(bg, 0, 0, sizePx, sizePx);
  ctx.drawImage(logo, 0, 0, sizePx, sizePx);
  return canvas;
}

export async function renderBadgeBlob(): Promise<Blob> {
  return canvasToBlob(await renderBadgeCanvas());
}

/** Downloads one badge as a full-size PNG. */
export async function downloadBadge(): Promise<void> {
  saveBlob(await renderBadgeBlob(), 'ULAA-Badge.png');
}

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

type PdfDoc = InstanceType<(typeof import('jspdf'))['jsPDF']>;
function drawGuides(pdf: PdfDoc, shapes: GuideShape[]) {
  if (shapes.length === 0) return;
  pdf.setDrawColor(90, 90, 90);
  pdf.setLineWidth(GUIDE_LINE_MM);
  for (const sh of shapes) {
    if (sh.t === 'rrect') pdf.roundedRect(sh.x, sh.y, sh.w, sh.h, sh.r, sh.r, 'S');
    else if (sh.t === 'circle') pdf.circle(sh.cx, sh.cy, sh.r, 'S');
    else pdf.line(sh.x1, sh.y1, sh.x2, sh.y2);
  }
}

// A3 print sheets ------------------------------------------------------------

const A3_WIDTH_MM = 297;
const A3_HEIGHT_MM = 420;
const SHEET_MARGIN_MM = 10;     // unprinted border most printers need
const MAX_SHEETS = 100;

export interface BadgeSheetSettings {
  diameterMm: number;   // finished badge size, e.g. 58
  gapMm: number;       // space between badges for cutting
  guides?: CutGuides;  // cut guides drawn on the sheet (default none)
}
interface BadgeSlot { x: number; y: number }   // top-left corner on the sheet, in mm

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

/** Downloads a multi-page A3 PDF with `quantity` badges, filled sheet by sheet. */
export async function downloadBadgeSheets(settings: BadgeSheetSettings, quantity: number): Promise<void> {
  const slots = layoutBadgeSheet(settings);
  const { sheets, tooManySheets } = planBadgeSheets(settings, quantity);
  if (slots.length === 0) throw new Error('That badge size does not fit on an A3 sheet.');
  if (tooManySheets) throw new Error(`That is more than ${MAX_SHEETS} sheets. Please download in smaller batches.`);

  // 600 dpi at the printed size is plenty; the artwork itself is 2000 px.
  const px = Math.min(BADGE_SIZE, Math.max(600, Math.round((settings.diameterMm / 25.4) * 600)));
  const dataUrl = (await renderBadgeCanvas(px)).toDataURL('image/png');

  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: [A3_WIDTH_MM, A3_HEIGHT_MM], orientation: 'portrait', compress: true });
  for (let sheet = 0; sheet < sheets; sheet++) {
    if (sheet > 0) pdf.addPage([A3_WIDTH_MM, A3_HEIGHT_MM], 'portrait');
    const onThisSheet = Math.min(slots.length, quantity - sheet * slots.length);
    for (let i = 0; i < onThisSheet; i++) {
      // The same alias means the image is stored once in the PDF.
      pdf.addImage(dataUrl, 'PNG', slots[i].x, slots[i].y, settings.diameterMm, settings.diameterMm, 'ulaa-badge', 'FAST');
      drawGuides(pdf, badgeCutGuides(slots[i], settings.diameterMm, settings.gapMm, settings.guides ?? 'none'));
    }
  }
  saveBlob(pdf.output('blob'), `ULAA-Badges-A3-${quantity}pcs.pdf`);
}

// ---------------------------------------------------------------------------
// A3 print sheets for cards (front or back)
// ---------------------------------------------------------------------------
// Cards are laid out in a plain grid, on whichever A3 orientation (portrait or
// landscape) fits more of them. The card keeps its design proportions, so
// only the width is chosen; the height follows.

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

function renderCardItem(item: CardSheetItem): Promise<HTMLCanvasElement> {
  return item.kind === 'front' ? renderTravelCard(item.name, item.role) : renderTravelCardBack(item.text);
}

/** A small PNG of a card for the on-screen sheet preview. */
export async function renderCardThumbBlob(item: CardSheetItem, widthPx = 260): Promise<Blob> {
  const full = await renderCardItem(item);
  const thumb = document.createElement('canvas');
  thumb.width = widthPx;
  thumb.height = Math.round(widthPx * CARD_ASPECT);
  const ctx = thumb.getContext('2d');
  if (!ctx) throw new Error('Canvas is not supported in this browser.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(full, 0, 0, thumb.width, thumb.height);
  return canvasToBlob(thumb);
}

// Printed on white paper, so the transparent rounded corners become white and
// the card can be a (much smaller) JPEG inside the PDF.
async function cardJpegDataUrl(item: CardSheetItem): Promise<string> {
  const card = await renderCardItem(item);
  const flat = document.createElement('canvas');
  flat.width = card.width;
  flat.height = card.height;
  const ctx = flat.getContext('2d');
  if (!ctx) throw new Error('Canvas is not supported in this browser.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, flat.width, flat.height);
  ctx.drawImage(card, 0, 0);
  return flat.toDataURL('image/jpeg', 0.92);
}

const yieldToUi = () => new Promise<void>(resolve => setTimeout(resolve, 0));

/**
 * Downloads a multi-page A3 PDF of cards. With one item it is repeated
 * `total` times (the common back card); otherwise `items` are printed in
 * order, one card each.
 */
export async function downloadCardSheets(settings: CardSheetSettings, items: CardSheetItem[], total: number, fileName: string): Promise<void> {
  const { layout, perSheet, sheets, tooManySheets } = planCardSheets(settings, total);
  if (items.length === 0 || perSheet === 0) throw new Error('That card size does not fit on an A3 sheet.');
  if (tooManySheets) throw new Error(`That is more than ${MAX_SHEETS} sheets. Please download in smaller batches.`);

  const { jsPDF } = await import('jspdf');
  const pageSize: [number, number] = [Math.min(layout.pageWidth, layout.pageHeight), Math.max(layout.pageWidth, layout.pageHeight)];
  const orientation = layout.landscape ? 'landscape' : 'portrait';
  const pdf = new jsPDF({ unit: 'mm', format: pageSize, orientation, compress: true });

  const images = new Map<string, { alias: string; dataUrl: string }>();
  for (let sheet = 0; sheet < sheets; sheet++) {
    if (sheet > 0) pdf.addPage(pageSize, orientation);
    const onThisSheet = Math.min(perSheet, total - sheet * perSheet);
    for (let i = 0; i < onThisSheet; i++) {
      const item = items[items.length === 1 ? 0 : sheet * perSheet + i];
      const key = cardSheetItemKey(item);
      let image = images.get(key);
      if (!image) {
        image = { alias: `ulaa-card-${images.size}`, dataUrl: await cardJpegDataUrl(item) };
        images.set(key, image);
        await yieldToUi();
      }
      const slot = layout.slots[i];
      pdf.addImage(image.dataUrl, 'JPEG', slot.x, slot.y, layout.cardWidth, layout.cardHeight, image.alias, 'FAST');
      drawGuides(pdf, cardCutGuides(slot, layout.cardWidth, layout.cardHeight, settings.gapMm, settings.guides ?? 'none'));
    }
  }
  saveBlob(pdf.output('blob'), fileName);
}
