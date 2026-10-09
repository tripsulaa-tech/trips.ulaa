import { supabase } from '../supabase';

// =============================================
// Editable game content (Admin -> Games)
// =============================================
// Each game's questions / prompts / word lists can be replaced from the admin
// panel. The edits live in the existing `site_content` table under keys like
// "game:truth-or-dare" (public read, admin write), so no migration is needed.
// When a key has no row, or the row can't be read, every game simply keeps the
// content that ships with the app, so a missing or broken row never stops a game.

export type GameContentKey = 'truth-or-dare' | 'charades-tamil' | 'stowaway' | 'twin-prompts';

const PREFIX = 'game:';
const dbKey = (key: GameContentKey) => `${PREFIX}${key}`;

const cache = new Map<string, unknown>();
let inflight: Promise<void> | null = null;

/** Reads every saved game row in one query (once per page load, shared by all games). */
export function loadGameContent(force = false): Promise<void> {
  if (inflight && !force) return inflight;
  inflight = (async () => {
    const { data, error } = await supabase.from('site_content').select('key, content').like('key', `${PREFIX}%`);
    if (error) throw error;
    cache.clear();
    for (const row of data ?? []) cache.set(row.key as string, row.content);
  })();
  // A failed read must not stick: the next caller tries again.
  inflight.catch(() => { inflight = null; });
  return inflight;
}

/** The saved content for a game, or undefined when none was saved (or it hasn't loaded yet). */
export function getCachedGameContent(key: GameContentKey): unknown {
  return cache.get(dbKey(key));
}

export async function saveGameContent(key: GameContentKey, content: unknown): Promise<void> {
  const { error } = await supabase.from('site_content').upsert({ key: dbKey(key), content }, { onConflict: 'key' });
  if (error) throw error;
  cache.set(dbKey(key), content);
}

/** Removes the saved edits so the game goes back to its built-in content. */
export async function resetGameContent(key: GameContentKey): Promise<void> {
  const { error } = await supabase.from('site_content').delete().eq('key', dbKey(key));
  if (error) throw error;
  cache.delete(dbKey(key));
}
