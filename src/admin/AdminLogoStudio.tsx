import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { DownloadSimple, ArrowCounterClockwise, Warning, Copy, ClipboardText, Check } from '@phosphor-icons/react';
import AdminLayout from './AdminLayout';
import ColorPicker, { type ColorSwatch } from '../components/ui/ColorPicker';
import LogoStudioSiteLogos from './LogoStudioSiteLogos';
import LogoStudioMailEditor from './LogoStudioMailEditor';

// Admin → Logo Studio: pick a ready-made logo, tweak its colours and download it.
//
// Each logo is built from transparent single-colour layers (public/logo-layers/*.png,
// all the same size within one artwork so they stack exactly). Each layer is tinted
// with the chosen colour using only its alpha channel, then the layers are composited
// over the background colour. Nothing about the design is stored: every visit starts
// from a pre-design. The "Site logos" tab (LogoStudioSiteLogos) is where a finished
// logo, or any uploaded image, is chosen for the header, footer, admin and so on.

type LogoColorKey = 'background' | 'sun' | 'lettering' | 'landscape' | 'tamil';
type LogoColors = Record<LogoColorKey, string>;
type DesignId = 'classic' | 'header' | 'tshirt';
type Format = 'png' | 'jpg' | 'svg' | 'pdf';
/** What the "Use studio logo" buttons on the Site logos tab ask the studio to draw. */
export type StudioKind = 'wide' | 'square' | 'badge' | 'card-front' | 'card-back';
type MarginId = 'none' | 'small' | 'medium' | 'large';

interface LayerDef {
  key: Exclude<LogoColorKey, 'background'>;
  src: string;
}

interface DesignDef {
  id: DesignId;
  /** Colour-box names for this design where they differ from the defaults. */
  labels?: Partial<Record<LogoColorKey, string>>;
  /** Drawing order, bottom to top. All layers of a design share one canvas size. */
  layers: LayerDef[];
}

const DESIGNS: DesignDef[] = [
  {
    id: 'classic',
    layers: [
      { key: 'sun', src: '/logo-layers/classic-sun.png' },
      { key: 'lettering', src: '/logo-layers/classic-lettering.png' },
      { key: 'landscape', src: '/logo-layers/classic-landscape.png' },
      { key: 'tamil', src: '/logo-layers/classic-tamil.png' },
    ],
  },
  {
    id: 'header',
    layers: [
      { key: 'sun', src: '/logo-layers/header-sun.png' },
      { key: 'lettering', src: '/logo-layers/header-lettering.png' },
      { key: 'landscape', src: '/logo-layers/header-landscape.png' },
    ],
  },
  {
    // T-shirt back print: sun + clouds + dots, palm/mountains scene, tagline.
    id: 'tshirt',
    labels: { sun: 'Sun & clouds', lettering: 'Tagline text' },
    layers: [
      { key: 'sun', src: '/logo-layers/tshirt-sun.png' },
      { key: 'landscape', src: '/logo-layers/tshirt-landscape.png' },
      { key: 'lettering', src: '/logo-layers/tshirt-lettering.png' },
    ],
  },
];


const COLOR_FIELDS: { key: LogoColorKey; label: string }[] = [
  { key: 'background', label: 'Background' },
  { key: 'sun', label: 'Sun & divider' },
  { key: 'lettering', label: 'ULAA letters' },
  { key: 'landscape', label: 'Palm & mountains' },
  { key: 'tamil', label: 'Tamil text' },
];

interface PreDesign {
  id: string;
  name: string;
  /** Short label under the small thumbnail. */
  short: string;
  thumb: string;
  /** Background of the thumbnail tile, so light logos stay visible. */
  tile: string;
  design: DesignId;
  colors: LogoColors;
}

// The logo palette: the studio's colours start from these four and its picker offers them first.
const BRAND_COLORS: ColorSwatch[] = [
  { name: 'Beige', hex: '#f6f2ea' },
  { name: 'Orange', hex: '#fe480a' },
  { name: 'Brown', hex: '#72573e' },
  { name: 'Dark brown', hex: '#2d2118' },
];

const PREDESIGNS: PreDesign[] = [
  {
    id: 'header',
    name: 'Header',
    short: 'Header',
    thumb: '/logo-presets/header.png',
    tile: '#f6f2ea',
    design: 'header',
    colors: { background: '#f6f2ea', sun: '#fe480a', lettering: '#2d2118', landscape: '#2d2118', tamil: '#2d2118' },
  },
  {
    id: 'invoice',
    name: 'Invoice',
    short: 'Invoice',
    thumb: '/logo-presets/invoice.png',
    tile: '#f6f2ea',
    design: 'classic',
    colors: { background: '#f6f2ea', sun: '#fe480a', lettering: '#2d2118', landscape: '#2d2118', tamil: '#2d2118' },
  },
  {
    id: 'footer',
    name: 'Footer',
    short: 'Footer',
    thumb: '/logo-presets/footer.png',
    tile: '#2d2118',
    design: 'classic',
    colors: { background: '#2d2118', sun: '#fe480a', lettering: '#f6f2ea', landscape: '#72573e', tamil: '#f6f2ea' },
  },
  {
    id: 'tshirt',
    name: 'T-shirt back',
    short: 'T-shirt',
    thumb: '/logo-presets/tshirt.png',
    tile: '#f6f2ea',
    design: 'tshirt',
    colors: { background: '#f6f2ea', sun: '#fe480a', lettering: '#2d2118', landscape: '#2d2118', tamil: '#2d2118' },
  },
  {
    id: 'tshirt-dark',
    name: 'T-shirt back · dark',
    short: 'T-shirt dark',
    thumb: '/logo-presets/tshirt-dark.png',
    tile: '#2d2118',
    design: 'tshirt',
    colors: { background: '#2d2118', sun: '#fe480a', lettering: '#f6f2ea', landscape: '#f6f2ea', tamil: '#f6f2ea' },
  },
];

