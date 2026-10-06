import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { DownloadSimple, ArrowCounterClockwise, Warning } from '@phosphor-icons/react';
import AdminLayout from './AdminLayout';
import AdminEditorFooter from './AdminEditorFooter';
import { getSiteContent, upsertSiteContent } from '../services/api';

// Admin → Logo Studio: recolour the Ulaa logo and download it as a PNG/JPG.
//
// The logo is built from transparent single-colour layers (public/logo-layers/*.png,
// all the same 1254×1254 canvas so they stack exactly). Each layer is tinted with
// the chosen colour using only its alpha channel, then the layers are composited
// over the background colour. The chosen colours are saved in the `site_content`
// table under LOGO_COLORS_KEY so every admin sees (and downloads) the same palette.

const LOGO_COLORS_KEY = 'logo_colors';

type LogoColorKey = 'background' | 'sun' | 'lettering' | 'landscape' | 'tamil';
type LogoColors = Record<LogoColorKey, string>;

const DEFAULT_COLORS: LogoColors = {
  background: '#f6f2ea',
  sun: '#fe480a',
  lettering: '#2d2118',
  landscape: '#72573e',
  tamil: '#2d2118',
};

interface LayerDef {
  key: Exclude<LogoColorKey, 'background'>;
  src: string;
}

// Drawing order, bottom to top.
const LAYERS: LayerDef[] = [
  { key: 'sun', src: '/logo-layers/sun.png' },
  { key: 'lettering', src: '/logo-layers/lettering.png' },
  { key: 'landscape', src: '/logo-layers/landscape.png' },
  { key: 'tamil', src: '/logo-layers/tamil.png' },
];

const COLOR_FIELDS: { key: LogoColorKey; label: string; hint: string }[] = [
  { key: 'background', label: 'Background', hint: 'Behind the whole logo' },
  { key: 'sun', label: 'Sun & divider', hint: 'Sun arc, dots and the line under the tagline' },
  { key: 'lettering', label: 'ULAA lettering', hint: 'ULAA letters, birds and the tagline' },
  { key: 'landscape', label: 'Palm, waves & mountains', hint: 'The landscape across the bottom' },
  { key: 'tamil', label: 'Tamil text', hint: 'உலா at the bottom' },
];

interface Preset {
  name: string;
  colors: LogoColors;
}

const PRESETS: Preset[] = [
  { name: 'Default', colors: DEFAULT_COLORS },
  {
    name: 'On dark',
    colors: { background: '#2d2118', sun: '#fe480a', lettering: '#f6f2ea', landscape: '#a98a66', tamil: '#f6f2ea' },
  },
  {
    name: 'One colour, dark',
    colors: { background: '#f6f2ea', sun: '#2d2118', lettering: '#2d2118', landscape: '#2d2118', tamil: '#2d2118' },
  },
  {
    name: 'One colour, white',
    colors: { background: '#2d2118', sun: '#ffffff', lettering: '#ffffff', landscape: '#ffffff', tamil: '#ffffff' },
  },
];

const SIZES = [
  { value: 400, label: 'Small · 400 px' },
  { value: 800, label: 'Medium · 800 px' },
  { value: 1254, label: 'Full · 1254 px' },
];

const PREVIEW_SIZE = 800;
const HEX_RE = /^#[0-9a-f]{6}$/i;

const CHECKER =
  'bg-[length:16px_16px] bg-[linear-gradient(45deg,#e9e4dc_25%,transparent_25%,transparent_75%,#e9e4dc_75%),linear-gradient(45deg,#e9e4dc_25%,#fff_25%,#fff_75%,#e9e4dc_75%)] [background-position:0_0,8px_8px]';

const INPUT_CLASS =
  'rounded-md border-2 border-background-warm bg-white text-sm text-dark min-h-[40px] px-3 py-2 focus-visible:outline-none focus-visible:border-primary';

