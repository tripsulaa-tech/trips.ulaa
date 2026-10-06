import { useCallback, useSyncExternalStore } from 'react';

/** Rows-per-page choices for the admin tables. */
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 10;

const CHANGE_EVENT = 'admin-page-size-change';
const storageKey = (key: string) => `admin-page-size:${key}`;
// Fallback when browser storage is blocked, so the choice still works for the current visit.
const memory: Record<string, number> = {};

function read(key: string): number {
  if (memory[key]) return memory[key];
  try {
    const n = Number(window.localStorage.getItem(storageKey(key)));
    return (PAGE_SIZE_OPTIONS as readonly number[]).includes(n) ? n : DEFAULT_PAGE_SIZE;
  } catch {
    return DEFAULT_PAGE_SIZE;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** Rows per page for one admin table, remembered in this browser. The page's data hook and the
 *  "Rows" selector in the table header both call this with the same key and stay in sync. */
export function useAdminPageSize(key: string): readonly [number, (size: number) => void] {
  const size = useSyncExternalStore(subscribe, () => read(key), () => DEFAULT_PAGE_SIZE);
  const setSize = useCallback((next: number) => {
    memory[key] = next;
    try { window.localStorage.setItem(storageKey(key), String(next)); } catch { /* storage unavailable */ }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, [key]);
  return [size, setSize] as const;
}
