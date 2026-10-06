import { supabase } from '../services/supabase';

// Travel Cards settings (edited names, back-of-card wording, badge and card-size options) are
// kept in one admin-only row of `travel_card_settings` (supabase/migration/add_travel_card_settings.sql)
// so every admin sees the same values. The browser's localStorage stays as an instant local copy
// and as the fallback until that migration has been run, so nothing is lost either way.

const TABLE = 'travel_card_settings';
const ROW = 'shared';

type Settings = Record<string, unknown>;

const pending: Settings = {};
let timer: number | undefined;

async function flush() {
  timer = undefined;
  const changes = { ...pending };
  for (const k of Object.keys(changes)) delete pending[k];
  if (Object.keys(changes).length === 0) return;
  try {
    // Merge into what is saved now so one admin's edit never wipes another section.
    const { data, error: readError } = await supabase.from(TABLE).select('content').eq('key', ROW).maybeSingle();
    if (readError) throw readError;
    const merged = { ...((data?.content as Settings | undefined) ?? {}), ...changes };
    const { error } = await supabase.from(TABLE).upsert({ key: ROW, content: merged }, { onConflict: 'key' });
    if (error) throw error;
  } catch (err) {
    console.warn('Travel card settings were saved in this browser only.', err);
  }
}

/** Remembers `value` under `key` in this browser right away and for all admins a moment later. */
export function saveSetting(key: string, value: unknown) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  pending[key] = value;
  if (timer !== undefined) window.clearTimeout(timer);
  timer = window.setTimeout(() => { void flush(); }, 700);
}

/** The shared settings, or null when they can't be read (offline, or the table doesn't exist yet).
 *  Values that exist only in this browser (saved before sharing existed) are uploaded once. */
export async function loadSharedSettings(keys: string[]): Promise<Settings | null> {
  try {
    const { data, error } = await supabase.from(TABLE).select('content').eq('key', ROW).maybeSingle();
    if (error) return null;
    const remote = (data?.content as Settings | undefined) ?? {};
    for (const key of keys) {
      if (remote[key] !== undefined) {
        try { window.localStorage.setItem(key, JSON.stringify(remote[key])); } catch { /* storage unavailable */ }
        continue;
      }
      try {
        const raw = window.localStorage.getItem(key);
        if (raw) saveSetting(key, JSON.parse(raw));
      } catch { /* ignore unreadable local copy */ }
    }
    return remote;
  } catch {
    return null;
  }
}
