import { useCallback, useEffect, useRef, useState } from 'react';
import { getWaitlistEntries } from '../../services/api';
import type { WaitlistEntry } from '../../types/types-index';

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; entries: WaitlistEntry[] };

/** Loads the full waitlist once, the first time a traveller profile is
 *  opened (`enabled` flips true) — not on every Travellers page visit, since
 *  most visits never open a profile. The result is kept for the life of the
 *  page, so flicking between travellers with the panel's prev/next buttons
 *  doesn't refetch. `retry` re-runs a failed load. */
export function useTravellerWaitlist(enabled: boolean) {
  // 'idle' and 'loading' look the same to the panel (a skeleton), so the
  // first load doesn't need to set 'loading' itself — it only starts the fetch.
  const [state, setState] = useState<State>({ status: 'idle' });
  const started = useRef(false);

  const fetchEntries = useCallback(() => {
    getWaitlistEntries()
      .then(entries => setState({ status: 'ready', entries }))
      .catch(err => {
        console.error(err);
        setState({ status: 'error' });
      });
  }, []);

  useEffect(() => {
    if (!enabled || started.current) return;
    started.current = true;
    fetchEntries();
  }, [enabled, fetchEntries]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    fetchEntries();
  }, [fetchEntries]);

  return { state, retry };
}
