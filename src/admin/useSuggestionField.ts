import { useState } from 'react';

/**
 * Wires up a single suggestion dropdown (city or email-domain autofill) for
 * a text field — the boilerplate (open flag + suggestion list + input/select
 * handlers) was previously copy-pasted, once per field, across
 * AdminEditTravellerModal, AdminAddEnquiryModal's solo form, and
 * AdminEnquiryTravellerCard's inline edit. Each of those wires the same
 * shape to a *different* form's setter, so this takes that setter — really
 * "apply the picked value" — as `onSelect` rather than owning any form state
 * itself.
 *
 * `getSuggestions` is `getCitySuggestions` or `getEmailSuggestions` (see
 * AdminEnquiriesShared). `onSelect` should both write the value into the
 * caller's form and mark the field touched, e.g.:
 *   useSuggestionField(getCitySuggestions, city => {
 *     setForm(f => ({ ...f, city }));
 *     setTouched(true);
 *   })
 *
 * For a per-row field in a repeated list (see useIndexedSuggestionField
 * below), use that instead — only one row's dropdown can be open at a time,
 * which needs an index rather than a plain boolean.
 */
export function useSuggestionField(getSuggestions: (value: string) => string[], onSelect: (value: string) => void) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const handleInput = (value: string) => {
    const matches = getSuggestions(value);
    setSuggestions(matches);
    setOpen(matches.length > 0);
  };

  const select = (value: string) => {
    onSelect(value);
    setOpen(false);
  };

  const close = () => setOpen(false);

  return { open, suggestions, handleInput, select, close };
}

/**
 * Same as useSuggestionField, but for a field repeated once per row in a
 * list (e.g. AdminAddEnquiryModal's per-seat waitlist-conversion form) —
 * tracks *which* row's dropdown is open (or none) instead of a single
 * open/closed flag, since only one row's suggestions are ever shown at a
 * time. `onSelect` receives the row index alongside the picked value so it
 * can route the write to that row (e.g. `updateWaitlistPerson(i, { city })`).
 */
export function useIndexedSuggestionField(
  getSuggestions: (value: string) => string[],
  onSelect: (index: number, value: string) => void,
) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const handleInput = (index: number, value: string) => {
    const matches = getSuggestions(value);
    setSuggestions(matches);
    setOpenIndex(matches.length > 0 ? index : null);
  };

  const select = (index: number, value: string) => {
    onSelect(index, value);
    setOpenIndex(null);
  };

  const close = () => setOpenIndex(null);

  return { openIndex, suggestions, handleInput, select, close };
}