// Margin = empty space kept around the logo on every side, as a % of the logo's longest side.
const MARGINS: { value: MarginId; label: string; pct: number }[] = [
  { value: 'none', label: 'None', pct: 0 },
  { value: 'small', label: 'S', pct: 4 },
  { value: 'medium', label: 'M', pct: 8 },
  { value: 'large', label: 'L', pct: 15 },
];

const FORMAT_OPTIONS: { value: Format; label: string }[] = [
  { value: 'png', label: 'PNG' },
  { value: 'jpg', label: 'JPG' },
  { value: 'svg', label: 'SVG' },
  { value: 'pdf', label: 'PDF' },
];

// Size = side of the square (1:1) downloaded image, margin included. The classic
// artwork is 3900 px wide, so Max is its full resolution; the header artwork is
// smaller (about 870 px) and is scaled up beyond that.
// Size 0 = custom (width × height); it is a button of its own beside the presets.
const SIZES = [
  { value: 400, label: '400' },
  { value: 800, label: '800' },
  { value: 1600, label: '1600' },
  { value: 3000, label: '3000' },
  { value: 4000, label: '4000' },
  { value: 0, label: 'Custom' },
];

// Custom size limits (px per side, and total pixels so the browser can still draw it).
const CUSTOM_MIN = 16;
const CUSTOM_MAX = 8000;
const CUSTOM_MAX_PIXELS = 64_000_000;

const PREVIEW_SIZE = 800;
// Layers are also kept pre-shrunk to this size and used for the preview and any
// small export, so repainting while a colour is dragged stays instant.
const SMALL_SOURCE = 1400;

const CHECKER =
  'bg-[length:16px_16px] bg-[linear-gradient(45deg,#e9e4dc_25%,transparent_25%,transparent_75%,#e9e4dc_75%),linear-gradient(45deg,#e9e4dc_25%,#fff_25%,#fff_75%,#e9e4dc_75%)] [background-position:0_0,8px_8px]';

function sameColors(a: LogoColors, b: LogoColors) {
  return (Object.keys(a) as LogoColorKey[]).every(k => a[k] === b[k]);
}

/** Custom-size framing: zoom (1 = whole logo fits) and a shift as a fraction of the canvas size.
 *  Anything pushed past the canvas edge is cropped away. */
interface View {
  zoom: number;
  x: number;
  y: number;
}
const DEFAULT_VIEW: View = { zoom: 1, x: 0, y: 0 };

interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

type Source = HTMLImageElement | HTMLCanvasElement;

/** Loads `name.svg` beside a layer's `name.png`. Null when it is missing or is not a real SVG
 *  (a host may answer a missing file with its HTML page). */
async function loadVectorLayer(pngSrc: string): Promise<VectorLayer | null> {
  try {
    const res = await fetch(pngSrc.replace(/\.png$/i, '.svg'));
    if (!res.ok) return null;
    const root = new DOMParser().parseFromString(await res.text(), 'image/svg+xml').documentElement;
    if (root.nodeName.toLowerCase() !== 'svg') return null;
    const vb = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
    const d = Array.from(root.querySelectorAll('path')).map(el => el.getAttribute('d') ?? '').join(' ').trim();
    if (vb.length !== 4 || !(vb[2] > 0) || !(vb[3] > 0) || !d) return null;
    return { d, w: vb[2], h: vb[3] };
  } catch {
    return null;
  }
}

async function loadVectors(design: DesignDef): Promise<Record<string, VectorLayer> | null> {
  const found = await Promise.all(design.layers.map(l => loadVectorLayer(l.src)));
  if (found.some(v => !v)) return null;
  const out: Record<string, VectorLayer> = {};
  design.layers.forEach((l, i) => { out[l.src] = found[i] as VectorLayer; });
  return out;
}

/** A traced layer (public/logo-layers/*.svg): one path in the PNG's pixel coordinates. */
interface VectorLayer {
  d: string;
  w: number;
  h: number;
}

interface LoadedDesign {
  /** Vector layers for SVG / PDF; null when any layer has no traced .svg yet. */
  vectors: Record<string, VectorLayer> | null;
  full: Record<string, Source>;
  fullBounds: Bounds;
  small: Record<string, Source>;
  smallBounds: Bounds;
}

/** Loads a design's layers (all cropped to the same artwork box, so the box is simply
 *  the layer size) and makes a pre-shrunk copy of each for the preview. */
