import {
  Plus,
  X,
  CaretUp as ChevronUp,
  CaretDown as ChevronDown,
  Warning as AlertTriangle,
} from '@phosphor-icons/react';
import type { ItineraryDay } from '../../types/types-index';
import MultiImageUploadField from './MultiImageUploadField';
import TripHighlightIconPicker from './TripHighlightIconPicker';
import { EDITOR_INPUT_CLASS as inputClass } from '../../constants/formStyles';
import { STORAGE_BUCKET } from '../../constants/storage';
import { useReorder, moveItem, ReorderGrip } from './Reorder';

interface ItineraryEditorProps {
  value: ItineraryDay[];
  onChange: (days: ItineraryDay[]) => void;
  // Used to namespace uploaded photos in storage (trips/{tripSlug}/itinerary/day-N)
  // so folder names in Supabase Storage are readable instead of raw UUIDs.
  // Falls back to 'new-trip' for trips that haven't been saved/titled yet.
  tripSlug?: string;
}

// Minimum number of photos we ask admins to add per day. Not hard-enforced
// (a day can still be saved with fewer/no photos), just nudges the UI.
const MIN_RECOMMENDED_PHOTOS = 4;

// A day's bullet points, reorderable (grip on desktop, arrows on touch) —
// its own component so each day gets its own drag state.
function DayBullets({ bullets, onChange }: { bullets: string[]; onChange: (next: string[]) => void }) {
  const drag = useReorder((from, to) => onChange(moveItem(bullets, from, to)));
  return (
    <ul className="space-y-2">
      {bullets.map((bullet, bi) => (
        <li
          key={bi}
          {...drag.itemProps(bi)}
          className={`flex items-center gap-2 bg-background-warm rounded-lg px-3 py-2 border border-transparent transition-all ${drag.itemClass(bi)}`}
        >
          <ReorderGrip drag={drag} index={bi} count={bullets.length} className="-ml-1" />
          <span className="flex-1 text-sm text-dark">{bullet}</span>
          {bullets.length > 1 && (
            <>
              <button type="button" onClick={() => drag.move(bi, bi - 1)} disabled={bi === 0} className="p-0.5 rounded hover:bg-white disabled:opacity-30 text-dark-muted transition-colors shrink-0" title="Move up" aria-label={`Move bullet ${bi + 1} up`}>
                <ChevronUp size={13} aria-hidden="true" />
              </button>
              <button type="button" onClick={() => drag.move(bi, bi + 1)} disabled={bi === bullets.length - 1} className="p-0.5 rounded hover:bg-white disabled:opacity-30 text-dark-muted transition-colors shrink-0" title="Move down" aria-label={`Move bullet ${bi + 1} down`}>
                <ChevronDown size={13} aria-hidden="true" />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => onChange(bullets.filter((_, i) => i !== bi))}
            className="text-dark-muted hover:text-red-600 transition-colors shrink-0"
            title="Remove"
            aria-label={`Remove bullet: ${bullet}`}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function ItineraryEditor({ value, onChange, tripSlug }: ItineraryEditorProps) {
  const renumber = (days: ItineraryDay[]) => days.map((d, i) => ({ ...d, day: i + 1 }));

  const addDay = () => {
    onChange(renumber([...value, { day: value.length + 1, title: '', description: '' }]));
  };

  const updateDay = (index: number, patch: Partial<ItineraryDay>) => {
    onChange(value.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  };

  const removeDay = (index: number) => {
    onChange(renumber(value.filter((_, i) => i !== index)));
  };

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= value.length) return;
    const copy = [...value];
    [copy[index], copy[target]] = [copy[target], copy[index]];
    onChange(renumber(copy));
  };

  // Drag a day's grip onto another day to reorder; days renumber automatically.
  const dayDrag = useReorder((from, to) => onChange(renumber(moveItem(value, from, to))));

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium text-dark">Detailed Itinerary</label>
        <button
          type="button"
          onClick={addDay}
          className="flex items-center gap-1 text-xs font-button font-semibold text-primary hover:text-primary/80 transition-colors"
        >
          <Plus size={14} aria-hidden="true" /> Add Day
        </button>
      </div>
      <p className="text-xs text-dark-muted mb-3">Each day shows as its own card on the trip page.</p>

      {value.length === 0 ? (
        <p className="text-sm text-dark-muted bg-background-warm rounded-lg px-4 py-3">No itinerary days yet. Click "Add Day" to build a day-by-day plan.</p>
      ) : (
        <div className="space-y-3">
          {value.map((day, index) => (
            <div key={index} {...dayDrag.itemProps(index)} className={`border border-background-warm rounded-lg p-4 space-y-2 transition-all ${dayDrag.itemClass(index)}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="flex items-center gap-1 text-xs font-semibold text-dark-muted uppercase tracking-wide">
                  <ReorderGrip drag={dayDrag} index={index} count={value.length} className="-ml-1" />
                  Day {day.day}
                </span>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="p-1 rounded-md hover:bg-background-warm disabled:opacity-30 text-dark-muted transition-colors" title="Move up" aria-label={`Move Day ${day.day} up`}>
                    <ChevronUp size={14} aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => move(index, 1)} disabled={index === value.length - 1} className="p-1 rounded-md hover:bg-background-warm disabled:opacity-30 text-dark-muted transition-colors" title="Move down" aria-label={`Move Day ${day.day} down`}>
                    <ChevronDown size={14} aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => removeDay(index)} className="p-1 rounded-md hover:bg-red-50 text-dark-muted hover:text-red-600 transition-colors" title="Remove day" aria-label={`Remove Day ${day.day}${day.title ? `: ${day.title}` : ''}`}>
                    <X size={14} aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div className="flex gap-2 items-start">
                <div className="w-32 flex-shrink-0">
                  <label className="block text-xs font-medium text-dark mb-1">Icon (optional)</label>
                  <TripHighlightIconPicker
                    value={day.icon || ''}
                    hintText={day.title}
                    onChange={key => updateDay(index, { icon: key })}
                  />
                </div>
                <div className="flex-1 space-y-2">
                  <div>
                    <label htmlFor={`itinerary-day-${index}-title`} className="block text-xs font-medium text-dark mb-1">Title</label>
                    <input
                      id={`itinerary-day-${index}-title`}
                      value={day.title}
                      onChange={e => updateDay(index, { title: e.target.value })}
                      placeholder="Day title, e.g. Shimla → Kaza"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor={`itinerary-day-${index}-description`} className="block text-xs font-medium text-dark mb-1">Description</label>
                    <textarea
                      id={`itinerary-day-${index}-description`}
                      value={day.description}
                      onChange={e => updateDay(index, { description: e.target.value })}
                      onPaste={e => {
                        const text = e.clipboardData.getData('text');
                        // Blank-line-separated paragraphs = the admin pasted a
                        // structured multi-paragraph day plan. Auto-split it into
                        // bullets instead of dumping it all into one paragraph.
                        const paragraphs = text.split(/\n\s*\n+/).map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
                        if (paragraphs.length > 1) {
                          e.preventDefault();
                          updateDay(index, { bullets: [...(day.bullets || []), ...paragraphs] });
                        }
                      }}
                      placeholder="What happens on this day"
                      rows={2}
                      className={`${inputClass} resize-none`}
                    />
                    <p className="text-2xs text-dark-muted mt-1">Paste a list. Each paragraph (blank line between) becomes a bullet.</p>
                  </div>
                </div>
              </div>
              {!day.icon && (
                <p className="text-2xs text-dark-muted">No icon set. The page shows "Day {day.day}".</p>
              )}

              {(day.bullets?.length || 0) > 0 && (
                <div>
                  <label className="block text-xs font-medium text-dark mb-1">Bullet Points</label>
                  <DayBullets bullets={day.bullets || []} onChange={next => updateDay(index, { bullets: next })} />
                </div>
              )}

              <div className="pt-1">
                <MultiImageUploadField
                  label={`Day ${day.day} Photos`}
                  value={day.images || []}
                  onChange={urls => updateDay(index, { images: urls })}
                  bucket={STORAGE_BUCKET}
                  pathPrefix={`trips/${tripSlug || 'new-trip'}/itinerary/day-${day.day}`}
                  allowUrl
                />
                {(day.images?.length || 0) < MIN_RECOMMENDED_PHOTOS && (
                  <p className="flex items-center gap-1 text-xs text-amber-600 mt-1.5">
                    <AlertTriangle size={12} aria-hidden="true" />
                    Add at least {MIN_RECOMMENDED_PHOTOS} photos so this day looks great on the trip page.
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
