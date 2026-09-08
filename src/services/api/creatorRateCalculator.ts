import { supabase } from '../supabase';
import type { CreatorRateCalculation, CreatorRateCalculationInput } from '../../types/types-index';

// =============================================
// Creator Rate Calculator
// =============================================
// Admin: every saved run, newest first. Small, unbounded list for now —
// the same pattern getWaitlistEntries uses; add pagination here if this
// ever grows large enough to matter.
export async function getCreatorRateCalculations(): Promise<CreatorRateCalculation[]> {
  const { data, error } = await supabase
    .from('creator_rate_calculations')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// Admin: persist a calculator run. Inputs and every derived output are
// saved together (see add_creator_rate_calculations.sql) so this row
// stays an accurate record of what the creator was actually quoted, even
// if the calculator's benchmarks change later.
export async function saveCreatorRateCalculation(calc: CreatorRateCalculationInput): Promise<CreatorRateCalculation> {
  const { data, error } = await supabase
    .from('creator_rate_calculations')
    .insert(calc)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCreatorRateCalculation(id: string): Promise<void> {
  const { error } = await supabase.from('creator_rate_calculations').delete().eq('id', id);
  if (error) throw error;
}
