// Quick-help dropdown used by the City/Email suggestion inputs across the
// admin Enquiries/Travellers forms (AdminAddEnquiryModal, AdminEditTravellerModal,
// AdminEnquiryTravellerCard). Previously duplicated verbatim in each of those
// files; extracted here as part of a cleanup pass — behaviour is unchanged.
export default function SuggestionDropdown({ items, onSelect }: { items: string[]; onSelect: (value: string) => void }) {
  return (
    <ul
      role="listbox"
      className="absolute z-20 left-0 right-0 mt-1 max-h-48 overflow-auto rounded-lg border-2 border-background-warm bg-white shadow-lg py-1"
    >
      {items.map(item => (
        <li key={item} role="option">
          <button
            type="button"
            // onMouseDown (not onClick) fires before the input's onBlur, and
            // preventDefault stops that blur from firing at all — so picking
            // a suggestion never races with the dropdown closing itself out
            // from under the click.
            onMouseDown={e => { e.preventDefault(); onSelect(item); }}
            className="w-full px-3 py-1.5 text-sm text-left text-dark hover:bg-background-warm transition-colors"
          >
            {item}
          </button>
        </li>
      ))}
    </ul>
  );
}
