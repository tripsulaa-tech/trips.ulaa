import { useState } from 'react';
import { Plus, X } from 'lucide-react';

interface TagListEditorProps {
  label: string;
  value: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  helperText?: string;
}

export default function TagListEditor({ label, value, onChange, placeholder, helperText }: TagListEditorProps) {
  const [draft, setDraft] = useState('');
  const inputId = `tag-list-${label.replace(/\s+/g, '-').toLowerCase()}`;

  const addItem = () => {
    const text = draft.trim();
    if (!text) return;
    onChange([...value, text]);
    setDraft('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addItem();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    // Multi-line/paragraph paste (e.g. a list copied from a doc) — split it
    // into separate items instead of dumping it all into one entry.
    const lines = text.split(/\r?\n\s*\n|\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length > 1) {
      e.preventDefault();
      onChange([...value, ...lines]);
      setDraft('');
    }
  };

  const handleBlur = () => {
    // Commit whatever was typed even if the admin clicks away or hits Save
    // instead of pressing Enter or the + button.
    addItem();
  };

  const removeAt = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <div>
      <label htmlFor={inputId} className="block text-sm font-medium text-dark mb-1">{label}</label>
      {helperText && <p className="text-xs text-dark-muted mb-2">{helperText}</p>}

      {value.length > 0 && (
        <ul className="space-y-2 mb-3">
          {value.map((item, index) => (
            <li key={index} className="flex items-center gap-2 bg-background-warm rounded-lg px-3 py-2">
              <span className="flex-1 text-sm text-dark">{item}</span>
              <button
                type="button"
                onClick={() => removeAt(index)}
                className="text-dark-muted hover:text-red-600 transition-colors shrink-0"
                title="Remove"
                aria-label={`Remove ${item}`}
              >
                <X size={15} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <input
          id={inputId}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onBlur={handleBlur}
          placeholder={placeholder || 'Type and press Enter to add'}
          className="flex-1 px-3 py-2 rounded-lg border-2 border-background-warm bg-background font-body text-dark text-sm focus:border-primary outline-none transition-colors"
        />
        <button
          type="button"
          onClick={addItem}
          className="shrink-0 px-3 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors flex items-center justify-center"
          title="Add"
          aria-label={`Add ${label}`}
        >
          <Plus size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
