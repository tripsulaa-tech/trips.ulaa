// Shared dropdown menu used by every filter box in the filter bar — a
// vertical list of options with counts, the selected one highlighted.
// Kept generic so the same component serves Query Status, Payment,
// Booking, Group/Solo, Food, and Source without repeating markup.
export default function FilterDropdown<T extends string>({
  options,
  value,
  onSelect,
  align = 'left',
}: {
  options: { key: T; label: string; count: number; section?: string }[];
  value: T;
  onSelect: (key: T) => void;
  align?: 'left' | 'right';
}) {
  return (
    <div
      className={`absolute top-full ${align === 'right' ? 'right-0' : 'left-0'} mt-2 w-full sm:w-52 bg-white rounded-md shadow-warm-lg border border-background-warm py-1.5 z-30 max-h-72 overflow-y-auto`}
    >
      {options.map((opt, i) => {
        // A section header renders once, right before the first option
        // that belongs to it — e.g. every completed trip gets grouped
        // under one "Completed" label instead of each repeating it.
        const showSectionHeader = !!opt.section && opt.section !== options[i - 1]?.section;
        return (
          <div key={opt.key}>
            {showSectionHeader && (
              <div className="px-3 pt-2.5 pb-1 text-[10px] font-button font-bold text-dark-muted/60 uppercase tracking-wide">
                {opt.section}
              </div>
            )}
            <button
              onClick={() => onSelect(opt.key)}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-button text-left transition-colors ${
                value === opt.key ? 'bg-primary/10 text-primary font-semibold' : 'text-dark-muted hover:bg-background-warm'
              }`}
            >
              <span className="truncate">{opt.label}</span>
              <span className="opacity-60 shrink-0">{opt.count}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
