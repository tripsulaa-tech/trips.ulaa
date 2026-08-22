import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase environment variables are missing. Some features may not work.');
}

// Admin edits (trip details, card feature tags, etc.) need to show up on the
// public site immediately. Without this, the browser's default HTTP cache
// can serve a stale response to an identical GET request instead of hitting
// the network, since Supabase's REST API doesn't always send an explicit
// no-store header — so a change made in Admin could take a while to appear.
// Forcing `cache: 'no-store'` on every request makes every read live.
const noStoreFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: 'no-store' });

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  { global: { fetch: noStoreFetch } }
);
