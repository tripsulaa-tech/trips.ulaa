import { useRef, useState } from 'react';
import {
  ArrowsOutCardinal as Move,
  ArrowCounterClockwise as RotateCcw,
  MagnifyingGlassPlus as ZoomIn,
} from '@phosphor-icons/react';
import type { CoverImageCrop } from '../../types/types-index';
import { getCoverImageStyle } from '../../utils/utils-index';

interface CoverImageCropEditorProps {
  imageUrl: string;
  /** null/undefined means "no crop saved yet" — falls back to centered, no zoom. */
  value: CoverImageCrop | null | undefined;
  onChange: (crop: CoverImageCrop) => void;
}

const DEFAULT_CROP: CoverImageCrop = { x: 50, y: 50, zoom: 1 };
const MIN_ZOOM = 1;
const MAX_ZOOM = 2.5;

// Where each layout is used across the site, kept here so the preview
// labels stay meaningful if the ratios below ever need tweaking to match
// a future redesign.
//
// Mobile Hero is intentionally NOT listed here — it now uses its own
// separately-uploaded image (see the "Hero Banner Image (Mobile)" field
// in AdminTrips.tsx, hero_mobile_image in types-index.ts) instead of a
// crop of this cover image, so previewing it here would be misleading.
const PREVIEW_LAYOUTS: { label: string; sub: string; ratio: string; width: number }[] = [
  { label: 'Trip Card', sub: 'Home & Trips listing', ratio: '4 / 3', width: 128 },
  // Width bumped up so its rendered height (128 * 9/21 ≈ 55px) instead
  // matches Trip Card's height (128 * 3/4 = 96px) — same height, wider box,
  // instead of both boxes sharing a width and the 21:9 one looking squashed.
  { label: 'Desktop Cover', sub: 'Trip page hero banner', ratio: '21 / 9', width: 224 },
];

/**
 * Cover Image Editor for Admin → Add/Edit Trip → Media.
 *
 * Lets the admin drag to reposition and zoom a single cover image, then
 * shows live previews of that same composition across the places it
 * actually renders on the site (Trip Card, Desktop Hero). The Mobile Hero
 * banner is uploaded separately (see hero_mobile_image) and isn't part of
 * this crop. Rather than generating separate cropped images per layout,
 * this only saves a focal point (x/y %) + zoom — see CoverImageCrop in
 * types-index.ts — which every layout applies on top of its own
 * object-fit: cover container via getCoverImageStyle().
 */
export default function CoverImageCropEditor({ imageUrl, value, onChange }: CoverImageCropEditorProps) {
  const crop = value || DEFAULT_CROP;
  const stageRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startX: number; startY: number; cropX: number; cropY: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const clamp = (n: number) => Math.max(0, Math.min(100, n));

  // Plain (non-memoized) handlers: they're only ever attached to `window`
  // for the lifetime of a single drag gesture (added in startDrag, removed
  // in stopDrag) and never sit in another hook's dependency array, so there
  // is no need for useCallback identity stability here — recreating them
  // each render keeps this straightforward.
  function onDragMove(e: PointerEvent) {
    const stage = stageRef.current;
    const drag = dragState.current;
    if (!stage || !drag) return;
    const rect = stage.getBoundingClientRect();
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    // The image is dragged like a photo under glass: moving the pointer
    // right/down should reveal more of the image's left/top edge, so the
    // focal point (object-position) moves the opposite way. Dividing by
    // zoom keeps the drag feeling 1:1 with the cursor at higher zoom
    // levels, where the same pixel movement covers less of the image.
    const nextX = clamp(drag.cropX - (dx / rect.width) * 100 / crop.zoom);
    const nextY = clamp(drag.cropY - (dy / rect.height) * 100 / crop.zoom);
    onChange({ ...crop, x: nextX, y: nextY });
  }

  function stopDrag() {
    dragState.current = null;
    setDragging(false);
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', stopDrag);
  }

  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragState.current = { startX: e.clientX, startY: e.clientY, cropX: crop.x, cropY: crop.y };
    setDragging(true);
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', stopDrag);
  };

  const handleZoom = (zoom: number) => onChange({ ...crop, zoom });
  const handleReset = () => onChange({ ...DEFAULT_CROP });

  if (!imageUrl) return null;

  return (
    <div className="space-y-4">
      <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
        <div>
          <label className="block text-sm font-medium text-dark mb-1 flex items-center gap-1.5">
            <Move size={14} className="text-primary" /> Position &amp; Zoom
          </label>
          <p className="text-[11px] text-dark-muted leading-snug mb-2 max-w-sm">
            For a sharp, well-framed result in both previews below, upload a
            wide landscape image at least <span className="font-medium text-dark">2400×1029px</span> (a
            21:9 widescreen shape), with the main subject centered — the crop below
            trims more or less off the sides depending on the layout.
          </p>
          <div
            ref={stageRef}
            onPointerDown={startDrag}
            className={`relative w-full max-w-sm aspect-[21/9] mx-auto sm:mx-0 overflow-hidden rounded-lg border-2 border-background-warm bg-dark/5 select-none ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          >
            <img
              src={imageUrl}
              alt="Cover preview"
              draggable={false}
              className="w-full h-full object-cover pointer-events-none"
              style={getCoverImageStyle(crop)}
            />
            <div className="absolute inset-0 border border-white/20 pointer-events-none" />
            {!dragging && (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-dark/70 text-white text-[11px] font-medium px-2.5 py-1 rounded-md pointer-events-none">
                Drag to reposition
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 max-w-sm mt-4">
            <ZoomIn size={16} className="text-dark-muted shrink-0" />
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.02}
              value={crop.zoom}
              onChange={e => handleZoom(Number(e.target.value))}
              className="flex-1 accent-primary"
              aria-label="Zoom"
            />
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1 text-xs font-medium text-dark-muted hover:text-primary transition-colors shrink-0"
              title="Reset to original position and zoom"
            >
              <RotateCcw size={13} /> Reset
            </button>
          </div>
        </div>

        <div className="mt-4 lg:mt-0">
          <p className="text-xs font-semibold text-dark-muted uppercase tracking-wide mb-2">Live Preview</p>
          <div className="flex flex-wrap gap-4">
            {PREVIEW_LAYOUTS.map(layout => (
              <div key={layout.label} style={{ width: layout.width }}>
                <div
                  className="relative w-full overflow-hidden rounded-md border border-background-warm bg-dark/5"
                  style={{ aspectRatio: layout.ratio }}
                >
                  <img
                    src={imageUrl}
                    alt={`${layout.label} preview`}
                    className="w-full h-full object-cover"
                    style={getCoverImageStyle(crop)}
                  />
                </div>
                <p className="text-[11px] font-medium text-dark mt-1">{layout.label}</p>
                <p className="text-[10px] text-dark-muted leading-tight">{layout.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
