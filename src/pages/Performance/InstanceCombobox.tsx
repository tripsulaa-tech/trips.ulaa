import { useMemo, useRef, useState } from 'react';
import { INSTANCES } from './instanceUtils';
import { useClickOutsideAndEscape } from '@/lib/useClickOutsideAndEscape';

interface InstanceComboboxProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Free-type autocomplete for the Instance column. Ported from the legacy
 * "ci-combo" searchable combobox (js/dashboards/performance.js ~L1016) —
 * unlike SearchableSelect elsewhere in this app, this accepts arbitrary
 * typed text (the dropdown is suggestions, not a closed option set).
 *
 * Like SearchableSelect, the dropdown panel here renders inline
 * (absolutely positioned) rather than body-portaled like the legacy
 * version — same visual behavior for this app's layout.
 *
 * NOTE: this value is never persisted to the server. In the legacy app an
 * instance-only edit is pure client-side state that's lost on reload
 * (see the "instance-only change, no server call needed" comment in
 * saveAllChanges()) — preserved here for parity, not an oversight.
 */
export function InstanceCombobox({ value, onChange }: InstanceComboboxProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return INSTANCES.slice(0, 40);
    return INSTANCES.filter((i) => i.toLowerCase().includes(q)).slice(0, 60);
  }, [value]);

  useClickOutsideAndEscape(rootRef, open, () => setOpen(false));

  return (
    <div ref={rootRef} className="relative w-[140px]">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder="Search instance…"
        autoComplete="off"
        spellCheck={false}
        className="h-7 w-full rounded-sm border border-border-mid bg-bg-input px-1.5 pr-5 text-[11px] text-text-primary outline-none focus:border-ibm-blue-50"
      />
      <svg
        width="9"
        height="9"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-text-tertiary"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-[220px] w-full min-w-[160px] overflow-y-auto rounded-sm border border-border-mid bg-bg-ui py-1 shadow-lg">
          {matches.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-text-tertiary">No matches</div>
          ) : (
            matches.map((inst) => (
              <button
                key={inst}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault(); // keep focus on input, don't blur before click registers
                  onChange(inst);
                  setOpen(false);
                }}
                className={`block w-full px-2.5 py-1 text-left text-[11px] hover:bg-bg-hover ${
                  inst === value ? 'bg-bg-selected font-medium text-ibm-blue-60' : 'text-text-primary'
                }`}
              >
                {inst}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
