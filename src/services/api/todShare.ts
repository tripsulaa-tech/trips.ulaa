import { supabase } from '../supabase';

// Short share links for Truth or Dare (see
// supabase/migration/add_truth_or_dare_share_links.sql). Creating and updating
// are admin-only on the database side; opening a link by its code is public.

export interface TodShare {
  players: string[];
  tripTitle: string;
}

/** Saves the players under a new 4-character code and returns it. */
export async function createTodShare(players: string[], tripTitle: string): Promise<string> {
  const { data, error } = await supabase.rpc('tod_create_share', { p_players: players, p_trip_title: tripTitle });
  if (error) throw error;
  if (typeof data !== 'string' || !data) throw new Error('No code returned');
  return data;
}

/** Swaps the players on an existing link. False if the code no longer exists. */
export async function updateTodShare(code: string, players: string[], tripTitle: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('tod_update_share', { p_code: code, p_players: players, p_trip_title: tripTitle });
  if (error) throw error;
  return data === true;
}

/** Loads a shared link's players. Null when the code is unknown or expired. */
export async function getTodShare(code: string): Promise<TodShare | null> {
  const { data, error } = await supabase.rpc('tod_get_share', { p_code: code });
  if (error) throw error;
  if (!data || typeof data !== 'object') return null;
  const row = data as { players?: unknown; trip_title?: unknown };
  const players = Array.isArray(row.players) ? row.players.filter((n): n is string => typeof n === 'string') : [];
  if (players.length < 2) return null;
  return { players, tripTitle: typeof row.trip_title === 'string' ? row.trip_title : '' };
}
