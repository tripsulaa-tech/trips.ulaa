// Draws the ULAA "Travel Card" (name tag, front and back) on a canvas and
// downloads it as a PNG. The front is layered exactly like the design file:
//   1. background.jpg   - sunset scene with the lanyard hole
//   2. overlay.png      - ULAA logo + divider (transparent PNG)
//   3. the traveler's name (script font) and the "TRAVELER" label, drawn here
// The back card (back-background.png + back-overlay.png) keeps its logo, QR
// code and icons as artwork and only the five text lines are drawn here, so
// they can be edited. All coordinates are in the design's own 1276 x 2031
// pixel space, measured from the final cards, so the output matches 1:1.

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

  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not supported in this browser.');

  ctx.save();
  roundedRectPath(ctx, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
  ctx.clip();
  ctx.drawImage(bg, 0, 0, CARD_WIDTH, CARD_HEIGHT);
  ctx.drawImage(overlay, 0, 0, CARD_WIDTH, CARD_HEIGHT);
  ctx.restore();

  // Name (script)
  ctx.fillStyle = INK;
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
  ctx.drawImage(bg, 0, 0, CARD_WIDTH, CARD_HEIGHT);
  ctx.drawImage(overlay, 0, 0, CARD_WIDTH, CARD_HEIGHT);
  ctx.restore();

  ctx.fillStyle = BACK_INK;
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
