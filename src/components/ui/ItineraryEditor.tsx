import { Plus, X, ChevronUp, ChevronDown } from 'lucide-react';
import type { ItineraryDay } from '../../types';

interface ItineraryEditorProps {
  value: ItineraryDay[];
  onChange: (days: ItineraryDay[]) => void;
}

const inputClass = 'w-full px-3 py-2 rounded-xl border-2 border-background-warm bg-background font-body text-dark text-sm focus:border-primary outline-none transition-colors';

export default function ItineraryEditor({ value, onChange }: ItineraryEditorProps) {
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
        <p className="text-sm text-dark-muted bg-background-warm rounded-xl px-4 py-3">No itinerary days yet. Click "Add Day" to build a day-by-day plan.</p>
      ) : (
        <div className="space-y-3">
          {value.map((day, index) => (
            <div key={index} className="bg-background-warm rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-button font-bold text-primary">Day {day.day}</span>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="p-1 rounded-lg hover:bg-white disabled:opacity-30 text-dark-muted transition-colors" title="Move up">
                    <ChevronUp size={14} />
                  </button>
                  <button type="button" onClick={() => move(index, 1)} disabled={index === value.length - 1} className="p-1 rounded-lg hover:bg-white disabled:opacity-30 text-dark-muted transition-colors" title="Move down">
                    <ChevronDown size={14} />
                  </button>
                  <button type="button" onClick={() => removeDay(index)} className="p-1 rounded-lg hover:bg-red-50 text-dark-muted hover:text-red-600 transition-colors" title="Remove day">
                    <X size={14} />
                  </button>
                </div>
              </div>
              <input
                value={day.title}
                onChange={e => updateDay(index, { title: e.target.value })}
                placeholder="Day title, e.g. Shimla → Kaza"
                className={inputClass}
              />
              <textarea
                value={day.description}
                onChange={e => updateDay(index, { description: e.target.value })}
                placeholder="What happens on this day"
                rows={2}
                className={`${inputClass} resize-none`}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