async function loadDesign(design: DesignDef): Promise<LoadedDesign> {
  const [imgs, vectors] = await Promise.all([Promise.all(design.layers.map(l => loadImage(l.src))), loadVectors(design)]);
  const w = imgs[0].naturalWidth;
  const h = imgs[0].naturalHeight;
  const k = Math.min(1, SMALL_SOURCE / Math.max(w, h));
  const sw = Math.max(1, Math.round(w * k));
  const sh = Math.max(1, Math.round(h * k));
  const full: Record<string, Source> = {};
  const small: Record<string, Source> = {};
  design.layers.forEach((layer, i) => {
    full[layer.src] = imgs[i];
    const c = document.createElement('canvas');
    c.width = sw;
    c.height = sh;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(imgs[i], 0, 0, sw, sh);
    }
    small[layer.src] = c;
  });
  return { vectors, full, fullBounds: { x: 0, y: 0, w, h }, small, smallBounds: { x: 0, y: 0, w: sw, h: sh } };
}

/** Big exports use the full-resolution layers; small ones the pre-shrunk copies. */
function pickSource(ld: LoadedDesign, outSide: number) {
  return outSide <= SMALL_SOURCE
    ? { images: ld.small, bounds: ld.smallBounds }
    : { images: ld.full, bounds: ld.fullBounds };
}

/** Paints the logo onto `canvas`. The logo is cropped to its artwork `bounds`,
 *  `marginPct` % of its longest side is added around it, and the result is scaled
 *  so its longest side is `longSide` px. Each layer is tinted by drawing it, then
 *  filling the colour with `source-in` so only the layer's own opaque pixels keep
 *  the colour. With `square` the logo is centred on a square canvas (for icons). */
function renderLogo(
  canvas: HTMLCanvasElement,
  images: Record<string, Source>,
  design: DesignDef,
  colors: LogoColors,
  longSide: number,
  withBackground: boolean,
  bounds: Bounds,
  marginPct: number,
  square = false,
  fit?: { w: number; h: number },
  view: View = DEFAULT_VIEW,
) {
  const margin = (marginPct / 100) * Math.max(bounds.w, bounds.h);
  const totalW = bounds.w + margin * 2;
  const totalH = bounds.h + margin * 2;
  const side = Math.max(totalW, totalH);
  // With `fit` the canvas is exactly that size and the logo (with its margin) is scaled up or
  // down, keeping its shape, until it touches the edges; any spare room is background.
  const boxW = fit ? fit.w / Math.min(fit.w / totalW, fit.h / totalH) : square ? side : totalW;
  const boxH = fit ? fit.h / Math.min(fit.w / totalW, fit.h / totalH) : square ? side : totalH;
  const baseScale = fit ? Math.min(fit.w / totalW, fit.h / totalH) : longSide / Math.max(boxW, boxH);
  const scale = fit ? baseScale * view.zoom : baseScale;
  const width = fit ? Math.max(1, Math.round(fit.w)) : Math.max(1, Math.round(boxW * scale));
  const height = fit ? Math.max(1, Math.round(fit.h)) : Math.max(1, Math.round(boxH * scale));

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, width, height);
  if (withBackground) {
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, width, height);
  }

  const tint = document.createElement('canvas');
  tint.width = width;
  tint.height = height;
  const t = tint.getContext('2d');
  if (!t) return;
  t.imageSmoothingQuality = 'high';
  ctx.imageSmoothingQuality = 'high';

  const dx = fit ? (width - bounds.w * scale) / 2 + view.x * width : ((boxW - bounds.w) / 2) * scale;
  const dy = fit ? (height - bounds.h * scale) / 2 + view.y * height : ((boxH - bounds.h) / 2) * scale;
  const dw = bounds.w * scale;
  const dh = bounds.h * scale;

  for (const layer of design.layers) {
    const img = images[layer.src];
    if (!img) continue;
    t.globalCompositeOperation = 'source-over';
    t.clearRect(0, 0, width, height);
    t.drawImage(img, bounds.x, bounds.y, bounds.w, bounds.h, dx, dy, dw, dh);
    t.globalCompositeOperation = 'source-in';
    t.fillStyle = colors[layer.key];
    t.fillRect(0, 0, width, height);
    ctx.drawImage(tint, 0, 0);
  }
}


