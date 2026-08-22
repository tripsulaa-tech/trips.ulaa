import { supabase } from '../supabase';
import type { GalleryImage } from '../../types/types-index';

// =============================================
// Gallery
// =============================================
export async function getGalleryImages(): Promise<GalleryImage[]> {
  const { data, error } = await supabase
    .from('gallery')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function addGalleryImage(imageUrl: string, sortOrder = 0): Promise<GalleryImage> {
  const { data, error } = await supabase
    .from('gallery')
    .insert({ image_url: imageUrl, sort_order: sortOrder })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteGalleryImage(id: string): Promise<void> {
  const { error } = await supabase.from('gallery').delete().eq('id', id);
  if (error) throw error;
}

export async function updateGalleryFeatured(id: string, isFeatured: boolean): Promise<void> {
  const { error } = await supabase
    .from('gallery')
    .update({ is_featured: isFeatured })
    .eq('id', id);
  if (error) throw error;
}

export async function updateGalleryOrder(id: string, sortOrder: number): Promise<void> {
  const { error } = await supabase
    .from('gallery')
    .update({ sort_order: sortOrder })
    .eq('id', id);
  if (error) throw error;
}
