import { useEffect, useRef, useState } from 'react';
import { PencilSimple } from '@phosphor-icons/react';

interface InlineEditTextProps {
  value: string;
  onSave: (next: string) => void;
  // Accessible label, e.g. "Edit bullet 2".
  ariaLabel?: string;
  className?: string;
}

// Click-to-edit text for list rows (bullets, "what's not included", etc.).
// Click (or Enter/Space when focused) turns the text into an auto-growing
// textarea. Enter or clicking away saves, Escape cancels. Saving an empty
// value reverts to the previous text, so a row is never silently blanked
// (use the row's X button to delete it).
export default function InlineEditText({ value, onSave, ariaLabel, className = '' }: InlineEditTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);

  const grow = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => {
    if (!editing) return;
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    grow();
  }, [editing]);

  const start = () => {
    setDraft(value);
    setEditing(true);
  };

  const commit = () => {
    const next = draft.trim();
    if (next && next !== value) onSave(next);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <textarea
        ref={ref}
        value={draft}
        rows={1}
        aria-label={ariaLabel}
        onChange={e => {
          setDraft(e.target.value);
          grow();
        }}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation(); // don't also close the surrounding modal
            cancel();
          }
        }}
        className={`flex-1 min-w-0 resize-none overflow-hidden bg-white rounded-md border-2 border-primary px-2 py-1 text-sm text-dark font-body outline-none ${className}`}
      />
    );
  }

  return (
    <span
      role="button"
      tabIndex={0}
      title="Click to edit"
      aria-label={ariaLabel ? `${ariaLabel}: ${value}` : `Edit: ${value}`}
      onClick={start}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          start();
        }
      }}
      className={`group/edit flex-1 min-w-0 flex items-start gap-1.5 cursor-text rounded-md px-2 py-1 -mx-2 -my-1 text-sm text-dark hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-colors ${className}`}
    >
      <span className="flex-1 min-w-0 break-words">{value}</span>
      <PencilSimple
        size={13}
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-dark-muted opacity-0 group-hover/edit:opacity-100 group-focus-visible/edit:opacity-100 transition-opacity"
      />
    </span>
  );
}
