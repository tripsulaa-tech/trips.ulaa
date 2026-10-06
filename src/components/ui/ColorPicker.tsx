import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check } from '@phosphor-icons/react';
import { useCloseOnOutsideClick } from '../../hooks/useCloseOnOutsideClick';
import { useDropdownPosition } from '../../hooks/useDropdownPosition';

// App-themed colour picker (replaces the browser's native <input type="color">).
// A swatch button opens a popover with a saturation/brightness area, a hue
// slider, a hex box and the app's own theme colours as one-tap swatches.

export interface ColorSwatch { name: string; hex: string }

const THEME_SWATCHES: { name: string; hex: string }[] = [
  { name: 'Primary', hex: '#a85a2a' },
  { name: 'Primary light', hex: '#c4703a' },
  { name: 'Primary dark', hex: '#8b4820' },
  { name: 'Secondary', hex: '#d98a3a' },
  { name: 'Secondary dark', hex: '#b87531' },
  { name: 'Gold', hex: '#c8962a' },
  { name: 'Dark', hex: '#2d2118' },
  { name: 'Dark muted', hex: '#4a3728' },
  { name: 'Background', hex: '#f8f4ec' },
  { name: 'Background warm', hex: '#f2ebe0' },
  { name: 'Cream', hex: '#faf7f2' },
  { name: 'White', hex: '#ffffff' },
];

const PANEL_WIDTH = 232;
const PANEL_HEIGHT = 330;

