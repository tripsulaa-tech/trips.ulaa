import { supabase } from '../supabase';
import type { TripLeader } from '../../types/types-index';

// =============================================
// Trip Leaders
// =============================================
export async function getTripLeaders(): Promise<TripLeader[]> {
  const { data, error } = await supabase
    .from('trip_leaders')
    .select('*')
    .eq('is_published', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getAllTripLeadersAdmin(): Promise<TripLeader[]> {
  const { data, error } = await supabase
    .from('trip_leaders')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createTripLeader(tripLeader: Partial<TripLeader>): Promise<TripLeader> {
  const { data, error } = await supabase
    .from('trip_leaders')
    .insert(tripLeader)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTripLeader(id: string, tripLeader: Partial<TripLeader>): Promise<TripLeader> {
  const { data, error } = await supabase
    .from('trip_leaders')
    .update(tripLeader)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTripLeader(id: string): Promise<void> {
  const { error } = await supabase.from('trip_leaders').delete().eq('id', id);
  if (error) throw error;
}
