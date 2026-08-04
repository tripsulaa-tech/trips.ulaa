import { supabase } from './supabase';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

// =============================================
// Realtime (live) subscriptions
// =============================================
// Thin wrapper around Supabase's "postgres_changes" Realtime feature, used
// to push DB changes (likes, publish/draft toggles, coming-soon toggles,
// etc.) straight to anyone already looking at the affected page — no
// refresh needed.
//
// For this to actually deliver events two things must be true on the DB
// side (see supabase/enable_realtime.sql):
//   1. The table is added to the `supabase_realtime` publication.
//   2. The table has REPLICA IDENTITY FULL, so UPDATE/DELETE payloads
//      include full old-row data (needed for correct filtering).
//
// RLS caveat: completed_trips and upcoming_trips are both gated by a
// "Public read ... using (is_published = true)" policy. Realtime enforces
// that same policy per change, checked against the *new* row for
// INSERT/UPDATE and the *old* row for DELETE. In practice that means an
// anonymous visitor's live feed:
//   - DOES get notified the instant an admin publishes a draft
//     (is_published false -> true — the new row now passes the policy),
//   - DOES get notified if a published trip/album is deleted
//     (the old row passed the policy),
//   - will NOT get a push the instant something is unpublished
//     (true -> false), since the new row no longer satisfies the public
//     policy and Realtime won't forward that change to a public/anon
//     subscriber. Pages that list trips re-fetch from the server on every
//     received event (not just patch state locally), so they still
//     self-correct as soon as *any* other change comes in — this is just
//     a platform limitation on the exact instant an unpublish alone is
//     reflected.

type Payload<T extends Record<string, unknown> = Record<string, unknown>> =
  RealtimePostgresChangesPayload<T>;

// Subscribes to every INSERT/UPDATE/DELETE on `table` (optionally narrowed
// with a Postgres-changes filter string, e.g. `id=eq.${id}`). Returns an
// unsubscribe function — always call it on cleanup (e.g. a useEffect
// return) to avoid leaking open sockets/channels.
export function subscribeToTable<T extends Record<string, unknown> = Record<string, unknown>>(
  table: string,
  onChange: (payload: Payload<T>) => void,
  filter?: string
): () => void {
  const channelName = `${table}-changes-${filter ?? 'all'}-${Math.random().toString(36).slice(2)}`;
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
      (payload) => onChange(payload as Payload<T>)
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
