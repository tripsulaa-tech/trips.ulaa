// Shareable "Pack the bag" score card: a 1080×1350 (4:5) PNG drawn on a
// canvas. Dark brand look (footer brown + terracotta/gold glows), Inter type,
// a score ring, glass stat tiles and a layered-ridge footer. No assets other
// than the site logo; every other shape is vector-drawn.

import { cleanName } from './gameUi';

export interface ScoreCardOptions {
  /** Optional player name, shown as "Played by …" under the rating. */
  playerName?: string;
  score: number;
  stars: number;
  title: string;
  tripTitle: string;
  host: string;
  /** Pack the bag: default stat tiles use these. */
  packed?: number;
  combo?: number;
  best: number;
  isNewBest: boolean;
  /** Other games: override the pill text, the label under the number, the
   *  three stat tiles, and the score that fills the ring. */
  eyebrow?: string;
  unit?: string;
  tiles?: Array<{ v: string; l: string }>;
  ringMax?: number;
}

const SCORE_CARD_W = 1080;
const SCORE_CARD_H = 1350;

// Brand tokens (mirror globals.css @theme).
const C = {
  ink: '#1B130E',
  footer: '#271E18',
  dark: '#2D2118',
  primary: '#A85A2A',
  primaryLight: '#C4703A',
  secondary: '#D98A3A',
  gold: '#C8962A',
  goldLight: '#F0CE7A',
  goldPale: '#F7E08F',
  cream: '#FAF7F2',
};

const FONT = 'Inter, system-ui, sans-serif';
const RING_MAX = 180; // score at which the ring is full

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.48;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

