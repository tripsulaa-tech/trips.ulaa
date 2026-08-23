import { useState, useRef, useEffect } from 'react';

/** Owns the field-search box in the Add/Edit Trip modal's header — scans
 *  every field label / section heading currently rendered inside the modal
 *  (Tabs renders every section in one continuous flow, so everything is
 *  always in the DOM) and scrolls the first text match into view with a
 *  brief highlight flash, debounced as the admin types.
 *
 *  Extracted from AdminTrips.tsx (see that file's git history for the
 *  original single-component version). */
export function useTripModalSearch(modalOpen: boolean) {
  const [modalSearch, setModalSearch] = useState('');
  const [modalSearchNoMatch, setModalSearchNoMatch] = useState(false);
  const modalBodyRef = useRef<HTMLDivElement>(null);

  const handleModalSearch = () => {
    const query = modalSearch.trim().toLowerCase();
    const container = modalBodyRef.current;
    if (!query || !container) {
      setModalSearchNoMatch(false);
      return;
    }
    const candidates = Array.from(container.querySelectorAll<HTMLElement>('label, h4'));
    const match = candidates.find(el => el.textContent?.toLowerCase().includes(query));
    if (!match) {
      setModalSearchNoMatch(true);
      return;
    }
    setModalSearchNoMatch(false);
    match.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const previousBackground = match.style.backgroundColor;
    const previousTransition = match.style.transition;
    match.style.transition = 'background-color 0.3s ease';
    match.style.backgroundColor = '#FDE9D9';
    setTimeout(() => {
      match.style.backgroundColor = previousBackground;
      match.style.transition = previousTransition;
    }, 1500);
  };

  // Runs the field search automatically as the admin types, so there's no
  // separate "Search" button to click — a short debounce avoids jumping/
  // scrolling on every single keystroke. Clearing the box resolves via the
  // same debounced call (handleModalSearch resets the no-match flag itself
  // when the query is empty), so nothing needs to run synchronously here.
  useEffect(() => {
    if (!modalOpen) return;
    const timeout = setTimeout(() => handleModalSearch(), modalSearch.trim() ? 350 : 0);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalSearch, modalOpen]);

  const resetModalSearch = () => {
    setModalSearch('');
    setModalSearchNoMatch(false);
  };

  return { modalSearch, setModalSearch, modalSearchNoMatch, modalBodyRef, resetModalSearch };
}