function normalizeColors(data: unknown): LogoColors {
  const out: LogoColors = { ...DEFAULT_COLORS };
  if (data && typeof data === 'object') {
    (Object.keys(DEFAULT_COLORS) as LogoColorKey[]).forEach(key => {
      const v = (data as Record<string, unknown>)[key];
      if (typeof v === 'string' && HEX_RE.test(v.trim())) out[key] = v.trim().toLowerCase();
    });
  }
  return out;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

/** Paints the logo onto `canvas` at `size`×`size` px. Each layer is tinted by
 *  drawing it, then filling the colour with `source-in` so only the layer's
 *  own opaque pixels keep the colour. */
function renderLogo(
  canvas: HTMLCanvasElement,
  images: Record<string, HTMLImageElement>,
  colors: LogoColors,
  size: number,
  withBackground: boolean,
) {
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, size, size);
  if (withBackground) {
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, size, size);
  }

  const tint = document.createElement('canvas');
  tint.width = size;
  tint.height = size;
  const t = tint.getContext('2d');
  if (!t) return;
  t.imageSmoothingQuality = 'high';
  ctx.imageSmoothingQuality = 'high';

  for (const layer of LAYERS) {
    const img = images[layer.key];
    if (!img) continue;
    t.globalCompositeOperation = 'source-over';
    t.clearRect(0, 0, size, size);
    t.drawImage(img, 0, 0, size, size);
    t.globalCompositeOperation = 'source-in';
    t.fillStyle = colors[layer.key];
    t.fillRect(0, 0, size, size);
    ctx.drawImage(tint, 0, 0);
  }
}

