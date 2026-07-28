import { useState, useEffect, useRef } from 'react';
import { Plus, X, ChevronUp, ChevronDown } from 'lucide-react';
import { parseTerms, type TermsBlock } from '../../utils/parseTerms';

interface TermsEditorProps {
  // Same raw "1. Title\nbody..." string that's stored on the trip and
  // parsed by parseTerms() for the public booking form. This editor is a
  // structured convenience layer over that string — sections are edited as
  // title/body cards (numbered, reorderable, like CancellationPolicyEditor's
  // tiers), then serialized back to the same text convention on every
  // change, so BookingForm/TermsBlocks/parseTerms need no changes at all.
  value: string;
  onChange: (raw: string) => void;
}

interface EditableSection {
  title: string;
  body: string;
}

const inputClass = 'w-full px-3 py-2 rounded-lg border-2 border-background-warm bg-background font-body text-dark text-sm focus:border-primary outline-none transition-colors';

// Reconstructs a section's body text from its parsed blocks. Blocks are
// joined with a blank line, except a subheading is kept glued to the block
// right after it (no blank line) since parseTerms treats a bullet list
// immediately following a short non-bullet line as belonging to that
// subheading either way — this just keeps round-tripped text looking the
// way an admin would naturally type it.
function blocksToBody(blocks: TermsBlock[]): string {
  return blocks.reduce((out, block, i) => {
    const text = block.type === 'bullets' ? block.items.map(item => `- ${item}`).join('\n') : block.text;
    if (i === 0) return text;
    const prevIsSubheading = blocks[i - 1].type === 'subheading';
    return out + (prevIsSubheading ? '\n' : '\n\n') + text;
  }, '');
}

function parseToSections(raw: string): EditableSection[] {
  return parseTerms(raw).map(s => ({ title: s.title, body: blocksToBody(s.blocks) }));
}

function sectionsToRaw(sections: EditableSection[]): string {
  return sections.map((s, i) => `${i + 1}. ${s.title}\n${s.body}`).join('\n\n');
}

export default function TermsEditor({ value, onChange }: TermsEditorProps) {
  const [sections, setSections] = useState<EditableSection[]>(() => parseToSections(value));

  // Only reparse from the incoming raw string when it changes for a reason
  // other than our own onChange (e.g. switching which trip is being
  // edited) — otherwise every keystroke would round-trip through the
  // parser and could reformat text out from under the admin as they type.
  const lastEmitted = useRef(value);
  useEffect(() => {
    if (value !== lastEmitted.current) {
      setSections(parseToSections(value));
      lastEmitted.current = value;
    }
  }, [value]);

  const emit = (next: EditableSection[]) => {
    setSections(next);
    const raw = sectionsToRaw(next);
    lastEmitted.current = raw;
    onChange(raw);
  };

  const updateSection = (index: number, patch: Partial<EditableSection>) => {
    emit(sections.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const addSection = () => {
    emit([...sections, { title: '', body: '' }]);
  };

  const removeSection = (index: number) => {
    emit(sections.filter((_, i) => i !== index));
  };

  const moveSection = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= sections.length) return;
    const copy = [...sections];
    [copy[index], copy[target]] = [copy[target], copy[index]];
    emit(copy);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-sm font-medium text-dark">Terms & Conditions</label>
        <button
          type="button"
          onClick={addSection}
          className="flex items-center gap-1 text-xs font-button font-semibold text-primary hover:text-primary/80 transition-colors"
        >
          <Plus size={14} /> Add Section
        </button>
      </div>
      <p className="text-xs text-dark-muted mb-3">
        Shown to participants on the booking form for this trip — they must tick a checkbox agreeing to these before
        they can submit an enquiry. Sections are numbered automatically; start a line in the body with "- " for a bullet point.
      </p>

      {sections.length === 0 ? (
        <p className="text-sm text-dark-muted bg-background-warm rounded-lg px-4 py-3">No terms yet. Click "Add Section" to build the policy.</p>
      ) : (
        <div className="space-y-3">
          {sections.map((section, index) => (
            <div key={index} className="bg-background-warm rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-button font-bold text-primary shrink-0">Section {index + 1}</span>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => moveSection(index, -1)} disabled={index === 0} className="p-1 rounded-md hover:bg-white disabled:opacity-30 text-dark-muted transition-colors" title="Move up">
                    <ChevronUp size={14} />
                  </button>
                  <button type="button" onClick={() => moveSection(index, 1)} disabled={index === sections.length - 1} className="p-1 rounded-md hover:bg-white disabled:opacity-30 text-dark-muted transition-colors" title="Move down">
                    <ChevronDown size={14} />
                  </button>
                  <button type="button" onClick={() => removeSection(index)} className="p-1 rounded-md hover:bg-red-50 text-dark-muted hover:text-red-600 transition-colors" title="Remove section">
                    <X size={14} />
                  </button>
                </div>
              </div>
              <input
                value={section.title}
                onChange={e => updateSection(index, { title: e.target.value })}
                placeholder="Section title, e.g. Payment Terms"
                className={inputClass}
              />
              <textarea
                value={section.body}
                onChange={e => updateSection(index, { body: e.target.value })}
                placeholder={'Section text. Start a line with "- " for a bullet point.'}
                rows={4}
                className={`${inputClass} resize-y font-mono text-xs leading-relaxed`}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
