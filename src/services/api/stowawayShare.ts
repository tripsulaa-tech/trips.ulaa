import { supabase } from '../supabase';

// Short share links for Stowaway (see
// supabase/migration/add_stowaway_share_links.sql). Creating and updating are
// admin-only on the database side; opening a link by its code is public.

export interface StowawayShare {
  players: string[];
  tripTitle: string;
}

/** Saves the players under a new 4-character code and returns it. */
export async function createStowawayShare(players: string[], tripTitle: string): Promise<string> {
  const { data, error } = await supabase.rpc('stowaway_create_share', { p_players: players, p_trip_title: tripTitle });
  if (error) throw error;
  if (typeof data !== 'string' || !data) throw new Error('No code returned');
  return data;
}

/** Swaps the players on an existing link. False if the code no longer exists. */
export async function updateStowawayShare(code: string, players: string[], tripTitle: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('stowaway_update_share', { p_code: code, p_players: players, p_trip_title: tripTitle });
  if (error) throw error;
  return data === true;
}

/** Loads a shared link's players. Null when the code is unknown or expired. */
export async function getStowawayShare(code: string): Promise<StowawayShare | null> {
  const { data, error } = await supabase.rpc('stowaway_get_share', { p_code: code });
  if (error) throw error;
  if (!data || typeof data !== 'object') return null;
  const row = data as { players?: unknown; trip_title?: unknown };
  const players = Array.isArray(row.players) ? row.players.filter((n): n is string => typeof n === 'string') : [];
  if (players.length < 3) return null;
  return { players, tripTitle: typeof row.trip_title === 'string' ? row.trip_title : '' };
}

// ── Host codes (see supabase/migration/add_stowaway_host_codes.sql) ──
// One code per trip lets travellers host their own online room until the day
// after the trip ends. Making, reading and revoking are admin-only.

export interface StowawayHostCode {
  /** 8 characters, no dash. */
  code: string;
  expiresAt: string;
  openRooms: number;
}

function toHostCode(data: unknown): StowawayHostCode | null {
  if (!data || typeof data !== 'object') return null;
  const row = data as { code?: unknown; expires_at?: unknown; open_rooms?: unknown };
  if (typeof row.code !== 'string' || typeof row.expires_at !== 'string') return null;
  return { code: row.code, expiresAt: row.expires_at, openRooms: typeof row.open_rooms === 'number' ? row.open_rooms : 0 };
}

/** The trip's current host code, or null if none (or expired / revoked). */
export async function getStowawayHostCode(tripId: string): Promise<StowawayHostCode | null> {
  const { data, error } = await supabase.rpc('stowaway_get_host_code', { p_trip_id: tripId });
  if (error) throw error;
  return toHostCode(data);
}

/** Makes a new host code for the trip; any earlier one stops working. */
export async function makeStowawayHostCode(tripId: string): Promise<StowawayHostCode> {
  const { data, error } = await supabase.rpc('stowaway_make_host_code', { p_trip_id: tripId });
  if (error) throw error;
  const made = toHostCode(data);
  if (!made) throw new Error('No code returned');
  return made;
}

export async function revokeStowawayHostCode(tripId: string): Promise<void> {
  const { error } = await supabase.rpc('stowaway_revoke_host_code', { p_trip_id: tripId });
  if (error) throw error;
}
