// supabase/functions/send-push/index.ts
//
// Deploy with:  supabase functions deploy send-push --no-verify-jwt
// Then set secrets:
//   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@ulaa.app EDGE_FUNCTION_SECRET=...
//
// Called by the DB trigger (notify_new_enquiry) with a JSON body:
//   { "title": "...", "body": "...", "link": "/admin/enquiries" }

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com';
const EDGE_FUNCTION_SECRET = Deno.env.get('EDGE_FUNCTION_SECRET')!;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  // Simple shared-secret check — the DB trigger sends this header.
  const authHeader = req.headers.get('Authorization');
  if (authHeader !== `Bearer ${EDGE_FUNCTION_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  let payload: { title: string; body: string; link?: string };
  try {
    payload = await req.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  if (!payload.title) {
    return new Response('Missing "title" field', { status: 400 });
  }

  const { data: subs, error } = await supabaseAdmin.from('push_subscriptions').select('*');
  if (error) {
    return new Response(`DB error: ${error.message}`, { status: 500 });
  }
  if (!subs || subs.length === 0) {
    return new Response(JSON.stringify({ sent: 0, note: 'No subscriptions yet' }), { status: 200 });
  }

  const results = await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title: payload.title, body: payload.body, link: payload.link ?? '/admin' })
      )
    )
  );

  // Clean up subscriptions that are no longer valid (410 Gone / 404 Not Found).
  const stale: string[] = [];
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      const statusCode = result.reason?.statusCode;
      if (statusCode === 410 || statusCode === 404) stale.push(subs[i].id);
    }
  });
  if (stale.length > 0) {
    await supabaseAdmin.from('push_subscriptions').delete().in('id', stale);
  }

  const sent = results.filter((r) => r.status === 'fulfilled').length;
  return new Response(JSON.stringify({ sent, failed: results.length - sent, cleaned: stale.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
