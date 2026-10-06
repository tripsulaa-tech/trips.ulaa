// Unsaved-work keeper for the admin editors: a draft is written to sessionStorage while it
// differs from what is saved, restored when the page is opened again (same browser tab), and
// removed on save or discard. Storage problems (private mode, quota) are ignored on purpose:
// the editor then simply behaves as it did before.

const PREFIX = 'ulaa.draft.';

export function readDraft<T>(key: string): T | null {
  try {
    const raw = window.sessionStorage.getItem(PREFIX + key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

export function writeDraft(key: string, value: unknown) {
  try {
    window.sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function clearDraft(key: string) {
  try {
    window.sessionStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}