interface Hsv { h: number; s: number; v: number }

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map(c => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

function hexToHsv(hex: string): Hsv {
  const [r, g, b] = hexToRgb(hex).map(c => c / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

function hsvToHex({ h, s, v }: Hsv) {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return rgbToHex(f(5) * 255, f(3) * 255, f(1) * 255);
}

const isDarkHex = (hex: string) => {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
};

const isHex = (s: string) => /^#[0-9a-f]{6}$/i.test(s);

interface ColorPickerProps {
  /** One-tap colours shown in the popover; the app's theme colours when omitted. */
  swatches?: ColorSwatch[];
  swatchesLabel?: string;
  value: string;
  onChange: (hex: string) => void;
  label: string;
  /** Size classes for the swatch button (default h-8 w-8). */
  sizeClass?: string;
}

export default function ColorPicker({ value, onChange, label, swatches = THEME_SWATCHES, swatchesLabel = 'Theme colours', sizeClass = 'h-8 w-8' }: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const coords = useDropdownPosition(triggerRef, open, PANEL_HEIGHT, PANEL_WIDTH);

  // Hue/saturation are kept so dragging through grey or black doesn't lose them.
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
  const [hexText, setHexText] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setHexText(value);
    if (hsvToHex(hsv) !== value) setHsv(hexToHsv(value));
  }

  useCloseOnOutsideClick(open, [triggerRef, panelRef], () => setOpen(false), { escape: true });

  const apply = (next: Hsv) => {
    const clean = { h: clamp(next.h, 0, 359.99), s: clamp(next.s, 0, 1), v: clamp(next.v, 0, 1) };
    setHsv(clean);
    const hex = hsvToHex(clean);
    setSeen(hex);
    setHexText(hex);
    if (hex !== value) onChange(hex);
  };

  const pickArea = (e: PointerEvent<HTMLDivElement>) => {
    const r = areaRef.current?.getBoundingClientRect();
    if (!r) return;
    apply({ ...hsv, s: (e.clientX - r.left) / r.width, v: 1 - (e.clientY - r.top) / r.height });
  };
  const pickHue = (e: PointerEvent<HTMLDivElement>) => {
    const r = hueRef.current?.getBoundingClientRect();
    if (!r) return;
    apply({ ...hsv, h: ((e.clientX - r.left) / r.width) * 360 });
  };
  const downArea = (e: PointerEvent<HTMLDivElement>) => { e.currentTarget.setPointerCapture(e.pointerId); pickArea(e); };
  const moveArea = (e: PointerEvent<HTMLDivElement>) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) pickArea(e); };
  const downHue = (e: PointerEvent<HTMLDivElement>) => { e.currentTarget.setPointerCapture(e.pointerId); pickHue(e); };
  const moveHue = (e: PointerEvent<HTMLDivElement>) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) pickHue(e); };

  const areaKeys = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    const moves: Record<string, Partial<Hsv>> = {
      ArrowLeft: { s: hsv.s - step }, ArrowRight: { s: hsv.s + step }, ArrowUp: { v: hsv.v + step }, ArrowDown: { v: hsv.v - step },
    };
    if (!moves[e.key]) return;
    e.preventDefault();
    apply({ ...hsv, ...moves[e.key] });
  };
  const hueKeys = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 20 : 4;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    apply({ ...hsv, h: hsv.h + (e.key === 'ArrowRight' ? step : -step) });
  };

  const commitHex = (text: string) => {
    const t = (text.startsWith('#') ? text : `#${text}`).toLowerCase();
    if (!isHex(t)) { setHexText(value); return; }
    setSeen(t);
    setHexText(t);
    setHsv(hexToHsv(t));
    if (t !== value) onChange(t);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={`${label} colour, ${value.toUpperCase()}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{ backgroundColor: value }}
        className={`${sizeClass} shrink-0 rounded-md border-2 outline-none transition-colors ${open ? 'border-primary' : 'border-background-warm hover:border-primary/50'}`}
      />

      {open && createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label={`${label} colour picker`}
          style={{
            position: 'fixed',
            top: coords.openUp ? undefined : coords.top + 4,
            bottom: coords.openUp ? window.innerHeight - coords.top + 4 : undefined,
            left: coords.left,
            width: PANEL_WIDTH,
          }}
          className="z-[100] rounded-lg border-2 border-background-warm bg-white shadow-warm-lg p-3 space-y-3"
        >
          <div
            ref={areaRef}
            role="slider"
            tabIndex={0}
            aria-label="Saturation and brightness"
            aria-valuetext={`Saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`}
            aria-valuenow={Math.round(hsv.s * 100)}
            onKeyDown={areaKeys}
            onPointerDown={downArea}
            onPointerMove={moveArea}
            style={{ backgroundColor: hsvToHex({ h: hsv.h, s: 1, v: 1 }), touchAction: 'none' }}
            className="relative h-32 w-full cursor-crosshair rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <div className="absolute inset-0 rounded-md bg-gradient-to-r from-white to-transparent" />
            <div className="absolute inset-0 rounded-md bg-gradient-to-t from-black to-transparent" />
            <span
              className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-card"
              style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, backgroundColor: value }}
            />
          </div>

          <div
            ref={hueRef}
            role="slider"
            tabIndex={0}
            aria-label="Hue"
            aria-valuemin={0}
            aria-valuemax={359}
            aria-valuenow={Math.round(hsv.h)}
            onKeyDown={hueKeys}
            onPointerDown={downHue}
            onPointerMove={moveHue}
            style={{
              touchAction: 'none',
              background: 'linear-gradient(to right,#f00 0%,#ff0 17%,#0f0 33%,#0ff 50%,#00f 67%,#f0f 83%,#f00 100%)',
            }}
            className="relative h-3 w-full cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span
              className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-card"
              style={{ left: `${(hsv.h / 360) * 100}%`, backgroundColor: hsvToHex({ h: hsv.h, s: 1, v: 1 }) }}
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="h-8 w-8 shrink-0 rounded-md border-2 border-background-warm" style={{ backgroundColor: value }} aria-hidden="true" />
            <input
              value={hexText}
              onChange={e => setHexText(e.target.value.replace(/[^#0-9a-f]/gi, '').slice(0, 7))}
              onBlur={e => commitHex(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commitHex(e.currentTarget.value); }}
              aria-label="Hex colour code"
              spellCheck={false}
              className="w-full px-3 py-1.5 rounded-md border-2 border-background-warm bg-background font-mono text-xs uppercase text-dark focus:border-primary outline-none transition-colors"
            />
          </div>

          <div>
            <p className="text-2xs font-medium text-dark-muted mb-1.5">{swatchesLabel}</p>
            <div className="flex flex-wrap gap-1.5">
              {swatches.map(sw => (
                <button
                  key={sw.hex}
                  type="button"
                  onClick={() => apply(hexToHsv(sw.hex))}
                  title={sw.name}
                  aria-label={`${sw.name} ${sw.hex.toUpperCase()}`}
                  style={{ backgroundColor: sw.hex }}
                  className="relative flex h-7 w-7 items-center justify-center rounded border border-dark/15 outline-none hover:scale-110 focus-visible:ring-2 focus-visible:ring-primary transition-transform"
                >
                  {value === sw.hex && <Check size={12} weight="bold" className={isDarkHex(sw.hex) ? 'text-white' : 'text-dark'} aria-hidden="true" />}
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