/** The logo as a square SVG, laid out exactly like renderLogo (margin, centred, 1:1). */
function buildVectorSvg(
  vectors: Record<string, VectorLayer>,
  design: DesignDef,
  colors: LogoColors,
  size: number,
  withBackground: boolean,
  bounds: Bounds,
  marginPct: number,
  fit?: { w: number; h: number },
  view: View = DEFAULT_VIEW,
): string {
  const margin = (marginPct / 100) * Math.max(bounds.w, bounds.h);
  const totalW = bounds.w + margin * 2;
  const totalH = bounds.h + margin * 2;
  const n = (v: number) => v.toFixed(2);
  if (fit) {
    // Same layout as renderLogo's fit mode: scaled to touch the edges, centred.
    const s = Math.min(fit.w / totalW, fit.h / totalH) * view.zoom;
    const ox = (fit.w - bounds.w * s) / 2 + view.x * fit.w;
    const oy = (fit.h - bounds.h * s) / 2 + view.y * fit.h;
    const fitted = design.layers
      .map(layer => {
        const v = vectors[layer.src];
        return `<path transform="translate(${n(ox)} ${n(oy)}) scale(${((bounds.w / v.w) * s).toFixed(6)})" fill="${colors[layer.key]}" fill-rule="evenodd" d="${v.d}"/>`;
      })
      .join('');
    const fbg = withBackground ? `<rect x="0" y="0" width="${fit.w}" height="${fit.h}" fill="${colors.background}"/>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${fit.w}" height="${fit.h}" viewBox="0 0 ${fit.w} ${fit.h}" overflow="hidden">${fbg}${fitted}</svg>`;
  }
  const side = Math.max(totalW, totalH);
  const dx = (side - bounds.w) / 2;
  const dy = (side - bounds.h) / 2;
  const paths = design.layers
    .map(layer => {
      const v = vectors[layer.src];
      const k = bounds.w / v.w;
      return `<path transform="translate(${n(dx)} ${n(dy)}) scale(${k.toFixed(6)})" fill="${colors[layer.key]}" fill-rule="evenodd" d="${v.d}"/>`;
    })
    .join('');
  const bg = withBackground ? `<rect x="0" y="0" width="${n(side)}" height="${n(side)}" fill="${colors.background}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${n(side)} ${n(side)}">${bg}${paths}</svg>`;
}

/** The SVG as a PDF page of the same square. 1 px = 0.75 pt (96 dpi), so it prints at the px size. */
async function svgToPdfBlob(svg: string | null, canvas: HTMLCanvasElement, width: number, height: number): Promise<Blob> {
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);
  const ptW = width * 0.75;
  const ptH = height * 0.75;
  const doc = new jsPDF({ unit: 'pt', format: [ptW, ptH], orientation: width > height ? 'landscape' : 'portrait' });
  if (svg) {
    const el = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
    await svg2pdf(el, doc, { x: 0, y: 0, width: ptW, height: ptH });
  } else {
    doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, ptW, ptH);
  }
  return doc.output('blob');
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}


/** useState that survives leaving the page: kept in sessionStorage for this browser tab only. */
function useSessionState<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.sessionStorage.getItem(key);
      if (raw !== null) {
        const parsed = JSON.parse(raw) as T;
        return typeof initial === 'object' && initial !== null ? ({ ...initial, ...parsed } as T) : parsed;
      }
    } catch { /* storage unavailable: use the default */ }
    return initial;
  });
  useEffect(() => {
    try { window.sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  }, [key, value]);
  return [value, setValue];
}