function ColorRow({
  label,
  hint,
  value,
  defaultValue,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  defaultValue: string;
  onChange: (hex: string) => void;
}) {
  const id = useId();
  // While the admin is typing, show their raw text; otherwise mirror the real value.
  const [typing, setTyping] = useState<string | null>(null);
  const text = typing ?? value;

  const handleText = (raw: string) => {
    setTyping(raw);
    const withHash = raw.trim().startsWith('#') ? raw.trim() : `#${raw.trim()}`;
    if (HEX_RE.test(withHash)) onChange(withHash.toLowerCase());
  };

  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        id={`${id}-picker`}
        value={value}
        onChange={e => {
          setTyping(null);
          onChange(e.target.value.toLowerCase());
        }}
        aria-label={`${label} colour picker`}
        className="h-10 w-12 shrink-0 cursor-pointer rounded-md border-2 border-background-warm bg-white p-0.5"
      />
      <div className="min-w-0 flex-1">
        <label htmlFor={`${id}-hex`} className="block text-sm font-medium text-dark">
          {label}
        </label>
        <p className="text-2xs text-dark-muted leading-snug">{hint}</p>
      </div>
      <input
        id={`${id}-hex`}
        type="text"
        inputMode="text"
        spellCheck={false}
        maxLength={7}
        value={text}
        onChange={e => handleText(e.target.value)}
        onBlur={() => setTyping(null)}
        className={`${INPUT_CLASS} w-[92px] shrink-0 font-mono uppercase`}
      />
      <button
        type="button"
        onClick={() => {
          setTyping(null);
          onChange(defaultValue);
        }}
        disabled={value === defaultValue}
        aria-label={`Reset ${label} to default`}
        title="Reset to default"
        className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-md border-2 border-background-warm text-dark hover:bg-background-warm transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <ArrowCounterClockwise size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

export default function AdminLogoStudio() {
  const [draft, setDraft] = useState<LogoColors>({ ...DEFAULT_COLORS });
  const savedRef = useRef<LogoColors>({ ...DEFAULT_COLORS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [images, setImages] = useState<Record<string, HTMLImageElement> | null>(null);
  const [imageError, setImageError] = useState(false);

  const [format, setFormat] = useState<'png' | 'jpg'>('png');
  const [transparent, setTransparent] = useState(false);
  const [size, setSize] = useState<number>(1254);

  const previewRef = useRef<HTMLCanvasElement>(null);
  const transparentId = useId();
  const formatId = useId();
  const sizeId = useId();

  // JPG can't hold transparency, so it always includes the background.
  const withBackground = format === 'jpg' || !transparent;

  useEffect(() => {
    getSiteContent<unknown>(LOGO_COLORS_KEY)
      .then(data => {
        const loaded = normalizeColors(data);
        savedRef.current = loaded;
        setDraft(loaded);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all(LAYERS.map(l => loadImage(l.src)))
      .then(loaded => {
        if (cancelled) return;
        setImages(Object.fromEntries(LAYERS.map((l, i) => [l.key, loaded[i]])));
      })
      .catch(() => {
        if (!cancelled) setImageError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Repaint the preview whenever a colour or the background option changes.
  useEffect(() => {
    if (!images || !previewRef.current) return;
    renderLogo(previewRef.current, images, draft, PREVIEW_SIZE, withBackground);
  }, [images, draft, withBackground, loading]);

  const hasUnsavedChanges = useCallback(
    () => JSON.stringify(draft) !== JSON.stringify(savedRef.current),
    [draft],
  );

  const setColor = (key: LogoColorKey, hex: string) => {
    setSaved(false);
    setDraft(d => (d[key] === hex ? d : { ...d, [key]: hex }));
  };

  const applyColors = (colors: LogoColors) => {
    setSaved(false);
    setDraft({ ...colors });
  };

  const isDefault = useMemo(() => JSON.stringify(draft) === JSON.stringify(DEFAULT_COLORS), [draft]);

  const handleSave = async () => {
    try {
      setSaving(true);
      await upsertSiteContent(LOGO_COLORS_KEY, draft);
      savedRef.current = { ...draft };
      setSaved(true);
      window.setTimeout(() => setSaved(false), 3000);
    } catch {
      alert('Failed to save the logo colours. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    if (hasUnsavedChanges() && !window.confirm('Discard your unsaved colour changes?')) return;
    setDraft({ ...savedRef.current });
    setSaved(false);
  };

  const handleDownload = () => {
    if (!images) return;
    const canvas = document.createElement('canvas');
    renderLogo(canvas, images, draft, size, withBackground);
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
        a.download = `ulaa-logo-${size}${format === 'png' && transparent ? '-transparent' : ''}.${format}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      mime,
      0.95,
    );
  };

  if (loading) {
    return (
      <AdminLayout title="Logo Studio">
        <div role="status" className="text-center py-16 text-dark-muted">Loading…</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Logo Studio"
      subtitle="Change the logo colours and download it"
      hasUnsavedChanges={hasUnsavedChanges}
    >
      <div className="bg-white rounded-md border border-background-warm shadow-card">
        <div className="p-4 sm:p-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)] items-start">
          {/* Preview */}
          <section aria-label="Logo preview" className="space-y-2">
            <div
              className={`rounded-md border border-background-warm overflow-hidden ${
                withBackground ? '' : CHECKER
              }`}
            >
              {imageError ? (
                <div role="alert" className="flex items-start gap-3 p-6 text-sm text-dark-muted">
                  <Warning size={18} className="shrink-0 mt-0.5 text-primary" aria-hidden="true" />
                  <p>
                    The logo layer images could not be loaded. Make sure the files in
                    <code className="mx-1 px-1 rounded bg-background-warm">public/logo-layers</code>
                    are deployed with the site.
                  </p>
                </div>
              ) : (
                <canvas
                  ref={previewRef}
                  role="img"
                  aria-label="Ulaa logo preview with the chosen colours"
                  className="block w-full h-auto aspect-square"
                />
              )}
            </div>
            <p className="text-2xs text-dark-muted">
              The preview updates as you change colours. Colours are only stored for everyone once you press Save
              Changes; downloads always use what you see here.
            </p>
          </section>

          {/* Controls */}
          <div className="space-y-8">
            <section className="space-y-4" aria-labelledby="logo-colours-heading">
              <div className="flex items-end justify-between gap-3 pb-3 border-b border-background-warm">
                <div>
                  <h2 id="logo-colours-heading" className="font-display text-lg font-bold text-dark">Colours</h2>
                  <p className="text-xs text-dark-muted mt-0.5">Pick a colour or type a hex code.</p>
                </div>
                <button
                  type="button"
                  onClick={() => applyColors(DEFAULT_COLORS)}
                  disabled={isDefault}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-md border-2 border-background-warm text-dark text-sm font-medium hover:bg-background-warm transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <ArrowCounterClockwise size={14} aria-hidden="true" />
                  Reset all
                </button>
              </div>

              <div className="space-y-3">
                {COLOR_FIELDS.map(f => (
                  <ColorRow
                    key={f.key}
                    label={f.label}
                    hint={f.hint}
                    value={draft[f.key]}
                    defaultValue={DEFAULT_COLORS[f.key]}
                    onChange={hex => setColor(f.key, hex)}
                  />
                ))}
              </div>

              <div>
                <p className="text-xs font-medium text-dark mb-2">Quick looks</p>
                <div className="flex flex-wrap gap-2">
                  {PRESETS.map(p => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => applyColors(p.colors)}
                      className="inline-flex items-center gap-2 px-3 py-2 min-h-[40px] rounded-md border-2 border-background-warm text-dark text-sm hover:bg-background-warm transition-colors"
                    >
                      <span
                        aria-hidden="true"
                        className="inline-block h-4 w-4 rounded-full border border-black/10"
                        style={{
                          background: `linear-gradient(135deg, ${p.colors.background} 50%, ${p.colors.sun} 50%)`,
                        }}
                      />
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="space-y-4" aria-labelledby="logo-download-heading">
              <div className="pb-3 border-b border-background-warm">
                <h2 id="logo-download-heading" className="font-display text-lg font-bold text-dark">Download</h2>
                <p className="text-xs text-dark-muted mt-0.5">Saves the logo exactly as shown in the preview.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor={formatId} className="block text-xs font-medium text-dark mb-1">Format</label>
                  <select
                    id={formatId}
                    value={format}
                    onChange={e => setFormat(e.target.value as 'png' | 'jpg')}
                    className={`${INPUT_CLASS} w-full`}
                  >
                    <option value="png">PNG</option>
                    <option value="jpg">JPG</option>
                  </select>
                </div>
                <div>
                  <label htmlFor={sizeId} className="block text-xs font-medium text-dark mb-1">Size</label>
                  <select
                    id={sizeId}
                    value={size}
                    onChange={e => setSize(Number(e.target.value))}
                    className={`${INPUT_CLASS} w-full`}
                  >
                    {SIZES.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <input
                  id={transparentId}
                  type="checkbox"
                  checked={format === 'png' && transparent}
                  disabled={format === 'jpg'}
                  onChange={e => setTransparent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <label htmlFor={transparentId} className="text-sm text-dark">
                  Transparent background
                  <span className="block text-2xs text-dark-muted">
                    {format === 'jpg' ? 'JPG cannot be transparent — choose PNG to turn this on.' : 'PNG only. The background colour is left out.'}
                  </span>
                </label>
              </div>

              <button
                type="button"
                onClick={handleDownload}
                disabled={!images}
                className="inline-flex w-full items-center justify-center gap-2 px-4 py-2 min-h-[44px] rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-60"
              >
                <DownloadSimple size={16} aria-hidden="true" />
                Download logo
              </button>
              <p className="text-2xs text-dark-muted">
                The logo artwork is 1254 px wide, so “Full” is the sharpest download available.
              </p>
            </section>
          </div>
        </div>

        <AdminEditorFooter
          onSave={handleSave}
          saving={saving}
          saved={saved}
          onSecondaryAction={handleDiscard}
          secondaryLabel="Discard Changes"
          secondaryLabelMobile="Discard"
        />
      </div>
    </AdminLayout>
  );
}
