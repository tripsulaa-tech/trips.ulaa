import { Plus, X, ChevronUp, ChevronDown, AlertTriangle } from 'lucide-react';
import type { ItineraryDay } from '../../types/types-index';
import MultiImageUploadField from './MultiImageUploadField';
import TripHighlightIconPicker from './TripHighlightIconPicker';

interface ItineraryEditorProps {
  value: ItineraryDay[];
  onChange: (days: ItineraryDay[]) => void;
  // Used to namespace uploaded photos in storage (trips/{tripSlug}/itinerary/day-N)
  // so folder names in Supabase Storage are readable instead of raw UUIDs.
  // Falls back to 'new-trip' for trips that haven't been saved/titled yet.
  tripSlug?: string;
}

const inputClass = 'w-full px-3 py-2 rounded-lg border-2 border-background-warm bg-background font-body text-dark text-sm focus:border-primary outline-none transition-colors';

// Minimum number of photos we ask admins to add per day. Not hard-enforced
// (a day can still be saved with fewer/no photos), just nudges the UI.
const MIN_RECOMMENDED_PHOTOS = 3;

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

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium text-dark">Detailed Itinerary</label>
        <button
          type="button"
          onClick={addDay}
          className="flex items-center gap-1 text-xs font-button font-semibold text-primary hover:text-primary/80 transition-colors"
        >
          <Plus size={14} /> Add Day
        </button>
      </div>
      <p className="text-xs text-dark-muted mb-3">Each day becomes its own card on the trip page instead of one long paragraph.</p>

      {value.length === 0 ? (
        <p className="text-sm text-dark-muted bg-background-warm rounded-lg px-4 py-3">No itinerary days yet. Click "Add Day" to build a day-by-day plan.</p>
      ) : (
        <div className="space-y-3">
          {value.map((day, index) => (
            <div key={index} className="border border-background-warm rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-dark-muted uppercase tracking-wide">Day {day.day}</span>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="p-1 rounded-md hover:bg-background-warm disabled:opacity-30 text-dark-muted transition-colors" title="Move up">
                    <ChevronUp size={14} />
                  </button>
                  <button type="button" onClick={() => move(index, 1)} disabled={index === value.length - 1} className="p-1 rounded-md hover:bg-background-warm disabled:opacity-30 text-dark-muted transition-colors" title="Move down">
                    <ChevronDown size={14} />
                  </button>
                  <button type="button" onClick={() => removeDay(index)} className="p-1 rounded-md hover:bg-red-50 text-dark-muted hover:text-red-600 transition-colors" title="Remove day">
                    <X size={14} />
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
                    <label className="block text-xs font-medium text-dark mb-1">Title</label>
                    <input
                      value={day.title}
                      onChange={e => updateDay(index, { title: e.target.value })}
                      placeholder="Day title, e.g. Shimla → Kaza"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-dark mb-1">Description</label>
                    <textarea
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
                    <p className="text-[11px] text-dark-muted mt-1">Paste a list — each paragraph (separated by a blank line) automatically becomes its own bullet below.</p>
                  </div>
                </div>
              </div>
              {!day.icon && (
                <p className="text-[11px] text-dark-muted">No icon set — the trip page will just show "Day {day.day}".</p>
              )}

              {(day.bullets?.length || 0) > 0 && (
                <div>
                  <label className="block text-xs font-medium text-dark mb-1">Bullet Points</label>
                  <ul className="space-y-2">
                    {(day.bullets || []).map((bullet, bi) => (
                      <li key={bi} className="flex items-center gap-2 bg-background-warm rounded-lg px-3 py-2">
                        <span className="flex-1 text-sm text-dark">{bullet}</span>
                        <button
                          type="button"
                          onClick={() => updateDay(index, { bullets: (day.bullets || []).filter((_, i) => i !== bi) })}
                          className="text-dark-muted hover:text-red-600 transition-colors shrink-0"
                          title="Remove"
                        >
                          <X size={15} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="pt-1">
                <MultiImageUploadField
                  label={`Day ${day.day} Photos`}
                  value={day.images || []}
                  onChange={urls => updateDay(index, { images: urls })}
                  bucket="ulaa"
                  pathPrefix={`trips/${tripSlug || 'new-trip'}/itinerary/day-${day.day}`}
                />
                {(day.images?.length || 0) < MIN_RECOMMENDED_PHOTOS && (
                  <p className="flex items-center gap-1 text-xs text-amber-600 mt-1.5">
                    <AlertTriangle size={12} />
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
