import type { KeyboardEvent } from 'react';

// Down/Up move a highlighted row (wrapping at either end), Enter picks
// whichever row is highlighted, and Escape dismisses the list without
// changing the field. A no-op whenever the dropdown isn't open, so it
// never interferes with normal typing or submitting the form.
//
// Shared by BookingForm.tsx (email + city fields) and AdminLogin.tsx
// (email field), which previously each kept their own copy of this exact
// logic. Pairs with the KeyboardNavSuggestionDropdown component in this
// same folder.
export function handleSuggestionKeyDown(
  e: KeyboardEvent<HTMLInputElement>,
  items: string[],
  isOpen: boolean,
  activeIndex: number,
  setActiveIndex: (index: number) => void,
  onSelect: (value: string) => void,
  setOpen: (open: boolean) => void
) {
  if (!isOpen || items.length === 0) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    setActiveIndex((activeIndex + 1) % items.length);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    setActiveIndex(activeIndex <= 0 ? items.length - 1 : activeIndex - 1);
  } else if (e.key === 'Enter') {
    if (activeIndex >= 0) {
      e.preventDefault();
      onSelect(items[activeIndex]);
    }
  } else if (e.key === 'Escape') {
    setOpen(false);
  }
}
