import {
  Plus,
  X,
} from '@phosphor-icons/react';
import type { FAQ } from '../../types/types-index';
import { EDITOR_INPUT_CLASS as inputClass } from '../../constants/formStyles';
import { useReorder, moveItem, ReorderGrip, ReorderArrows } from './Reorder';

interface FAQEditorProps {
  value: FAQ[];
  onChange: (faqs: FAQ[]) => void;
}

export default function FAQEditor({ value, onChange }: FAQEditorProps) {
  const addFAQ = () => onChange([...value, { question: '', answer: '' }]);

  const updateFAQ = (index: number, patch: Partial<FAQ>) => {
    onChange(value.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  };

  const removeFAQ = (index: number) => onChange(value.filter((_, i) => i !== index));

  // Drag the grip (desktop) or use the arrows to change the order shown on the trip page.
  const drag = useReorder((from, to) => onChange(moveItem(value, from, to)));

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium text-dark">FAQs</label>
        <button
          type="button"
          onClick={addFAQ}
          className="flex items-center gap-1 text-xs font-button font-semibold text-primary hover:text-primary/80 transition-colors"
        >
          <Plus size={14} /> Add FAQ
        </button>
      </div>
      <p className="text-xs text-dark-muted mb-3">Common questions shown on the trip page.</p>

      {value.length === 0 ? (
        <p className="text-sm text-dark-muted bg-background-warm rounded-lg px-4 py-3">No FAQs yet.</p>
      ) : (
        <div className="space-y-3">
          {value.map((faq, index) => (
            <div key={index} {...drag.itemProps(index)} className={`bg-background-warm rounded-lg p-3 space-y-2 border border-transparent transition-all ${drag.itemClass(index)}`}>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 text-xs font-button font-bold text-dark-muted">
                  <ReorderGrip drag={drag} index={index} count={value.length} className="-ml-1" />
                  Q{index + 1}
                </span>
                <div className="flex items-center gap-0.5">
                  <ReorderArrows vertical drag={drag} index={index} count={value.length} />
                  <button type="button" onClick={() => removeFAQ(index)} className="p-1 rounded-md hover:bg-red-50 text-dark-muted hover:text-red-600 transition-colors" title="Remove">
                    <X size={14} />
                  </button>
                </div>
              </div>
              <input
                value={faq.question}
                onChange={e => updateFAQ(index, { question: e.target.value })}
                placeholder="Question"
                className={inputClass}
              />
              <textarea
                value={faq.answer}
                onChange={e => updateFAQ(index, { answer: e.target.value })}
                placeholder="Answer"
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
