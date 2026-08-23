import type { jsPDF } from 'jspdf';
import type { RGB } from './shared';
import { COLORS } from './shared';

// =============================================================================
// Hand-drawn icon set for the itinerary-PDF slide deck.
// -----------------------------------------------------------------------------
// Split out of context.ts's `createPdfContext`, unchanged, since it accounted
// for roughly half that file on its own. Takes the same low-level drawing
// primitives `createPdfContext` already built (setDraw/setFill/setText,
// drawCheck/drawCross) rather than re-deriving them here, so there's still
// exactly one implementation of each to drift out of sync.
// =============================================================================

interface CreateIconsDeps {
  doc: jsPDF;
  setDraw: (c: RGB) => void;
  setFill: (c: RGB) => void;
  setText: (c: RGB) => void;
  drawCheck: (cx: number, cy: number, r: number, color: RGB, weight?: number) => void;
  drawCross: (cx: number, cy: number, r: number, color: RGB, weight?: number) => void;
  COLORS: typeof COLORS;
}

/** Simple line-art icon set, drawn as vectors (never rasterized) so they
 *  stay crisp at any zoom and never depend on an external icon font. */
export function createIcons({ doc, setDraw, setFill, setText, drawCheck, drawCross, COLORS }: CreateIconsDeps) {
  return {
    calendar(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setDraw(color);
      doc.setLineWidth(1.4);
      doc.roundedRect(x, y - s * 0.72, s, s * 0.82, 2.5, 2.5, 'S');
      doc.line(x, y - s * 0.42, x + s, y - s * 0.42);
      doc.line(x + s * 0.25, y - s * 0.86, x + s * 0.25, y - s * 0.6);
      doc.line(x + s * 0.75, y - s * 0.86, x + s * 0.75, y - s * 0.6);
    },
    star(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setFill(color);
      const cx = x + s / 2;
      const cy = y - s * 0.4;
      const pts: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const ang = (Math.PI / 5) * i - Math.PI / 2;
        const rad = i % 2 === 0 ? s * 0.5 : s * 0.21;
        pts.push([cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad]);
      }
      const lines = pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]);
      doc.lines(lines, pts[0][0], pts[0][1], [1, 1], 'F', true);
    },
    mountain(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setFill(color);
      doc.triangle(x, y, x + s * 0.42, y - s * 0.8, x + s * 0.72, y, 'F');
      doc.triangle(x + s * 0.4, y, x + s * 0.75, y - s * 0.6, x + s, y, 'F');
    },
    backpack(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setDraw(color);
      doc.setLineWidth(1.4);
      doc.roundedRect(x + s * 0.12, y - s * 0.78, s * 0.76, s * 0.78, 3, 3, 'S');
      doc.roundedRect(x + s * 0.3, y - s * 0.95, s * 0.4, s * 0.24, 2, 2, 'S');
      doc.line(x + s * 0.24, y - s * 0.4, x + s * 0.76, y - s * 0.4);
    },
    pin(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setFill(color);
      const cx = x + s * 0.4;
      const cy = y - s * 0.65;
      doc.circle(cx, cy, s * 0.32, 'F');
      doc.triangle(cx - s * 0.24, cy + s * 0.14, cx + s * 0.24, cy + s * 0.14, cx, y, 'F');
      setFill(COLORS.white);
      doc.circle(cx, cy, s * 0.12, 'F');
    },
    plane(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setFill(color);
      const cx = x + s / 2;
      const cy = y - s * 0.5;
      // Fuselage
      doc.triangle(cx - s * 0.05, cy - s * 0.42, cx + s * 0.05, cy - s * 0.42, cx + s * 0.08, cy + s * 0.4, 'F');
      doc.triangle(cx - s * 0.05, cy - s * 0.42, cx + s * 0.08, cy + s * 0.4, cx - s * 0.08, cy + s * 0.4, 'F');
      // Wings
      doc.triangle(cx, cy - s * 0.02, cx + s * 0.5, cy + s * 0.22, cx + s * 0.04, cy + s * 0.12, 'F');
      doc.triangle(cx, cy - s * 0.02, cx - s * 0.5, cy + s * 0.22, cx - s * 0.04, cy + s * 0.12, 'F');
      // Tail fins
      doc.triangle(cx - s * 0.06, cy + s * 0.3, cx - s * 0.22, cy + s * 0.42, cx - s * 0.02, cy + s * 0.4, 'F');
      doc.triangle(cx + s * 0.06, cy + s * 0.3, cx + s * 0.22, cy + s * 0.42, cx + s * 0.02, cy + s * 0.4, 'F');
    },
    train(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setFill(color);
      const bodyW = s * 0.7;
      const bodyH = s * 0.78;
      const bx = x + (s - bodyW) / 2;
      const by = y - s * 0.92;
      doc.roundedRect(bx, by, bodyW, bodyH, bodyW * 0.22, bodyW * 0.22, 'F');
      setFill(COLORS.white);
      doc.roundedRect(bx + bodyW * 0.14, by + bodyH * 0.16, bodyW * 0.3, bodyH * 0.28, 2, 2, 'F');
      doc.roundedRect(bx + bodyW * 0.56, by + bodyH * 0.16, bodyW * 0.3, bodyH * 0.28, 2, 2, 'F');
      setFill(color);
      doc.rect(bx - bodyW * 0.08, y - s * 0.14, bodyW * 1.16, s * 0.1, 'F');
      doc.circle(bx + bodyW * 0.2, y - s * 0.04, s * 0.06, 'F');
      doc.circle(bx + bodyW * 0.8, y - s * 0.04, s * 0.06, 'F');
    },
    bus(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setFill(color);
      const bodyW = s * 0.9;
      const bodyH = s * 0.55;
      const bx = x + (s - bodyW) / 2;
      const by = y - s * 0.78;
      doc.roundedRect(bx, by, bodyW, bodyH, 4, 4, 'F');
      setFill(COLORS.white);
      for (let i = 0; i < 3; i++) {
        doc.roundedRect(bx + bodyW * 0.08 + i * bodyW * 0.3, by + bodyH * 0.2, bodyW * 0.22, bodyH * 0.35, 1.5, 1.5, 'F');
      }
      setFill(color);
      doc.circle(bx + bodyW * 0.22, by + bodyH + s * 0.05, s * 0.08, 'F');
      doc.circle(bx + bodyW * 0.78, by + bodyH + s * 0.05, s * 0.08, 'F');
    },
    question(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setFill(color);
      doc.circle(x + s / 2, y - s * 0.4, s * 0.4, 'F');
      setText(COLORS.white);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(s * 0.5);
      doc.text('?', x + s / 2, y - s * 0.28, { align: 'center' });
    },
    shield(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setFill(color);
      doc.triangle(x, y - s * 0.85, x + s * 0.5, y - s, x + s * 0.5, y - s * 0.1, 'F');
      doc.triangle(x, y - s * 0.85, x + s * 0.5, y - s * 0.1, x, y - s * 0.15, 'F');
      doc.triangle(x + s, y - s * 0.85, x + s * 0.5, y - s, x + s * 0.5, y - s * 0.1, 'F');
      doc.triangle(x + s, y - s * 0.85, x + s * 0.5, y - s * 0.1, x + s, y - s * 0.15, 'F');
    },
    check(x: number, y: number, s = 20, color: RGB = COLORS.green) {
      setFill(color);
      doc.circle(x + s / 2, y - s * 0.4, s * 0.4, 'F');
      drawCheck(x + s / 2, y - s * 0.4, s * 0.32, COLORS.white, 2);
    },
    cross(x: number, y: number, s = 20, color: RGB = COLORS.red) {
      setFill(color);
      doc.circle(x + s / 2, y - s * 0.4, s * 0.4, 'F');
      drawCross(x + s / 2, y - s * 0.4, s * 0.3, COLORS.white, 2);
    },
    // ---- Things-to-Carry item icons ----
    idcard(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setDraw(color);
      doc.setLineWidth(1.3);
      doc.roundedRect(x + s * 0.05, y - s * 0.85, s * 0.9, s * 0.7, 2.5, 2.5, 'S');
      setFill(color);
      doc.circle(x + s * 0.28, y - s * 0.58, s * 0.13, 'F');
      doc.setLineWidth(1.1);
      doc.line(x + s * 0.52, y - s * 0.62, x + s * 0.84, y - s * 0.62);
      doc.line(x + s * 0.52, y - s * 0.48, x + s * 0.74, y - s * 0.48);
    },
    cash(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setDraw(color);
      doc.setLineWidth(1.4);
      doc.roundedRect(x + s * 0.02, y - s * 0.62, s * 0.96, s * 0.5, 3, 3, 'S');
      doc.circle(x + s * 0.5, y - s * 0.37, s * 0.14, 'S');
      setFill(color);
      doc.circle(x + s * 0.14, y - s * 0.37, s * 0.045, 'F');
      doc.circle(x + s * 0.86, y - s * 0.37, s * 0.045, 'F');
    },
    shirt(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setFill(color);
      doc.roundedRect(x + s * 0.22, y - s * 0.78, s * 0.56, s * 0.7, 3, 3, 'F');
      doc.triangle(x + s * 0.22, y - s * 0.7, x + s * 0.02, y - s * 0.5, x + s * 0.22, y - s * 0.4, 'F');
      doc.triangle(x + s * 0.78, y - s * 0.7, x + s * 0.98, y - s * 0.5, x + s * 0.78, y - s * 0.4, 'F');
    },
    sun(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      const cx = x + s * 0.5;
      const cy = y - s * 0.5;
      setFill(color);
      doc.circle(cx, cy, s * 0.24, 'F');
      setDraw(color);
      doc.setLineWidth(1.5);
      doc.setLineCap('round');
      for (let i = 0; i < 8; i++) {
        const ang = (Math.PI / 4) * i;
        const r1 = s * 0.36;
        const r2 = s * 0.48;
        doc.line(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1, cx + Math.cos(ang) * r2, cy + Math.sin(ang) * r2);
      }
    },
    pill(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      const w = s * 0.8;
      const h = s * 0.34;
      const rx = x + (s - w) / 2;
      const ry = y - s * 0.6;
      setDraw(color);
      doc.setLineWidth(1.3);
      doc.roundedRect(rx, ry, w, h, h / 2, h / 2, 'S');
      setFill(color);
      doc.rect(rx + w * 0.06, ry + h * 0.1, w * 0.42, h * 0.8, 'F');
      doc.line(rx + w / 2, ry, rx + w / 2, ry + h);
    },
    plug(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setFill(color);
      doc.roundedRect(x + s * 0.18, y - s * 0.62, s * 0.64, s * 0.5, 4, 4, 'F');
      doc.rect(x + s * 0.32, y - s * 0.82, s * 0.1, s * 0.22, 'F');
      doc.rect(x + s * 0.58, y - s * 0.82, s * 0.1, s * 0.22, 'F');
      setFill(COLORS.white);
      const cx = x + s * 0.5;
      const cy = y - s * 0.38;
      doc.triangle(cx + s * 0.06, cy - s * 0.16, cx - s * 0.08, cy + s * 0.02, cx + s * 0.02, cy + s * 0.02, 'F');
      doc.triangle(cx + s * 0.02, cy + s * 0.02, cx - s * 0.06, cy + s * 0.2, cx + s * 0.08, cy - s * 0.02, 'F');
    },
    shoe(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setFill(color);
      doc.roundedRect(x + s * 0.05, y - s * 0.22, s * 0.9, s * 0.16, 3, 3, 'F');
      doc.roundedRect(x + s * 0.08, y - s * 0.55, s * 0.5, s * 0.36, 4, 4, 'F');
      doc.triangle(x + s * 0.5, y - s * 0.5, x + s * 0.95, y - s * 0.3, x + s * 0.55, y - s * 0.2, 'F');
    },
    // ---- Info-box icons (Meeting Point / Eligibility compact cards) ----
    navigation(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setFill(color);
      const cx = x + s * 0.5;
      const cy = y - s * 0.5;
      // Compass-arrow / "get directions" kite shape, pointing up-right.
      doc.triangle(cx - s * 0.04, cy - s * 0.48, cx + s * 0.4, cy + s * 0.42, cx - s * 0.04, cy + s * 0.14, 'F');
      doc.triangle(cx - s * 0.04, cy - s * 0.48, cx - s * 0.04, cy + s * 0.14, cx - s * 0.44, cy + s * 0.42, 'F');
    },
    userCheck(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setFill(color);
      const cx = x + s * 0.36;
      doc.circle(cx, y - s * 0.76, s * 0.19, 'F');
      doc.roundedRect(cx - s * 0.3, y - s * 0.5, s * 0.6, s * 0.44, s * 0.2, s * 0.2, 'F');
      setFill(COLORS.green);
      doc.circle(x + s * 0.84, y - s * 0.2, s * 0.22, 'F');
      drawCheck(x + s * 0.84, y - s * 0.2, s * 0.16, COLORS.white, 1.6);
    },
    // ---- Closing-slide icons (booking card meta row, contact bar, footer) ----
    clock(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      const cx = x + s * 0.5;
      const cy = y - s * 0.5;
      const r = s * 0.42;
      setDraw(color);
      doc.setLineWidth(1.4);
      doc.circle(cx, cy, r, 'S');
      doc.setLineWidth(1.2);
      doc.setLineCap('round');
      doc.line(cx, cy, cx, cy - r * 0.55);
      doc.line(cx, cy, cx + r * 0.42, cy + r * 0.08);
    },
    users(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setFill(color);
      const r1 = s * 0.17;
      const cx1 = x + s * 0.32;
      const cy1 = y - s * 0.7;
      doc.circle(cx1, cy1, r1, 'F');
      doc.roundedRect(cx1 - s * 0.24, y - s * 0.44, s * 0.48, s * 0.34, s * 0.17, s * 0.17, 'F');
      const r2 = s * 0.14;
      const cx2 = x + s * 0.74;
      const cy2 = y - s * 0.6;
      doc.circle(cx2, cy2, r2, 'F');
      doc.roundedRect(cx2 - s * 0.2, y - s * 0.38, s * 0.4, s * 0.3, s * 0.14, s * 0.14, 'F');
    },
    phone(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      const cx = x + s * 0.5;
      const cy = y - s * 0.5;
      setFill(color);
      doc.circle(cx - s * 0.18, cy - s * 0.18, s * 0.15, 'F');
      doc.circle(cx + s * 0.18, cy + s * 0.18, s * 0.15, 'F');
      setDraw(color);
      doc.setLineWidth(s * 0.2);
      doc.setLineCap('round');
      doc.line(cx - s * 0.1, cy - s * 0.1, cx + s * 0.1, cy + s * 0.1);
    },
    mail(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      const w = s * 0.9;
      const h = s * 0.62;
      const rx = x + (s - w) / 2;
      const ry = y - s * 0.72;
      setDraw(color);
      doc.setLineWidth(1.4);
      doc.roundedRect(rx, ry, w, h, 2, 2, 'S');
      doc.line(rx, ry, rx + w / 2, ry + h * 0.55);
      doc.line(rx + w, ry, rx + w / 2, ry + h * 0.55);
    },
    globe(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      const cx = x + s * 0.5;
      const cy = y - s * 0.5;
      const r = s * 0.42;
      setDraw(color);
      doc.setLineWidth(1.3);
      doc.circle(cx, cy, r, 'S');
      doc.ellipse(cx, cy, r * 0.42, r, 'S');
      doc.line(cx - r, cy, cx + r, cy);
    },
    instagram(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      // Sized/weighted to match the real lucide-react icons used for the
      // other contact-bar entries (Headphones/Phone/Mail/Globe), which fill
      // most of their `s`-sized box — this hand-drawn glyph previously used
      // only 72% of that box at a thinner stroke, so it read smaller and
      // lighter than its neighbors in the footer row.
      const w = s * 0.86;
      const rx = x + (s - w) / 2;
      const ry = y - s / 2 - w / 2;
      setDraw(color);
      doc.setLineWidth(1.4);
      doc.roundedRect(rx, ry, w, w, w * 0.28, w * 0.28, 'S');
      doc.circle(rx + w / 2, ry + w / 2, w * 0.26, 'S');
      setFill(color);
      doc.circle(rx + w * 0.76, ry + w * 0.24, w * 0.07, 'F');
    },
    headset(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      const cx = x + s * 0.5;
      const cy = y - s * 0.6;
      const r = s * 0.4;
      setDraw(color);
      doc.setLineWidth(1.6);
      doc.setLineCap('round');
      for (let i = 0; i < 8; i++) {
        const a1 = Math.PI + (Math.PI * i) / 8;
        const a2 = Math.PI + (Math.PI * (i + 1)) / 8;
        doc.line(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, cx + Math.cos(a2) * r, cy + Math.sin(a2) * r);
      }
      setFill(color);
      doc.roundedRect(cx - r - s * 0.06, cy - s * 0.02, s * 0.14, s * 0.26, 3, 3, 'F');
      doc.roundedRect(cx + r - s * 0.08, cy - s * 0.02, s * 0.14, s * 0.26, 3, 3, 'F');
      // Mic boom + bulb curving down-forward from the left ear cup, so the
      // icon reads as a support headset (with mic) rather than plain headphones.
      const earBottomX = cx - r - s * 0.06 + s * 0.07;
      const earBottomY = cy - s * 0.02 + s * 0.26;
      setDraw(color);
      doc.setLineWidth(1.4);
      doc.line(earBottomX, earBottomY, earBottomX + s * 0.13, earBottomY + s * 0.15);
      setFill(color);
      doc.circle(earBottomX + s * 0.15, earBottomY + s * 0.17, s * 0.06, 'F');
    },
    /** WhatsApp-style call bubble: a filled circle with a speech-bubble tail
     *  and a simple white handset glyph, used for the "Call / WhatsApp"
     *  contact item instead of the plain phone icon. */
    whatsapp(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      const cx = x + s * 0.5;
      const cy = y - s * 0.56;
      const r = s * 0.46;
      setFill(color);
      doc.circle(cx, cy, r, 'F');
      doc.triangle(cx - r * 0.15, cy + r * 0.78, cx + r * 0.35, cy + r * 0.78, cx - r * 0.05, cy + r * 1.25, 'F');
      setFill(COLORS.white);
      doc.circle(cx - r * 0.16, cy - r * 0.16, r * 0.16, 'F');
      doc.circle(cx + r * 0.16, cy + r * 0.16, r * 0.16, 'F');
      setDraw(COLORS.white);
      doc.setLineWidth(r * 0.22);
      doc.setLineCap('round');
      doc.line(cx - r * 0.08, cy - r * 0.08, cx + r * 0.08, cy + r * 0.08);
    },
    lock(x: number, y: number, s = 20, color: RGB = COLORS.white) {
      const bw = s * 0.62;
      const bh = s * 0.48;
      const bx = x + (s - bw) / 2;
      const by = y - bh;
      setFill(color);
      doc.roundedRect(bx, by, bw, bh, 2.5, 2.5, 'F');
      setDraw(color);
      doc.setLineWidth(s * 0.09);
      const cx = x + s / 2;
      const r = s * 0.2;
      for (let i = 0; i < 8; i++) {
        const a1 = Math.PI + (Math.PI * i) / 8;
        const a2 = Math.PI + (Math.PI * (i + 1)) / 8;
        doc.line(cx + Math.cos(a1) * r, by + Math.sin(a1) * r, cx + Math.cos(a2) * r, by + Math.sin(a2) * r);
      }
      setFill(COLORS.primary);
      doc.circle(cx, by + bh * 0.42, s * 0.05, 'F');
    },
    /** Small hand-drawn-style heart, used next to the cursive closing-slide
     *  headings. style 'F' fills it solid, 'S' draws an outline only. */
    heart(x: number, y: number, s = 20, color: RGB = COLORS.primary, style: 'F' | 'S' = 'F') {
      const cx = x + s * 0.5;
      const topY = y - s * 0.62;
      const r = s * 0.26;
      if (style === 'F') {
        setFill(color);
      } else {
        setDraw(color);
        doc.setLineWidth(1.3);
      }
      doc.circle(cx - r * 0.7, topY, r, style);
      doc.circle(cx + r * 0.7, topY, r, style);
      doc.triangle(cx - r * 1.55, topY + r * 0.32, cx + r * 1.55, topY + r * 0.32, cx, y, style);
    },
    /** Simple palm-silhouette doodle for the closing slide's footer band. */
    palm(x: number, y: number, s = 20, color: RGB = COLORS.white) {
      setDraw(color);
      doc.setLineWidth(1.6);
      doc.setLineCap('round');
      doc.line(x + s * 0.5, y, x + s * 0.42, y - s * 0.5);
      doc.line(x + s * 0.42, y - s * 0.5, x + s * 0.55, y - s * 0.88);
      setFill(color);
      const tipX = x + s * 0.55;
      const tipY = y - s * 0.88;
      [-0.9, -0.45, 0, 0.45, 0.9].forEach(a => {
        const ang = -Math.PI / 2 + a;
        const ex = tipX + Math.cos(ang) * s * 0.42;
        const ey = tipY + Math.sin(ang) * s * 0.42;
        const ex2 = tipX + Math.cos(ang + 0.32) * s * 0.26;
        const ey2 = tipY + Math.sin(ang + 0.32) * s * 0.26;
        doc.triangle(tipX, tipY, ex, ey, ex2, ey2, 'F');
      });
    },
    share(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      const cx = x + s * 0.5;
      const cy = y - s * 0.5;
      const pts: [number, number][] = [
        [cx - s * 0.32, cy],
        [cx + s * 0.3, cy - s * 0.3],
        [cx + s * 0.3, cy + s * 0.3],
      ];
      setDraw(color);
      doc.setLineWidth(1.3);
      doc.line(pts[0][0], pts[0][1], pts[1][0], pts[1][1]);
      doc.line(pts[0][0], pts[0][1], pts[2][0], pts[2][1]);
      setFill(color);
      pts.forEach(p => doc.circle(p[0], p[1], s * 0.11, 'F'));
    },
    download(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      const cx = x + s * 0.5;
      setDraw(color);
      doc.setLineWidth(1.4);
      doc.setLineCap('round');
      doc.line(cx, y - s * 0.9, cx, y - s * 0.3);
      doc.line(cx - s * 0.22, y - s * 0.5, cx, y - s * 0.28);
      doc.line(cx + s * 0.22, y - s * 0.5, cx, y - s * 0.28);
      doc.line(x + s * 0.12, y, x + s * 0.88, y);
    },
  };
}

