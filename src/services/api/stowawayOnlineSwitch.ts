import { supabase } from '../supabase';

// ── Online switch (see supabase/migration/add_stowaway_online_switch.sql) ──
// Closed by default: only an admin can create an online room. Open: anyone can.

export async function getStowawayOnlineOpen(): Promise<boolean> {
  const { data, error } = await supabase.rpc('stowaway_online_open');
  if (error) throw error;
  return data === true;
}

/** Admin only. Closing also ends every open room. */
export async function setStowawayOnlineOpen(open: boolean): Promise<void> {
  const { error } = await supabase.rpc('stowaway_set_online_open', { p_open: open });
  if (error) throw error;
}
