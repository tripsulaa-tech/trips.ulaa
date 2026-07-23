import { Plus, X } from 'lucide-react';
import type { AboutValue } from '../../types';
import Select from './Select';

interface ValuesEditorProps {
  value: AboutValue[];
  onChange: (values: AboutValue[]) => void;
  iconOptions: string[];
}

const inputClass = 'w-full px-3 py-2 rounded-xl border-2 border-background-warm bg-background font-body text-dark text-sm focus:border-primary outline-none transition-colors';

export default function ValuesEditor({ value, onChange, iconOptions }: ValuesEditorProps) {
  const addItem = () => {
    onChange([...value, { icon: iconOptions[0] || 'Heart', title: '', description: '' }]);
  };

  const updateItem = (index: number, patch: Partial<AboutValue>) => {
    onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const removeItem = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium text-dark">Values</label>
        <button
          type="button"
          onClick={addItem}
          className="flex items-center gap-1 text-xs font-button font-semibold text-primary hover:text-primary/80 transition-colors"
        >
          <Plus size={14} /> Add Value
        </button>
      </div>

      {value.length === 0 ? (
        <p className="text-sm text-dark-muted bg-background-warm rounded-xl px-4 py-3">No values yet. Click "Add Value" to add one.</p>
      ) : (
        <div className="space-y-3">
          {value.map((item, index) => (
            <div key={index} className="bg-background-warm rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="w-36">
                  <Select
                    value={item.icon}
                    onChange={val => updateItem(index, { icon: val })}
                    options={iconOptions.map(opt => ({ value: opt, label: opt }))}
                    size="sm"
                  />
                </div>
                <button type="button" onClick={() => removeItem(index)} className="p-1 rounded-lg hover:bg-red-50 text-dark-muted hover:text-red-600 transition-colors" title="Remove">
                  <X size={14} />
                </button>
              </div>
              <input
                value={item.title}
                onChange={e => updateItem(index, { title: e.target.value })}
                placeholder="Value title, e.g. Safety First"
                className={inputClass}
              />
              <textarea
                value={item.description}
                onChange={e => updateItem(index, { description: e.target.value })}
                placeholder="Short description"
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
