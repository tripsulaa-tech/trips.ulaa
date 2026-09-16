// Keyboard-navigable suggestion dropdown — arrow-key highlight plus
// Enter/Escape handling. Previously duplicated in full between
// BookingForm.tsx (email + city fields) and AdminLogin.tsx (email field);
// extracted here as the highlighted-index sibling of the plain
// SuggestionDropdown in this same folder (which has no keyboard highlight
// and is reused by the admin Enquiries/Travellers modals via
// useSuggestionField). Behaviour and styling are unchanged from the
// original call sites. The keydown handler lives in
// ./suggestionKeyNav so this file only exports the component (fast
// refresh requires component-only files).

// Positioned relative to the input's own wrapping div (the caller is
// expected to wrap the input + this dropdown in a `relative` element)
// rather than portalled, since it only ever needs to sit right under a
// short, single-line input.
export default function KeyboardNavSuggestionDropdown({ items, activeIndex, onSelect }: { items: string[]; activeIndex: number; onSelect: (value: string) => void }) {
  return (
    <ul
      role="listbox"
      className="absolute z-20 left-0 right-0 mt-1 max-h-56 overflow-auto app-scroll rounded-lg border-2 border-background-warm bg-white shadow-warm-lg py-1"
    >
      {items.map((item, idx) => (
        <li key={item} role="option" aria-selected={idx === activeIndex}>
          <button
            type="button"
            // onMouseDown (not onClick) fires before the input's onBlur,
            // and preventDefault stops that blur from firing at all — so
            // picking a suggestion never races with the dropdown closing
            // itself out from under the click.
            onMouseDown={e => { e.preventDefault(); onSelect(item); }}
            className={`w-full px-4 py-2 text-sm text-left font-body text-dark transition-colors ${idx === activeIndex ? 'bg-background-warm' : 'hover:bg-background-warm'}`}
          >
            {item}
          </button>
        </li>
      ))}
    </ul>
  );
}
