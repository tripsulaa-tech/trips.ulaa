import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { DownloadSimple, ArrowCounterClockwise, Warning } from '@phosphor-icons/react';
import AdminLayout from './AdminLayout';
import Select from '../components/ui/Select';

// Admin → Logo Studio: pick a ready-made logo, tweak its colours and download it.
//
// Each logo is built from transparent single-colour layers (public/logo-layers/*.png,
// all the same size within one artwork so they stack exactly). Each layer is tinted
// with the chosen colour using only its alpha channel, then the layers are composited
// over the background colour. Nothing is stored: every visit starts from a pre-design.

type LogoColorKey = 'background' | 'sun' | 'lettering' | 'landscape' | 'tamil';
type LogoColors = Record<LogoColorKey, string>;
type DesignId = 'classic' | 'header';
type MarginId = 'none' | 'small' | 'medium' | 'large';

interface LayerDef {
  key: Exclude<LogoColorKey, 'background'>;
  src: string;
}

interface DesignDef {
  id: DesignId;
  /** Drawing order, bottom to top. All layers of a design share one canvas size. */
  layers: LayerDef[];
}

const DESIGNS: DesignDef[] = [
  {
    id: 'classic',
    layers: [
      { key: 'sun', src: '/logo-layers/sun.png' },
      { key: 'lettering', src: '/logo-layers/lettering.png' },
      { key: 'landscape', src: '/logo-layers/landscape.png' },
      { key: 'tamil', src: '/logo-layers/tamil.png' },
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
];

const ALL_LAYER_SRCS = Array.from(new Set(DESIGNS.flatMap(d => d.layers.map(l => l.src))));

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
  thumb: string;
  /** Background of the thumbnail tile, so light logos stay visible. */
  tile: string;
  design: DesignId;
  colors: LogoColors;
}

const PREDESIGNS: PreDesign[] = [
  {
    id: 'header',
    name: 'Header',
    thumb: '/logo-presets/header.png',
    tile: '#f6f2ea',
    design: 'header',
    colors: { background: '#f6f2ea', sun: '#fe480a', lettering: '#2d2118', landscape: '#2d2118', tamil: '#2d2118' },
  },
  {
    id: 'invoice',
    name: 'Invoice',
    thumb: '/logo-presets/invoice.png',
    tile: '#ffffff',
    design: 'classic',
    colors: { background: '#ffffff', sun: '#ef4d25', lettering: '#2d221d', landscape: '#2d221d', tamil: '#2d221d' },
  },
  {
    id: 'footer',
    name: 'Footer',
    thumb: '/logo-presets/footer.png',
    tile: '#2d2118',
    design: 'classic',
    colors: { background: '#2d2118', sun: '#fe480a', lettering: '#f6f2ea', landscape: '#72573e', tamil: '#f6f2ea' },
  },
];

// Margin = empty space kept around the logo on every side, as a % of the logo's longest side.
const MARGINS: { value: MarginId; label: string; pct: number }[] = [
  { value: 'none', label: 'None', pct: 0 },
  { value: 'small', label: 'S', pct: 4 },
  { value: 'medium', label: 'M', pct: 8 },
  { value: 'large', label: 'L', pct: 15 },
];

const FORMAT_OPTIONS: { value: 'png' | 'jpg'; label: string }[] = [
  { value: 'png', label: 'PNG' },
  { value: 'jpg', label: 'JPG' },
];

const SIZES = [
  { value: 400, label: 'Small · 400 px' },
  { value: 800, label: 'Medium · 800 px' },
  { value: 1254, label: 'Full · 1254 px' },
];

const PREVIEW_SIZE = 800;

const CHECKER =
  'bg-[length:16px_16px] bg-[linear-gradient(45deg,#e9e4dc_25%,transparent_25%,transparent_75%,#e9e4dc_75%),linear-gradient(45deg,#e9e4dc_25%,#fff_25%,#fff_75%,#e9e4dc_75%)] [background-position:0_0,8px_8px]';

function sameColors(a: LogoColors, b: LogoColors) {
  return (Object.keys(a) as LogoColorKey[]).every(k => a[k] === b[k]);
}

interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The smallest rectangle (in layer pixels) that contains every visible pixel of the design. */
function computeBounds(images: Record<string, HTMLImageElement>, design: DesignDef): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  let full: Bounds | null = null;
  const scratch = document.createElement('canvas');
  for (const layer of design.layers) {
    const img = images[layer.src];
    if (!img) return null;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    full = { x: 0, y: 0, w, h };
    scratch.width = w;
    scratch.height = h;
    const c = scratch.getContext('2d', { willReadFrequently: true });
    if (!c) return full;
    c.clearRect(0, 0, w, h);
    c.drawImage(img, 0, 0);
    let data: Uint8ClampedArray;
    try {
      data = c.getImageData(0, 0, w, h).data;
    } catch {
      return full;
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > 12) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
  }
  if (maxX < 0) return full;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

/** Paints the logo onto `canvas`. The logo is cropped to its artwork `bounds`,
 *  `marginPct` % of its longest side is added around it, and the result is scaled
 *  so its longest side is `longSide` px. Each layer is tinted by drawing it, then
 *  filling the colour with `source-in` so only the layer's own opaque pixels keep
 *  the colour. */
function renderLogo(
  canvas: HTMLCanvasElement,
  images: Record<string, HTMLImageElement>,
  design: DesignDef,
  colors: LogoColors,
  longSide: number,
  withBackground: boolean,
  bounds: Bounds,
  marginPct: number,
) {
  const margin = (marginPct / 100) * Math.max(bounds.w, bounds.h);
  const totalW = bounds.w + margin * 2;
  const totalH = bounds.h + margin * 2;
  const scale = longSide / Math.max(totalW, totalH);
  const width = Math.max(1, Math.round(totalW * scale));
  const height = Math.max(1, Math.round(totalH * scale));

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

  const dx = margin * scale;
  const dy = margin * scale;
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


export default function AdminLogoStudio() {
  const [preId, setPreId] = useState<string>(PREDESIGNS[0].id);
  const [colors, setColors] = useState<LogoColors>({ ...PREDESIGNS[0].colors });
  const [margin, setMargin] = useState<MarginId>('medium');
  const [format, setFormat] = useState<'png' | 'jpg'>('png');
  const [size, setSize] = useState<number>(1254);
  const [transparent, setTransparent] = useState(false);

  const [images, setImages] = useState<Record<string, HTMLImageElement> | null>(null);
  const [imageError, setImageError] = useState(false);

  const previewRef = useRef<HTMLCanvasElement>(null);
  const formatId = useId();
  const sizeId = useId();

  const pre = PREDESIGNS.find(p => p.id === preId) ?? PREDESIGNS[0];
  const design = DESIGNS.find(d => d.id === pre.design) ?? DESIGNS[0];
  const marginPct = MARGINS.find(m => m.value === margin)?.pct ?? 0;
  const bounds = useMemo(() => (images ? computeBounds(images, design) : null), [images, design]);
  const colorFields = COLOR_FIELDS.filter(f => !(f.key === 'tamil' && design.id === 'header'));
  const colorsChanged = !sameColors(colors, pre.colors);

  // JPG can't hold transparency, so it always includes the background.
  const withBackground = format === 'jpg' || !transparent;

  useEffect(() => {
    let cancelled = false;
    Promise.all(ALL_LAYER_SRCS.map(src => loadImage(src)))
      .then(loaded => {
        if (cancelled) return;
        setImages(Object.fromEntries(ALL_LAYER_SRCS.map((src, i) => [src, loaded[i]])));
      })
      .catch(() => {
        if (!cancelled) setImageError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Repaint the preview whenever the logo, a colour, the margin or the background option changes.
  useEffect(() => {
    if (!images || !bounds || !previewRef.current) return;
    renderLogo(previewRef.current, images, design, colors, PREVIEW_SIZE, withBackground, bounds, marginPct);
  }, [images, bounds, design, colors, withBackground, marginPct]);

  const choosePre = (p: PreDesign) => {
    setPreId(p.id);
    setColors({ ...p.colors });
  };

  const handleDownload = () => {
    if (!images || !bounds) return;
    const canvas = document.createElement('canvas');
    renderLogo(canvas, images, design, colors, size, withBackground, bounds, marginPct);
    const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
    canvas.toBlob(
      blob => {
        if (!blob) {
          alert('Could not create the image. Please try again.');
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ulaa-logo-${pre.id}-${size}${format === 'png' && transparent ? '-transparent' : ''}.${format}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      mime,
      0.95,
    );
  };

  return (
    <AdminLayout title="Logo Studio" subtitle="Pick a logo, adjust the colours and download it">
      <div className="bg-white rounded-md border border-background-warm shadow-card">
        <div className="p-4 sm:p-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] items-start">
          {/* Preview */}
          <section aria-label="Logo preview">
            <div
              className={`rounded-md border border-background-warm overflow-hidden ${
                withBackground ? '' : CHECKER
              }`}
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
                  className="block w-full h-auto"
                />
              )}
            </div>
          </section>

          {/* Controls */}
          <div className="space-y-6">
            <section aria-label="Logo">
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {PREDESIGNS.map(p => {
                  const active = p.id === preId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => choosePre(p)}
                      aria-pressed={active}
                      className={`rounded-md border-2 p-1.5 text-center transition-colors ${
                        active ? 'border-primary bg-primary/5' : 'border-background-warm hover:border-primary/50'
                      }`}
                    >
                      <span
                        className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded border border-black/5 p-2"
                        style={{ backgroundColor: p.tile }}
                      >
                        <img src={p.thumb} alt="" loading="lazy" className="max-h-full max-w-full object-contain" />
                      </span>
                      <span className="mt-1.5 block text-xs font-semibold text-dark">{p.name}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section aria-labelledby="logo-colours-heading" className="space-y-3">
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
              <div className="grid grid-cols-2 gap-2">
                {colorFields.map(f => (
                  <label
                    key={f.key}
                    className="flex items-center gap-2.5 rounded-md border-2 border-background-warm px-2 py-1.5 cursor-pointer hover:border-primary/50 transition-colors focus-within:border-primary"
                  >
                    <input
                      type="color"
                      value={colors[f.key]}
                      onChange={e => {
                        const hex = e.target.value.toLowerCase();
                        setColors(c => (c[f.key] === hex ? c : { ...c, [f.key]: hex }));
                      }}
                      aria-label={`${f.label} colour`}
                      className="h-8 w-8 shrink-0 cursor-pointer rounded border border-black/10 bg-transparent p-0"
                    />
                    <span className="text-xs font-medium text-dark leading-tight">{f.label}</span>
                  </label>
                ))}
              </div>
            </section>

            <section aria-labelledby="logo-download-heading" className="space-y-4">
              <h2 id="logo-download-heading" className="text-sm font-semibold text-dark">Download</h2>

              <div>
                <p id="logo-margin-label" className="block text-xs font-medium text-dark mb-1">Margin gap</p>
                <div role="group" aria-labelledby="logo-margin-label" className="grid grid-cols-4 gap-2">
                  {MARGINS.map(m => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setMargin(m.value)}
                      aria-pressed={margin === m.value}
                      className={`min-h-[40px] rounded-md border-2 text-sm font-medium transition-colors ${
                        margin === m.value
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-background-warm text-dark hover:border-primary/50'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor={formatId} className="block text-xs font-medium text-dark mb-1">Format</label>
                  <Select<'png' | 'jpg'> inputId={formatId} value={format} onChange={setFormat} options={FORMAT_OPTIONS} />
                </div>
                <div>
                  <label htmlFor={sizeId} className="block text-xs font-medium text-dark mb-1">Size</label>
                  <Select<number> inputId={sizeId} value={size} onChange={setSize} options={SIZES} />
                </div>
              </div>

              {format === 'png' && (
                <label className="flex items-center gap-2 text-sm text-dark cursor-pointer">
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

            <div className="sticky bottom-0 -mx-4 sm:mx-0 px-4 sm:px-0 py-3 bg-white/95 backdrop-blur border-t border-background-warm sm:border-0 sm:bg-transparent">
              <button
                type="button"
                onClick={handleDownload}
                disabled={!images || !bounds}
                className="inline-flex w-full items-center justify-center gap-2 px-4 py-2 min-h-[44px] rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-60"
              >
                <DownloadSimple size={16} aria-hidden="true" />
                Download logo
              </button>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
