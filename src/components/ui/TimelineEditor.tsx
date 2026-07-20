import { Plus, X, ChevronUp, ChevronDown } from 'lucide-react';
import type { AboutTimelineItem } from '../../types';

interface TimelineEditorProps {
  value: AboutTimelineItem[];
  onChange: (items: AboutTimelineItem[]) => void;
}

const inputClass = 'w-full px-3 py-2 rounded-xl border-2 border-background-warm bg-background font-body text-dark text-sm focus:border-primary outline-none transition-colors';

export default function TimelineEditor({ value, onChange }: TimelineEditorProps) {
  const addItem = () => {
    onChange([...value, { year: '', title: '', description: '' }]);
  };

  const updateItem = (index: number, patch: Partial<AboutTimelineItem>) => {
    onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const removeItem = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= value.length) return;
    const copy = [...value];
    [copy[index], copy[target]] = [copy[target], copy[index]];
    onChange(copy);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium text-dark">Timeline</label>
        <button
          type="button"
          onClick={addItem}
          className="flex items-center gap-1 text-xs font-button font-semibold text-primary hover:text-primary/80 transition-colors"
        >
          <Plus size={14} /> Add Milestone
        </button>
      </div>

      {value.length === 0 ? (
        <p className="text-sm text-dark-muted bg-background-warm rounded-xl px-4 py-3">No milestones yet. Click "Add Milestone" to start the story.</p>
      ) : (
        <div className="space-y-3">
          {value.map((item, index) => (
            <div key={index} className="bg-background-warm rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <input
                  value={item.year}
                  onChange={e => updateItem(index, { year: e.target.value })}
                  placeholder="Year, e.g. 2024"
                  className={`${inputClass} w-28`}
                />
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="p-1 rounded-lg hover:bg-white disabled:opacity-30 text-dark-muted transition-colors" title="Move up">
                    <ChevronUp size={14} />
                  </button>
                  <button type="button" onClick={() => move(index, 1)} disabled={index === value.length - 1} className="p-1 rounded-lg hover:bg-white disabled:opacity-30 text-dark-muted transition-colors" title="Move down">
                    <ChevronDown size={14} />
                  </button>
                  <button type="button" onClick={() => removeItem(index)} className="p-1 rounded-lg hover:bg-red-50 text-dark-muted hover:text-red-600 transition-colors" title="Remove">
                    <X size={14} />
                  </button>
                </div>
              </div>
              <input
                value={item.title}
                onChange={e => updateItem(index, { title: e.target.value })}
                placeholder="Milestone title, e.g. First Trip"
                className={inputClass}
              />
              <textarea
                value={item.description}
                onChange={e => updateItem(index, { description: e.target.value })}
                placeholder="What happened"
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
