import { supabase } from '../supabase';

// =============================================
// Site Content (editable copy for pages like About)
// =============================================
export async function getSiteContent<T = unknown>(key: string): Promise<T | null> {
  const { data, error } = await supabase
    .from('site_content')
    .select('content')
    .eq('key', key)
    .maybeSingle();
  if (error || !data) return null;
  return data.content as T;
}

export async function upsertSiteContent(key: string, content: unknown): Promise<void> {
  const { error } = await supabase
    .from('site_content')
    .upsert({ key, content }, { onConflict: 'key' });
  if (error) throw error;
}