export default function AdminLogoStudio() {
  const [preId, setPreId] = useSessionState<string>('logoStudio.pre', PREDESIGNS[0].id);
  const [colors, setColors] = useSessionState<LogoColors>('logoStudio.colors', { ...PREDESIGNS[0].colors });
  const [margin, setMargin] = useSessionState<MarginId>('logoStudio.margin', 'medium');
  const [format, setFormat] = useSessionState<Format>('logoStudio.format', 'png');
  const [size, setSize] = useSessionState<number>('logoStudio.size', 3000);
  // Typed as text so a half-typed number is never rewritten under the cursor. Size 0 = custom.
  const [customW, setCustomW] = useSessionState('logoStudio.customW', '1200');
  const [customH, setCustomH] = useSessionState('logoStudio.customH', '630');
  const [transparent, setTransparent] = useSessionState('logoStudio.transparent', false);
  // Framing for custom sizes: zoom and drag-to-position (the part outside the frame is cropped).
  const [view, setView] = useSessionState<View>('logoStudio.view', DEFAULT_VIEW);
  // Colour last copied with a tile's copy button, ready to paste into any other colour.
  const [copiedColor, setCopiedColor] = useState<string | null>(null);
  const [justCopied, setJustCopied] = useState<LogoColorKey | null>(null);

  const [loaded, setLoaded] = useState<Partial<Record<DesignId, LoadedDesign>>>({});
  const requestedRef = useRef<Set<DesignId>>(new Set());
  const [imageError, setImageError] = useState(false);

  const [tab, setTab] = useSessionState<'design' | 'site' | 'mail'>('logoStudio.tab', 'design');
  const siteDirtyRef = useRef(false);
  const mailDirtyRef = useRef(false);
  const hasUnsavedChanges = useCallback(() => siteDirtyRef.current || mailDirtyRef.current, []);
  const handleSiteDirty = useCallback((dirty: boolean) => {
    siteDirtyRef.current = dirty;
  }, []);
  const handleMailDirty = useCallback((dirty: boolean) => {
    mailDirtyRef.current = dirty;
  }, []);

  const previewRef = useRef<HTMLCanvasElement>(null);

  // On a desktop-sized window the Design tab fits the screen exactly (no page scroll).
  // Small or short windows keep normal scrolling so nothing gets cut off.
  const [fitScreen, setFitScreen] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px) and (min-height: 640px)');
    const update = () => setFitScreen(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  const lockHeight = fitScreen && (tab === 'design' || tab === 'mail');

  const pre = PREDESIGNS.find(p => p.id === preId) ?? PREDESIGNS[0];
  const design = DESIGNS.find(d => d.id === pre.design) ?? DESIGNS[0];
  const marginPct = MARGINS.find(m => m.value === margin)?.pct ?? 0;
  const ld = loaded[design.id] ?? null;
  // Only the colours this design actually uses, named for it where it has its own wording.
  const colorFields = COLOR_FIELDS
    .filter(f => f.key === 'background' || design.layers.some(l => l.key === f.key))
    .map(f => ({ ...f, label: design.labels?.[f.key] ?? f.label }));
  const colorsChanged = !sameColors(colors, pre.colors);

  // JPG can't hold transparency, so it always includes the background.
  const withBackground = format === 'jpg' || !transparent;

  // Load a design's layers the first time it is shown (not all designs up front,
  // to keep memory use down with the large artwork).
  useEffect(() => {
    if (requestedRef.current.has(design.id)) return;
    requestedRef.current.add(design.id);
    loadDesign(design)
      .then(result => setLoaded(prev => ({ ...prev, [design.id]: result })))
      .catch(() => setImageError(true));
  }, [design]);

  const isCustom = size === 0;
  const cw = Math.round(Number(customW));
  const ch = Math.round(Number(customH));
  const customValid = cw >= CUSTOM_MIN && cw <= CUSTOM_MAX && ch >= CUSTOM_MIN && ch <= CUSTOM_MAX && cw * ch <= CUSTOM_MAX_PIXELS;
  // The preview takes the shape of the chosen custom size, so what you see is what you download.
  const previewCustom = isCustom && customValid;

  // Repaint the preview whenever the logo, a colour, the margin or the background option changes.
  useEffect(() => {
    if (!ld || !previewRef.current) return;
    if (previewCustom) {
      const k = PREVIEW_SIZE / Math.max(cw, ch);
      const fit = { w: Math.max(1, Math.round(cw * k)), h: Math.max(1, Math.round(ch * k)) };
      renderLogo(previewRef.current, ld.small, design, colors, PREVIEW_SIZE, withBackground, ld.smallBounds, marginPct, true, fit, view);
    } else {
      renderLogo(previewRef.current, ld.small, design, colors, PREVIEW_SIZE, withBackground, ld.smallBounds, marginPct, true);
    }
  }, [ld, design, colors, withBackground, marginPct, previewCustom, cw, ch, view]);

  // Drag the preview to choose which part of the logo stays inside the custom frame.
  const dragRef = useRef<{ px: number; py: number; vx: number; vy: number } | null>(null);
  const onPreviewDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!previewCustom) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { px: e.clientX, py: e.clientY, vx: view.x, vy: view.y };
  };
  const onPreviewMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    const c = previewRef.current;
    if (!d || !c) return;
    const r = c.getBoundingClientRect();
    // The canvas is letterboxed (object-contain); find the size it is really drawn at.
    const shown = Math.min(r.width / c.width, r.height / c.height);
    const dw = c.width * shown;
    const dh = c.height * shown;
    const lim = (v: number) => Math.max(-1.5, Math.min(1.5, v));
    setView(v => ({ ...v, x: lim(d.vx + (e.clientX - d.px) / dw), y: lim(d.vy + (e.clientY - d.py) / dh) }));
  };
  const onPreviewUp = () => { dragRef.current = null; };

  const copyColor = (key: LogoColorKey) => {
    const hex = colors[key];
    setCopiedColor(hex);
    setJustCopied(key);
    window.setTimeout(() => setJustCopied(k => (k === key ? null : k)), 1500);
    void navigator.clipboard?.writeText(hex).catch(() => {});
  };

  const pasteColor = (key: LogoColorKey) => {
    if (!copiedColor) return;
    setColors(c => (c[key] === copiedColor ? c : { ...c, [key]: copiedColor }));
  };

  const choosePre = (p: PreDesign) => {
    setPreId(p.id);
    setColors({ ...p.colors });
  };

  // The logo as shown in the preview, for the "Use studio logo" buttons. Wide
  // logos are transparent with a small margin; icons are the logo centred on a
  // square tile in the studio's background colour (so they read on any tab bar).
  const makeLogoFile = async (kind: StudioKind): Promise<File | null> => {
    if (!ld) return null;
    const canvas = document.createElement('canvas');
    if (kind === 'square') {
      const src = pickSource(ld, 512);
      renderLogo(canvas, src.images, design, colors, 512, true, src.bounds, 8, true);
    } else if (kind === 'badge') {
      // Square, filled with the background colour; a generous margin keeps the logo clear of the round edge.
      const src = pickSource(ld, 2000);
      renderLogo(canvas, src.images, design, colors, 2000, true, src.bounds, 20, true);
    } else if (kind === 'card-front' || kind === 'card-back') {
      // Portrait card at the Travel Cards size (1276 × 2031): background colour with the logo in the
      // upper area. The front keeps the space below for the name and role label; the back keeps it
      // for its text lines.
      canvas.width = 1276;
      canvas.height = 2031;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = colors.background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const src = pickSource(ld, 1600);
      const logo = document.createElement('canvas');
      renderLogo(logo, src.images, design, colors, 1600, false, src.bounds, 0);
      const box = kind === 'card-front' ? { cy: 440, w: 900, h: 420 } : { cy: 400, w: 800, h: 320 };
      const k = Math.min(box.w / logo.width, box.h / logo.height);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(logo, (canvas.width - logo.width * k) / 2, box.cy - (logo.height * k) / 2, logo.width * k, logo.height * k);
    } else {
      const src = pickSource(ld, 1600);
      renderLogo(canvas, src.images, design, colors, 1600, false, src.bounds, 4);
    }
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    const name = `ulaa-${kind === 'wide' ? 'logo' : kind === 'square' ? 'icon' : kind}-${pre.id}.png`;
    return blob ? new File([blob], name, { type: 'image/png' }) : null;
  };

  const handleDownload = async () => {
    if (!ld || (isCustom && !customValid)) return;
    // Output size: a square preset, or any width × height. The logo (with its margin) is
    // fitted and centred in the middle; any extra room is background (or transparent).
    const outW = isCustom ? cw : size;
    const outH = isCustom ? ch : size;
    // Custom sizes fill the whole width × height (logo keeps its shape); presets stay square.
    const fit = isCustom ? { w: outW, h: outH } : undefined;
    const side = isCustom ? Math.max(outW, outH) : size;
    const fileName = `ulaa-logo-${pre.id}-${isCustom ? `${outW}x${outH}` : size}${format !== 'jpg' && transparent ? '-transparent' : ''}.${format}`;
    const src = pickSource(ld, side);
    // SVG / PDF use the traced vector layers when the design has them; otherwise
    // they carry the high-resolution picture instead.
    const svg = format === 'svg' || format === 'pdf'
      ? ld.vectors && buildVectorSvg(ld.vectors, design, colors, side, withBackground, ld.fullBounds, marginPct, fit, view)
      : null;
    try {
      if (format === 'svg' && svg) {
        saveBlob(new Blob([svg], { type: 'image/svg+xml' }), fileName);
        return;
      }
      const canvas = document.createElement('canvas');
      if (!svg) {
        renderLogo(canvas, src.images, design, colors, side, withBackground, src.bounds, marginPct, true, fit, view);
      }
      if (format === 'pdf') {
        saveBlob(await svgToPdfBlob(svg, canvas, outW, outH), fileName);
        return;
      }
      if (format === 'svg') {
        const href = canvas.toDataURL('image/png');
        const wrapped = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${outW}" height="${outH}" viewBox="0 0 ${outW} ${outH}"><image width="${outW}" height="${outH}" xlink:href="${href}" href="${href}"/></svg>`;
        saveBlob(new Blob([wrapped], { type: 'image/svg+xml' }), fileName);
        return;
      }
      const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
      canvas.toBlob(
        blob => {
          if (!blob) {
            alert('Could not create the image. Please try again.');
            return;
          }
          saveBlob(blob, fileName);
        },
        mime,
        0.95,
      );
    } catch (err) {
      console.error(err);
      alert('Could not create the file. Please try again.');
    }
  };

  const chip = (on: boolean) =>
    `min-h-[30px] rounded-md border-2 px-2 text-xs font-medium transition-colors ${
      on ? 'border-primary bg-primary/5 text-primary' : 'border-background-warm text-dark hover:border-primary/50'
    }`;

  return (
    <AdminLayout
      title="Logo Studio"
      subtitle="Design the logo, choose the logos the site uses, and edit the booking email"
      hasUnsavedChanges={hasUnsavedChanges}
      fixedHeight={lockHeight}
    >
      <div className={`bg-white rounded-md border border-background-warm shadow-card ${lockHeight ? 'flex-1 min-h-0 flex flex-col overflow-hidden' : ''}`}>
        <div role="tablist" aria-label="Logo Studio sections" className={`flex gap-2 px-4 sm:px-6 ${lockHeight ? 'pt-3' : 'pt-4 sm:pt-6'}`}>
          {([
            ['design', 'Design & download'],
            ['site', 'Site logos'],
            ['mail', 'Email'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`min-h-[36px] rounded-md px-4 text-sm font-medium transition-colors ${
                tab === id ? 'bg-primary text-white' : 'bg-background-warm text-dark hover:bg-background-warm/70'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div role="tabpanel" hidden={tab !== 'design'} className={lockHeight ? 'flex-1 min-h-0' : ''}>
        <div className={`p-4 sm:p-6 grid gap-4 lg:gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)] items-start ${lockHeight ? 'h-full !py-3 items-stretch' : ''}`}>
          {/* Preview: same top edge as the controls; shrinks to fit the screen */}
          <section aria-label="Logo preview" className={lockHeight ? 'min-h-0 h-full' : ''}>
            <div
              className={`rounded-md border border-background-warm overflow-hidden ${lockHeight ? 'h-full flex items-center justify-center' : ''} ${
                withBackground ? '' : CHECKER
              }`}
              style={withBackground && !previewCustom ? { backgroundColor: colors.background } : previewCustom ? { backgroundColor: '#ece6dc' } : undefined}
            >
              {imageError ? (
                <div role="alert" className="flex items-start gap-3 p-6 text-sm text-dark-muted">
                  <Warning size={18} className="shrink-0 mt-0.5 text-primary" aria-hidden="true" />
                  <p>
                    The logo images could not be loaded. Make sure the files in
                    <code className="mx-1 px-1 rounded bg-background-warm">public/logo-layers</code>
                    are deployed with the site.
                  </p>
                </div>
              ) : (
                <canvas
                  ref={previewRef}
                  role="img"
                  aria-label="Ulaa logo preview"
                  onPointerDown={onPreviewDown}
                  onPointerMove={onPreviewMove}
                  onPointerUp={onPreviewUp}
                  onPointerCancel={onPreviewUp}
                  title={previewCustom ? 'Drag to move the logo inside the frame' : undefined}
                  style={previewCustom ? { touchAction: 'none' } : undefined}
                  className={`${lockHeight ? 'block max-h-full max-w-full h-full w-full object-contain' : 'block w-full h-auto'} ${
                    previewCustom ? 'cursor-grab active:cursor-grabbing' : ''
                  }`}
                />
              )}
            </div>
          </section>

          {/* Controls */}
          <div className={`space-y-3 ${lockHeight ? 'h-full min-h-0 overflow-hidden flex flex-col' : ''}`}>
            <section aria-label="Logo">
              <div className="grid grid-cols-5 gap-1.5">
                {PREDESIGNS.map(p => {
                  const active = p.id === preId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => choosePre(p)}
                      aria-pressed={active}
                      title={p.name}
                      className={`rounded-md border-2 p-1 text-center transition-colors ${
                        active ? 'border-primary bg-primary/5' : 'border-background-warm hover:border-primary/50'
                      }`}
                    >
                      <span
                        className="flex h-10 items-center justify-center overflow-hidden rounded-sm border border-black/5 p-1"
                        style={{ backgroundColor: p.tile }}
                      >
                        <img src={p.thumb} alt="" loading="lazy" className="max-h-full max-w-full object-contain" />
                      </span>
                      <span className="mt-1 block truncate text-2xs font-semibold text-dark">{p.short}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section aria-labelledby="logo-colours-heading" className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <h2 id="logo-colours-heading" className="text-sm font-semibold text-dark">Colours</h2>
                {colorsChanged && (
                  <button
                    type="button"
                    onClick={() => setColors({ ...pre.colors })}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                  >
                    <ArrowCounterClockwise size={14} aria-hidden="true" />
                    Reset
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {colorFields.map(f => {
                  const value = colors[f.key];
                  const canPaste = !!copiedColor && copiedColor !== value;
                  return (
                    <div
                      key={f.key}
                      className="rounded-md border-2 border-background-warm px-1.5 py-1 focus-within:border-primary transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <ColorPicker
                          value={value}
                          label={f.label}
                          swatches={BRAND_COLORS}
                          swatchesLabel="Logo colours"
                          sizeClass="h-5 w-5"
                          onChange={hex => setColors(c => (c[f.key] === hex ? c : { ...c, [f.key]: hex }))}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-2xs font-medium text-dark leading-tight">{f.label}</span>
                          <span className="block font-mono text-2xs uppercase text-dark-muted leading-tight">{value}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => copyColor(f.key)}
                          aria-label={`Copy ${f.label} colour code`}
                          title="Copy colour code"
                          className="inline-flex h-5 w-5 items-center justify-center rounded border border-background-warm text-dark hover:bg-background-warm transition-colors"
                        >
                          {justCopied === f.key ? (
                            <Check size={11} className="text-primary" aria-hidden="true" />
                          ) : (
                            <Copy size={11} aria-hidden="true" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => pasteColor(f.key)}
                          disabled={!canPaste}
                          aria-label={`Paste copied colour into ${f.label}`}
                          title={copiedColor ? `Paste ${copiedColor.toUpperCase()}` : 'Copy a colour first'}
                          className="inline-flex h-5 w-5 items-center justify-center rounded border border-background-warm text-dark hover:bg-background-warm transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                        >
                          <ClipboardText size={11} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section aria-labelledby="logo-download-heading" className="space-y-2">
              <h2 id="logo-download-heading" className="text-sm font-semibold text-dark">Download</h2>

              <div className="flex items-center gap-2">
                <span id="logo-margin-label" className="w-14 shrink-0 text-xs font-medium text-dark">Margin</span>
                <div role="group" aria-labelledby="logo-margin-label" className="grid flex-1 grid-cols-4 gap-1.5">
                  {MARGINS.map(m => (
                    <button key={m.value} type="button" onClick={() => setMargin(m.value)} aria-pressed={margin === m.value} className={chip(margin === m.value)}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span id="logo-format-label" className="w-14 shrink-0 text-xs font-medium text-dark">Format</span>
                <div role="group" aria-labelledby="logo-format-label" className="grid flex-1 grid-cols-4 gap-1.5">
                  {FORMAT_OPTIONS.map(o => (
                    <button key={o.value} type="button" onClick={() => setFormat(o.value)} aria-pressed={format === o.value} className={chip(format === o.value)}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span id="logo-size-label" className="w-14 shrink-0 text-xs font-medium text-dark">Size px</span>
                <div role="group" aria-labelledby="logo-size-label" className="grid flex-1 grid-cols-6 gap-1.5">
                  {SIZES.map(o => (
                    <button key={o.value} type="button" onClick={() => setSize(o.value)} aria-pressed={size === o.value} className={`${chip(size === o.value)} !px-0 ${o.value === 0 ? 'col-span-2' : ''}`}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              {isCustom && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <input aria-label="Width in pixels" placeholder="Width" inputMode="numeric" value={customW} onChange={e => setCustomW(e.target.value.replace(/\D/g, '').slice(0, 5))} aria-invalid={!customValid} className="w-full min-w-0 px-2 py-1 rounded-md border-2 border-background-warm bg-background text-xs text-dark focus:border-primary outline-none transition-colors" />
                    <span className="text-xs text-dark-muted">×</span>
                    <input aria-label="Height in pixels" placeholder="Height" inputMode="numeric" value={customH} onChange={e => setCustomH(e.target.value.replace(/\D/g, '').slice(0, 5))} aria-invalid={!customValid} className="w-full min-w-0 px-2 py-1 rounded-md border-2 border-background-warm bg-background text-xs text-dark focus:border-primary outline-none transition-colors" />
                  </div>
                  <div className="flex flex-wrap gap-1" role="group" aria-label="Quick sizes">
                    {([['Site logo', 893, 663], ['Square', 1200, 1200], ['Wide', 1200, 630], ['Banner', 1500, 500], ['Story', 1080, 1920]] as const).map(([label, w, h]) => (
                      <button
                        key={label}
                        type="button"
                        title={`${w} × ${h}`}
                        onClick={() => { setCustomW(String(w)); setCustomH(String(h)); }}
                        className="px-2 py-0.5 rounded-md border border-background-warm text-2xs font-medium text-dark hover:border-primary/50 transition-colors"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <label htmlFor="logo-zoom" className="w-14 shrink-0 text-xs font-medium text-dark">Zoom</label>
                    <input id="logo-zoom" type="range" min={50} max={300} step={5} value={Math.round(view.zoom * 100)} onChange={e => setView(v => ({ ...v, zoom: Number(e.target.value) / 100 }))} className="flex-1 min-w-0 accent-primary" />
                    <span className="w-9 text-right font-mono text-2xs text-dark-muted">{Math.round(view.zoom * 100)}%</span>
                    <button type="button" onClick={() => setView(DEFAULT_VIEW)} disabled={view.zoom === 1 && view.x === 0 && view.y === 0} title="Reset zoom and position" aria-label="Reset zoom and position" className="inline-flex h-6 w-6 items-center justify-center rounded border border-background-warm text-dark hover:bg-background-warm disabled:opacity-30">
                      <ArrowCounterClockwise size={12} aria-hidden="true" />
                    </button>
                  </div>
                  <p className="text-2xs text-dark-muted">Preview shows the {cw} × {ch} px frame. Drag the logo to position it; zoom in to crop the edges.</p>
                  {!customValid && (
                    <p role="alert" className="text-2xs text-red-600">Each side must be {CUSTOM_MIN} to {CUSTOM_MAX} px, and the whole image no more than {CUSTOM_MAX_PIXELS / 1_000_000} million pixels.</p>
                  )}
                </div>
              )}

              {(format === 'svg' || format === 'pdf') && ld && !ld.vectors && (
                <p className="text-2xs text-dark-muted">
                  No traced vector layers yet, so this {format.toUpperCase()} holds a high-resolution picture
                  (<code className="px-1 rounded bg-background-warm">scripts/trace-logo-layers.mjs</code> makes it true vector).
                </p>
              )}

              {format !== 'jpg' && (
                <label className="flex items-center gap-2 text-xs text-dark cursor-pointer">
                  <input
                    type="checkbox"
                    checked={transparent}
                    onChange={e => setTransparent(e.target.checked)}
                    className="h-4 w-4 accent-primary"
                  />
                  Transparent background
                </label>
              )}
            </section>

            <div className={`${lockHeight ? 'mt-auto' : 'sticky bottom-0'} -mx-4 sm:mx-0 px-4 sm:px-0 py-2 bg-white/95 backdrop-blur border-t border-background-warm sm:border-0 sm:bg-transparent`}>
              <button
                type="button"
                onClick={handleDownload}
                disabled={!ld || (isCustom && !customValid)}
                className="inline-flex w-full items-center justify-center gap-2 px-4 py-2 min-h-[40px] rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-60"
              >
                <DownloadSimple size={16} aria-hidden="true" />
                Download logo
              </button>
            </div>
          </div>
        </div>
        </div>

        <div role="tabpanel" hidden={tab !== 'site'}>
          <LogoStudioSiteLogos makeLogoFile={makeLogoFile} onDirtyChange={handleSiteDirty} />
        </div>

        <div role="tabpanel" hidden={tab !== 'mail'} className={lockHeight ? 'flex-1 min-h-0' : ''}>
          <LogoStudioMailEditor onDirtyChange={handleMailDirty} fit={lockHeight && tab === 'mail'} />
        </div>
      </div>
    </AdminLayout>
  );
}