// Letter-spaced text, drawn glyph by glyph so it works in every browser.
function spaced(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, spacing: number) {
  const chars = [...text];
  const widths = chars.map(c => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  const prev = ctx.textAlign;
  ctx.textAlign = 'left';
  let x = cx - total / 2;
  chars.forEach((c, i) => { ctx.fillText(c, x, y); x += widths[i] + spacing; });
  ctx.textAlign = prev;
  return total;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last}…`;
    return kept;
  }
  return lines;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
}

// Makes sure Inter is actually loaded before drawing; canvas silently falls
// back to the system font otherwise. Never blocks for long.
async function ensureFonts() {
  try {
    if (!document.fonts?.load) return;
    await Promise.race([
      Promise.all([
        document.fonts.load(`500 32px Inter`),
        document.fonts.load(`700 32px Inter`),
        document.fonts.load(`800 32px Inter`),
      ]),
      new Promise(r => setTimeout(r, 1200)),
    ]);
  } catch { /* fall back to system font */ }
}

// If the logo has a transparent background we recolour it cream so it reads
// on the dark card; otherwise it sits on a cream badge instead.
function logoIsTransparent(img: HTMLImageElement): boolean {
  try {
    const c = document.createElement('canvas');
    c.width = 8; c.height = 8;
    const x = c.getContext('2d');
    if (!x) return false;
    x.drawImage(img, 0, 0, 8, 8);
    const d = x.getImageData(0, 0, 8, 8).data;
    // corners
    return d[3] < 20 && d[(7 * 4) + 3] < 20 && d[(7 * 8 * 4) + 3] < 20 && d[(63 * 4) + 3] < 20;
  } catch { return false; }
}

function ridge(ctx: CanvasRenderingContext2D, baseY: number, amp: number, seed: number, color: string | CanvasGradient) {
  const W = SCORE_CARD_W;
  ctx.beginPath();
  ctx.moveTo(0, SCORE_CARD_H);
  ctx.lineTo(0, baseY);
  const steps = 9;
  for (let i = 0; i <= steps; i++) {
    const x = (W / steps) * i;
    const peak = Math.sin(i * 1.7 + seed) * 0.5 + Math.sin(i * 0.65 + seed * 2.1) * 0.5;
    const y = baseY - (peak * 0.5 + 0.5) * amp;
    const px = x - W / steps / 2;
    const py = baseY - ((Math.sin((i - 0.5) * 1.7 + seed) * 0.5 + Math.sin((i - 0.5) * 0.65 + seed * 2.1) * 0.5) * 0.5 + 0.5) * amp;
    if (i === 0) ctx.lineTo(x, y); else ctx.quadraticCurveTo(px, py, x, y);
  }
  ctx.lineTo(W, SCORE_CARD_H);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

export async function buildScoreCard(o: ScoreCardOptions): Promise<Blob | null> {
  const W = SCORE_CARD_W;
  const H = SCORE_CARD_H;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // The footer logo is the light-on-dark version, so it goes straight on the
  // card. If it is missing we fall back to the main logo (recoloured or on a
  // cream badge).
  const [, footerLogo] = await Promise.all([ensureFonts(), loadImage(`${window.location.origin}/ULAA-logo-Footer.png`)]);
  const logo = footerLogo ?? await loadImage(`${window.location.origin}/ULAA-logo.png`);
  const logoOnDark = !!footerLogo;
  const cx = W / 2;

  // ── Background ──
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, C.dark);
  bg.addColorStop(0.55, C.footer);
  bg.addColorStop(1, C.ink);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glow = (x: number, y: number, r: number, rgb: string, a: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${a})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
  glow(cx, 620, 560, '168,90,42', 0.42);   // terracotta behind the ring
  glow(W - 80, 60, 420, '200,150,42', 0.22); // gold, top-right
  glow(80, H - 160, 460, '217,138,58', 0.16);

  // Fine dot grid, faded toward the edges.
  ctx.save();
  ctx.fillStyle = 'rgba(250,247,242,0.07)';
  for (let gy = 36; gy < H; gy += 36) {
    for (let gx = 36; gx < W; gx += 36) {
      const d = Math.hypot(gx - cx, gy - 620) / 720;
      if (d > 1) continue;
      ctx.globalAlpha = 1 - d * 0.85;
      ctx.beginPath();
      ctx.arc(gx, gy, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  // Layered ridges along the bottom.
  const r1 = ctx.createLinearGradient(0, 1080, 0, H);
  r1.addColorStop(0, 'rgba(168,90,42,0.30)'); r1.addColorStop(1, 'rgba(168,90,42,0.05)');
  const r2 = ctx.createLinearGradient(0, 1140, 0, H);
  r2.addColorStop(0, 'rgba(200,150,42,0.22)'); r2.addColorStop(1, 'rgba(200,150,42,0.03)');
  const r3 = ctx.createLinearGradient(0, 1200, 0, H);
  r3.addColorStop(0, 'rgba(15,10,7,0.85)'); r3.addColorStop(1, 'rgba(15,10,7,0.95)');
  ridge(ctx, 1170, 190, 0.6, r1);
  ridge(ctx, 1215, 150, 2.4, r2);
  ridge(ctx, 1262, 110, 4.1, r3);

  // Frame: hairline gold border with a brighter top-left → bottom-right sweep.
  const frame = ctx.createLinearGradient(0, 0, W, H);
  frame.addColorStop(0, 'rgba(240,206,122,0.65)');
  frame.addColorStop(0.5, 'rgba(240,206,122,0.12)');
  frame.addColorStop(1, 'rgba(240,206,122,0.45)');
  ctx.strokeStyle = frame;
  ctx.lineWidth = 2;
  rr(ctx, 32, 32, W - 64, H - 64, 48);
  ctx.stroke();

  // ── Logo ──
  let y = 84;
  if (logo) {
    const ratio = logo.width / logo.height;
    const lh = Math.min(logoOnDark ? 104 : 116, (logoOnDark ? 300 : 230) / ratio);
    const lw = lh * ratio;
    if (logoOnDark) {
      ctx.drawImage(logo, cx - lw / 2, y, lw, lh);
    } else if (logoIsTransparent(logo)) {
      const t = document.createElement('canvas');
      t.width = lw * 2; t.height = lh * 2;
      const tx = t.getContext('2d');
      if (tx) {
        tx.drawImage(logo, 0, 0, t.width, t.height);
        tx.globalCompositeOperation = 'source-in';
        tx.fillStyle = C.cream;
        tx.fillRect(0, 0, t.width, t.height);
        ctx.drawImage(t, cx - lw / 2, y, lw, lh);
      }
    } else {
      const pw = lw + 56;
      const ph = lh + 36;
      ctx.fillStyle = C.cream;
      rr(ctx, cx - pw / 2, y - 6, pw, ph, 28);
      ctx.fill();
      ctx.drawImage(logo, cx - lw / 2, y + 12, lw, lh);
    }
    y += lh + 52;
  } else {
    ctx.textAlign = 'center';
    ctx.fillStyle = C.cream;
    ctx.font = `800 64px ${FONT}`;
    spaced(ctx, 'ULAA', cx, y + 56, 14);
    y += 132;
  }

  // ── Eyebrow pill + trip title ──
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 22px ${FONT}`;
  const eyebrow = o.eyebrow ?? 'PACK THE BAG  ·  30-SEC CHALLENGE';
  const ew = (() => { let w = 0; for (const ch of eyebrow) w += ctx.measureText(ch).width + 4; return w - 4; })() + 56;
  ctx.fillStyle = 'rgba(200,150,42,0.14)';
  rr(ctx, cx - ew / 2, y - 30, ew, 48, 24);
  ctx.fill();
  ctx.strokeStyle = 'rgba(240,206,122,0.35)';
  ctx.lineWidth = 1.5;
  rr(ctx, cx - ew / 2, y - 30, ew, 48, 24);
  ctx.stroke();
  ctx.fillStyle = C.goldLight;
  spaced(ctx, eyebrow, cx, y + 3, 4);
  y += 90;

  ctx.textAlign = 'center';
  ctx.fillStyle = C.cream;
  ctx.font = `800 54px ${FONT}`;
  const lines = wrap(ctx, o.tripTitle, 840, 2);
  // A one-line title gets a little extra air so the card stays balanced.
  const air = lines.length === 1 ? 30 : 0;
  y += air;
  lines.forEach((l, i) => ctx.fillText(l, cx, y + i * 64));
  y += (lines.length - 1) * 64 + air;

  // ── Score ring ──
  const R = 186;
  const ringCy = y + 50 + R + 14;
  // soft disc
  const disc = ctx.createRadialGradient(cx, ringCy - 40, 20, cx, ringCy, R + 30);
  disc.addColorStop(0, 'rgba(250,247,242,0.10)');
  disc.addColorStop(1, 'rgba(250,247,242,0.02)');
  ctx.fillStyle = disc;
  ctx.beginPath(); ctx.arc(cx, ringCy, R + 6, 0, Math.PI * 2); ctx.fill();

  // track
  ctx.lineWidth = 26;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(250,247,242,0.09)';
  ctx.beginPath(); ctx.arc(cx, ringCy, R, 0, Math.PI * 2); ctx.stroke();

  // progress arc with glow
  const frac = Math.max(0.04, Math.min(1, o.score / (o.ringMax ?? RING_MAX)));
  const start = -Math.PI / 2;
  const end = start + Math.PI * 2 * frac;
  const arcG = ctx.createLinearGradient(cx - R, ringCy - R, cx + R, ringCy + R);
  arcG.addColorStop(0, C.secondary);
  arcG.addColorStop(0.5, C.goldLight);
  arcG.addColorStop(1, C.gold);
  ctx.save();
  ctx.shadowColor = 'rgba(240,206,122,0.55)';
  ctx.shadowBlur = 36;
  ctx.strokeStyle = arcG;
  ctx.beginPath(); ctx.arc(cx, ringCy, R, start, end); ctx.stroke();
  ctx.restore();

  // inner hairline
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(250,247,242,0.10)';
  ctx.beginPath(); ctx.arc(cx, ringCy, R - 34, 0, Math.PI * 2); ctx.stroke();

  // number (gold gradient)
  const numStr = String(o.score);
  const numSize = numStr.length >= 4 ? 128 : numStr.length === 3 ? 164 : numStr.length === 2 ? 210 : 236;
  ctx.font = `800 ${numSize}px ${FONT}`;
  const numG = ctx.createLinearGradient(0, ringCy - numSize * 0.5, 0, ringCy + numSize * 0.4);
  numG.addColorStop(0, '#FFF6CC');
  numG.addColorStop(0.55, C.goldLight);
  numG.addColorStop(1, C.gold);
  ctx.fillStyle = numG;
  ctx.textAlign = 'center';
  ctx.fillText(numStr, cx, ringCy + numSize * 0.26);
  ctx.fillStyle = 'rgba(250,247,242,0.55)';
  ctx.font = `700 24px ${FONT}`;
  spaced(ctx, o.unit ?? 'POINTS', cx, ringCy + numSize * 0.26 + 50, 8);

  // New-best badge on the ring's top-right
  if (o.isNewBest) {
    ctx.save();
    ctx.translate(cx + R * 0.86, ringCy - R * 0.86);
    ctx.rotate(0.2);
    ctx.font = `800 24px ${FONT}`;
    const label = 'NEW BEST';
    const bw = 190;
    const bg2 = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0);
    bg2.addColorStop(0, C.goldLight); bg2.addColorStop(1, C.gold);
    ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 8;
    ctx.fillStyle = bg2;
    rr(ctx, -bw / 2, -26, bw, 52, 26);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = C.dark;
    spaced(ctx, label, 0, 8, 3);
    ctx.restore();
  }

  // ── Stars ──
  let sy = ringCy + R + 76;
  for (let i = 0; i < 3; i++) {
    const sx = cx + (i - 1) * 96;
    const on = i < o.stars;
    ctx.save();
    if (on) {
      ctx.shadowColor = 'rgba(240,206,122,0.6)';
      ctx.shadowBlur = 24;
      const sg = ctx.createLinearGradient(sx, sy - 40, sx, sy + 40);
      sg.addColorStop(0, '#FFF0B8'); sg.addColorStop(1, C.gold);
      ctx.fillStyle = sg;
    } else {
      ctx.fillStyle = 'rgba(250,247,242,0.12)';
    }
    starPath(ctx, sx, sy, 40);
    ctx.fill();
    ctx.restore();
  }

  // ── Rating title ──
  sy += 94;
  ctx.fillStyle = C.cream;
  ctx.font = `800 54px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(o.title, cx, sy);

  // ── Stat tiles ──
  const tiles: Array<{ v: string; l: string }> = (o.tiles ?? [
    { v: String(o.packed ?? 0), l: 'ITEMS PACKED' },
    { v: `×${o.combo ?? 1}`, l: 'BEST COMBO' },
    { v: String(Math.max(o.best, o.score)), l: 'PERSONAL BEST' },
  ]).slice(0, 3);
  const tw = 270;
  const gap = 24;
  const th = 104;
  const tx0 = cx - (tw * 3 + gap * 2) / 2;
  // Player name, when given.
  let nameGap = 0;
  const pname = cleanName(o.playerName);
  if (pname) {
    const prefix = 'Played by ';
    ctx.font = `600 28px ${FONT}`;
    const pw = ctx.measureText(prefix).width;
    ctx.font = `800 28px ${FONT}`;
    let shown = pname;
    while (shown.length > 1 && pw + ctx.measureText(shown).width > 760) shown = shown.slice(0, -1);
    if (shown !== pname) shown = `${shown}…`;
    const nw = ctx.measureText(shown).width;
    const nx = cx - (pw + nw) / 2;
    ctx.textAlign = 'left';
    ctx.font = `600 28px ${FONT}`;
    ctx.fillStyle = 'rgba(250,247,242,0.6)';
    ctx.fillText(prefix, nx, sy + 50);
    ctx.font = `800 28px ${FONT}`;
    ctx.fillStyle = C.goldLight;
    ctx.fillText(shown, nx + pw, sy + 50);
    ctx.textAlign = 'center';
    nameGap = 44;
  }
  const ty = sy + 36 + nameGap;
  tiles.forEach((t, i) => {
    const x = tx0 + i * (tw + gap);
    ctx.fillStyle = 'rgba(250,247,242,0.07)';
    rr(ctx, x, ty, tw, th, 28);
    ctx.fill();
    ctx.strokeStyle = 'rgba(250,247,242,0.14)';
    ctx.lineWidth = 1.5;
    rr(ctx, x, ty, tw, th, 28);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = C.cream;
    ctx.font = `800 46px ${FONT}`;
    ctx.fillText(t.v, x + tw / 2, ty + 54);
    ctx.fillStyle = 'rgba(250,247,242,0.55)';
    ctx.font = `700 16px ${FONT}`;
    spaced(ctx, t.l, x + tw / 2, ty + 88, 3);
  });

  // ── CTA pill + host ──
  const ctaY = ty + th + 30;
  ctx.font = `800 30px ${FONT}`;
  const ctaText = 'Think you can beat me?';
  const cw = ctx.measureText(ctaText).width + 128;
  const ch = 68;
  const ctaG = ctx.createLinearGradient(cx - cw / 2, 0, cx + cw / 2, 0);
  ctaG.addColorStop(0, C.primaryLight);
  ctaG.addColorStop(1, C.primary);
  ctx.save();
  ctx.shadowColor = 'rgba(168,90,42,0.55)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = ctaG;
  rr(ctx, cx - cw / 2, ctaY, cw, ch, ch / 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.fillText(ctaText, cx - 22, ctaY + 44);
  // arrow
  const ax = cx + cw / 2 - 52;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(ax - 12, ctaY + ch / 2);
  ctx.lineTo(ax + 12, ctaY + ch / 2);
  ctx.moveTo(ax + 3, ctaY + ch / 2 - 10);
  ctx.lineTo(ax + 13, ctaY + ch / 2);
  ctx.lineTo(ax + 3, ctaY + ch / 2 + 10);
  ctx.stroke();

  ctx.fillStyle = 'rgba(250,247,242,0.7)';
  ctx.font = `600 24px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(o.host, cx, ctaY + ch + 40);

  return new Promise(res => canvas.toBlob(res, 'image/png'));
}
