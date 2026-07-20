import { Plus, X } from 'lucide-react';
import type { FAQ } from '../../types';

interface FAQEditorProps {
  value: FAQ[];
  onChange: (faqs: FAQ[]) => void;
}

const inputClass = 'w-full px-3 py-2 rounded-xl border-2 border-background-warm bg-background font-body text-dark text-sm focus:border-primary outline-none transition-colors';

export default function FAQEditor({ value, onChange }: FAQEditorProps) {
  const addFAQ = () => onChange([...value, { question: '', answer: '' }]);

  const updateFAQ = (index: number, patch: Partial<FAQ>) => {
    onChange(value.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  };

  const removeFAQ = (index: number) => onChange(value.filter((_, i) => i !== index));

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

      {value.length === 0 ? (
        <p className="text-sm text-dark-muted bg-background-warm rounded-xl px-4 py-3">No FAQs yet.</p>
      ) : (
        <div className="space-y-3">
          {value.map((faq, index) => (
            <div key={index} className="bg-background-warm rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-button font-bold text-dark-muted">Q{index + 1}</span>
                <button type="button" onClick={() => removeFAQ(index)} className="p-1 rounded-lg hover:bg-red-50 text-dark-muted hover:text-red-600 transition-colors" title="Remove">
                  <X size={14} />
                </button>
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
