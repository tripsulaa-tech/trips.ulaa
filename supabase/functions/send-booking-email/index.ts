// supabase/functions/send-booking-email/index.ts
//
// Sends the booking confirmation email for real, via Resend's API.
//
// Security audit fix: this function used to rely entirely on Supabase's
// platform-level `verify_jwt` (the default for a function deployed without
// `--no-verify-jwt`) to keep this "admin-only". That check only verifies
// that *some* valid project JWT was presented — and the public anon key
// (shipped in every client bundle and in .env) IS a valid JWT. So the
// function was reachable by anyone on the internet, not just logged-in
// admins, letting them send arbitrary email (with an arbitrary HTML body
// and attachment) through this site's Resend account/domain. This function
// now independently verifies the caller's token belongs to a real,
// logged-in Supabase Auth user before doing anything else.
//
// One-time setup:
//   1. Create a Resend account (resend.com) and verify a sending domain —
//      Resend's free tier (3,000 emails/mo, 100/day) is enough for ULAA's
//      volume, but a *verified domain* is required to send to anyone other
//      than your own Resend account email. Add the DNS records Resend
//      gives you (SPF/DKIM, usually a couple of TXT/CNAME records) at
//      whatever registrar/DNS host manages ulaatrips.com.
//   2. Grab an API key from the Resend dashboard.
//   3. Set secrets and deploy:
//        supabase secrets set RESEND_API_KEY=re_xxx RESEND_FROM_EMAIL="Ulaa Trips <bookings@ulaatrips.com>"
//        supabase functions deploy send-booking-email
//
// Called by src/utils/bookingEmail.ts with a JSON body:
//   { "to": "...", "subject": "...", "html": "...",
//     "attachmentBase64": "...", "attachmentFilename": "Invoice-....pdf" }

import { createClient } from 'npm:@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
// Falls back to Resend's own shared test sender so the function doesn't
// crash if this hasn't been configured yet — but that sender can only
// deliver to the Resend account's own verified email, so real customer
// sends need RESEND_FROM_EMAIL set to an address on a verified domain.
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? 'Ulaa Trips <onboarding@resend.dev>';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

// Locked to the real site origin instead of '*' — this function is only
// ever called from the admin panel running on this domain (or localhost
// during development), never from an arbitrary third-party page.
const ALLOWED_ORIGINS = new Set([
  'https://www.ulaatrips.com',
  'https://ulaatrips.com',
  'http://localhost:5173',
]);

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://www.ulaatrips.com',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    Vary: 'Origin',
  };
}

interface SendBookingEmailBody {
  to: string;
  subject: string;
  html: string;
  attachmentBase64?: string;
  attachmentFilename?: string;
}

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // --- Auth check -----------------------------------------------------
  // Verify the caller is a real, logged-in Supabase Auth user (an admin),
  // not just anyone holding the public anon key. Platform `verify_jwt`
  // alone does not make this distinction (see comment above).
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  // --- End auth check ---------------------------------------------------

  let payload: SendBookingEmailBody;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!payload.to || !payload.subject || !payload.html) {
    return new Response(JSON.stringify({ error: 'Missing "to", "subject", or "html"' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY is not configured on the server' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const resendPayload: Record<string, unknown> = {
    from: RESEND_FROM_EMAIL,
    to: [payload.to],
    subject: payload.subject,
    html: payload.html,
  };

  if (payload.attachmentBase64 && payload.attachmentFilename) {
    resendPayload.attachments = [
      { filename: payload.attachmentFilename, content: payload.attachmentBase64 },
    ];
  }

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(resendPayload),
  });

  const resendBody = await resendResponse.text();

  if (!resendResponse.ok) {
    return new Response(JSON.stringify({ error: 'Resend rejected the send', detail: resendBody }), {
      status: resendResponse.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(resendBody, {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
