// "A3 print sheets" panel for the Travel Cards page. It lays cards out on A3
// pages for printing, with a live preview of each sheet:
//  - copies = true:  one common card (the back) repeated "Number of cards" times
//  - copies = false: each given card (a ticked traveler / trip leader) once
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CaretLeft, CaretRight, CircleNotch, DownloadSimple as Download } from '@phosphor-icons/react';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import { useAlert } from '../components/ui/useAlert';
import { FORM_INPUT_CLASS as inputClass } from '../constants/formStyles';
import {
  GUIDE_NOTE, MARKS_GAP_HINT, MIN_GAP_FOR_MARKS_MM, cardCutGuides, cardSheetItemKey, cutGuideOptions, isCutGuides, planCardSheets,
  type CardSheetItem, type CutGuides, type GuideShape,
} from '../utils/travelCard';

/** Cut guides as SVG lines, for the on-screen sheet previews (mm units). */
export function CutGuideShapes({ shapes }: { shapes: GuideShape[] }) {
  const common = { fill: 'none', stroke: '#555', strokeWidth: 1, vectorEffect: 'non-scaling-stroke' } as const;
  return (
    <>
      {shapes.map((sh, i) => {
        if (sh.t === 'rrect') return <rect key={i} x={sh.x} y={sh.y} width={sh.w} height={sh.h} rx={sh.r} ry={sh.r} {...common} />;
        if (sh.t === 'circle') return <circle key={i} cx={sh.cx} cy={sh.cy} r={sh.r} {...common} />;
        return <line key={i} x1={sh.x1} y1={sh.y1} x2={sh.x2} y2={sh.y2} {...common} />;
      })}
    </>
  );
}

// Card size and gap are shared by every card type (they are the same physical
// card), so they are remembered together in this browser.
const SETTINGS_KEY = 'ulaa-travel-card-sheet-v1';
interface SheetInputs { widthMm: string; gapMm: string; guides: CutGuides }
const DEFAULT_INPUTS: SheetInputs = { widthMm: '54', gapMm: '4', guides: 'outline' };

function loadInputs(): SheetInputs {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object') return DEFAULT_INPUTS;
    const merged = { ...DEFAULT_INPUTS, ...parsed };
    return { ...merged, guides: isCutGuides(merged.guides) ? merged.guides : 'outline' };
  } catch {
    return DEFAULT_INPUTS;
  }
}

interface CardSheetPanelProps {
  items: CardSheetItem[];
  /** True when items[0] is repeated (asking for a quantity); false when each item is printed once. */
  copies: boolean;
  fileName: (count: number) => string;
  /** Shown instead of the panel body when there is nothing to print. */
  emptyMessage?: string;
  /** When set, exactly this many copies are printed and the quantity box is hidden (e.g. matching the Travelers sheets). */
  fixedCount?: number;
  /** Extra controls shown above the card size inputs (e.g. "include the trip leader"). */
  children?: ReactNode;
}

export default function CardSheetPanel({ items, copies, fileName, emptyMessage, fixedCount, children }: CardSheetPanelProps) {
  const alert = useAlert();
  const [inputs, setInputs] = useState<SheetInputs>(loadInputs);
  const [quantity, setQuantity] = useState('');
  const [previewSheet, setPreviewSheet] = useState(0);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const thumbUrls = useRef<string[]>([]);

  const widthMm = Number(inputs.widthMm);
  const gapMm = Number(inputs.gapMm);
  const valid = widthMm >= 20 && widthMm <= 200 && gapMm >= 0 && gapMm <= 30;
  const guides = inputs.guides;
  const settings = useMemo(() => ({ widthMm, gapMm, guides }), [widthMm, gapMm, guides]);
  const { layout, perSheet } = useMemo(
    () => (valid ? planCardSheets(settings, 1) : { layout: null, perSheet: 0 }),
    [valid, settings],
  );

  // Blank quantity means "one full sheet" for the repeated back card.
  const typedQuantity = Math.floor(Number(quantity));
  const total = copies ? (fixedCount ?? (typedQuantity > 0 ? typedQuantity : perSheet)) : items.length;
  const sheets = perSheet > 0 ? Math.ceil(total / perSheet) : 0;
  const tooMany = sheets > 100;
  const sheetIndex = Math.min(previewSheet, Math.max(0, sheets - 1));
  const start = sheetIndex * perSheet;
  const onSheet = Math.max(0, Math.min(perSheet, total - start));
  const sheetItems = useMemo<CardSheetItem[]>(() => {
    if (items.length === 0) return [];
    return Array.from({ length: onSheet }, (_, i) => (copies ? items[0] : items[start + i]));
  }, [items, copies, onSheet, start]);

  // Small card images for the preview. Only the sheet being looked at is
  // drawn, and identical cards (the back) are drawn once.
  const thumbKeys = useMemo(() => [...new Set(sheetItems.map(cardSheetItemKey))], [sheetItems]);
  useEffect(() => {
    if (thumbKeys.length === 0) return;
    let cancelled = false;
    const made: string[] = [];
    const byKey = new Map(sheetItems.map(i => [cardSheetItemKey(i), i]));
    const timer = setTimeout(async () => {
      try {
        const { renderCardThumbBlob } = await import('../utils/travelCard');
        const next: Record<string, string> = {};
        for (const key of thumbKeys) {
          const item = byKey.get(key);
          if (!item) continue;
          const blob = await renderCardThumbBlob(item);
          if (cancelled) break;
          const url = URL.createObjectURL(blob);
          made.push(url);
          next[key] = url;
        }
        if (cancelled) return;
        // Swap in the new images, then release the old ones (so the preview
        // never shows a broken image while it redraws).
        thumbUrls.current.forEach(u => URL.revokeObjectURL(u));
        thumbUrls.current = made;
        setThumbs(next);
      } catch (err) {
        console.error(err);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      // Images made for a run that was replaced before it finished.
      if (!thumbUrls.current.some(u => made.includes(u))) made.forEach(u => URL.revokeObjectURL(u));
    };
  }, [thumbKeys, sheetItems]);

  // Release the last images when the panel goes away.
  useEffect(() => () => { thumbUrls.current.forEach(u => URL.revokeObjectURL(u)); }, []);

  const saveInputs = (next: SheetInputs) => {
    setInputs(next);
    try { window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  };
  const setField = (key: 'widthMm' | 'gapMm', value: string) => saveInputs({ ...inputs, [key]: value.replace(/[^\d.]/g, '') });
  const setGuides = (value: string) => { if (isCutGuides(value)) saveInputs({ ...inputs, guides: value }); };

  const download = async () => {
    if (busy || !valid || perSheet === 0 || tooMany || items.length === 0) return;
    setBusy(true);
    try {
      const { downloadCardSheets } = await import('../utils/travelCard');
      await downloadCardSheets(settings, items, total, fileName(total));
    } catch (err) {
      console.error(err);
      await alert({ title: 'Print sheets', message: err instanceof Error ? err.message : 'Could not create the print sheets. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  const pageLabel = layout?.landscape ? 'A3 landscape' : 'A3 portrait';
  const noun = (n: number) => `card${n === 1 ? '' : 's'}`;

  return (
    <div className="bg-white rounded-lg p-4 shadow-card space-y-4">
      <p className="text-sm font-medium text-dark">A3 print sheets</p>
      {items.length === 0 && emptyMessage ? (
        <p className="text-sm text-dark-muted">{emptyMessage}</p>
      ) : (
        <>
          {children}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="sheet-card-width" className="block text-sm font-medium text-dark mb-1">Card width (mm)</label>
              <input id="sheet-card-width" inputMode="decimal" value={inputs.widthMm} onChange={e => setField('widthMm', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="sheet-gap" className="block text-sm font-medium text-dark mb-1">Gap between (mm)</label>
              <input id="sheet-gap" inputMode="decimal" value={inputs.gapMm} onChange={e => setField('gapMm', e.target.value)} className={inputClass} />
            </div>
            {copies && fixedCount === undefined && (
              <div>
                <label htmlFor="sheet-quantity" className="block text-sm font-medium text-dark mb-1">Number of cards</label>
                <input
                  id="sheet-quantity"
                  inputMode="numeric"
                  value={quantity}
                  placeholder={perSheet ? `${perSheet} (1 sheet)` : ''}
                  onChange={e => setQuantity(e.target.value.replace(/\D/g, ''))}
                  className={inputClass}
                />
              </div>
            )}
          </div>

          <div>
            <label htmlFor="sheet-guides" className="block text-sm font-medium text-dark mb-1">Cut guides</label>
            <Select inputId="sheet-guides" value={guides} onChange={setGuides} options={cutGuideOptions('card')} />
            {guides === 'marks' && gapMm < MIN_GAP_FOR_MARKS_MM && <p className="text-xs text-amber-800 mt-1">{MARKS_GAP_HINT}</p>}
          </div>

          {!valid ? (
            <p role="alert" className="text-xs text-red-600">Card width must be 20 to 200 mm and the gap 0 to 30 mm.</p>
          ) : perSheet === 0 ? (
            <p role="alert" className="text-xs text-red-600">That size does not fit on an A3 sheet.</p>
          ) : (
            <p className="text-sm text-dark bg-background-warm rounded-md px-3 py-2">
              Cards print {Math.round(widthMm * 10) / 10} × {Math.round((layout?.cardHeight ?? 0) * 10) / 10} mm.
              {' '}<span className="font-semibold">{perSheet}</span> fit on one {pageLabel} sheet.
              {' '}{total} {noun(total)} = <span className="font-semibold">{sheets}</span> sheet{sheets === 1 ? '' : 's'}.
            </p>
          )}
          {tooMany && <p role="alert" className="text-xs text-red-600">That is more than 100 sheets. Please download in smaller batches.</p>}

          {layout && perSheet > 0 && items.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-dark">Sheet preview</p>
                <div className="flex items-center gap-1 text-xs text-dark-muted">
                  {sheets > 1 && (
                    <button type="button" onClick={() => setPreviewSheet(Math.max(0, sheetIndex - 1))} disabled={sheetIndex === 0} aria-label="Previous sheet" className="p-1.5 rounded-md hover:bg-background-warm disabled:opacity-40 disabled:cursor-not-allowed"><CaretLeft size={14} weight="bold" aria-hidden="true" /></button>
                  )}
                  <span>Sheet {sheetIndex + 1} of {Math.max(1, sheets)} · {onSheet} {noun(onSheet)}</span>
                  {sheets > 1 && (
                    <button type="button" onClick={() => setPreviewSheet(Math.min(sheets - 1, sheetIndex + 1))} disabled={sheetIndex >= sheets - 1} aria-label="Next sheet" className="p-1.5 rounded-md hover:bg-background-warm disabled:opacity-40 disabled:cursor-not-allowed"><CaretRight size={14} weight="bold" aria-hidden="true" /></button>
                  )}
                </div>
              </div>
              <svg
                viewBox={`0 0 ${layout.pageWidth} ${layout.pageHeight}`}
                role="img"
                aria-label={`${pageLabel} sheet ${sheetIndex + 1} of ${Math.max(1, sheets)} with ${onSheet} cards`}
                className={`w-full bg-white border border-background-warm rounded-sm shadow-card ${layout.landscape ? 'max-w-[460px]' : 'max-w-[300px]'}`}
              >
                <rect x="10" y="10" width={layout.pageWidth - 20} height={layout.pageHeight - 20} fill="none" stroke="#d8cdbd" strokeWidth="0.4" strokeDasharray="2 2" />
                {sheetItems.map((item, i) => {
                  const slot = layout.slots[i];
                  const url = thumbs[cardSheetItemKey(item)];
                  return (
                    <g key={i}>
                      {url
                        ? <image href={url} x={slot.x} y={slot.y} width={layout.cardWidth} height={layout.cardHeight} />
                        : <rect x={slot.x} y={slot.y} width={layout.cardWidth} height={layout.cardHeight} rx="3" fill="#f6ebdc" stroke="#e5d6c0" strokeWidth="0.4" />}
                      <CutGuideShapes shapes={cardCutGuides(slot, layout.cardWidth, layout.cardHeight, gapMm, guides)} />
                    </g>
                  );
                })}
              </svg>
              <p className="text-xs text-dark-muted">The dashed line is the 10 mm unprinted border. Orientation is chosen automatically to fit the most cards. {guides !== 'none' && GUIDE_NOTE}</p>
            </div>
          )}

          <Button size="sm" onClick={download} disabled={busy || !valid || perSheet === 0 || tooMany || items.length === 0}>
            {busy ? <CircleNotch size={16} weight="bold" className="animate-spin" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
            <span className="ml-2">{busy ? 'Preparing…' : 'Download A3 print sheets (PDF)'}</span>
          </Button>
          <p className="text-xs text-dark-muted">Print at 100% (actual size) so the cards come out the size you set. The last sheet holds the remainder.</p>
        </>
      )}
    </div>
  );
}
