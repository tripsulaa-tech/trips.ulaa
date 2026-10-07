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
// Second hardening pass: "logged in" is still not "admin" — anyone able to
// sign up through the public Auth API would pass that check and could then
// send phishing email from this domain. The function now also requires the
// caller to be listed in public.admins (public.is_admin() RPC, see
// supabase/migration/add_admin_allowlist_and_hardening.sql), and validates the
// recipient address, subject length and attachment size.
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

  // Must be an actual admin, not just any signed-in account. The RPC runs
  // with the caller's own token, so is_admin() sees auth.uid() = the caller.
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: isAdmin, error: adminError } = await userClient.rpc('is_admin');
  if (adminError || isAdmin !== true) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
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

  // Basic shape / size limits so even an admin session can't be turned into a
  // bulk or oversized mail relay by a stolen token.
  const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;
  const MAX_SUBJECT_CHARS = 200;
  const MAX_HTML_CHARS = 500_000;
  // Invoice PDFs embed the logo and footer banner images and can be several MB.
  // Resend allows 40 MB per email (after base64 encoding), so cap safely below
  // that: 28M base64 characters is about a 21 MB file.
  const MAX_ATTACHMENT_BASE64_CHARS = 28_000_000;
  let invalidField: string | null = null;
  if (typeof payload.to !== 'string' || !EMAIL_RE.test(payload.to.trim()) || payload.to.length > 254) {
    invalidField = 'to';
  } else if (
    typeof payload.subject !== 'string' ||
    payload.subject.length > MAX_SUBJECT_CHARS ||
    /[\r\n]/.test(payload.subject)
  ) {
    invalidField = 'subject';
  } else if (typeof payload.html !== 'string' || payload.html.length > MAX_HTML_CHARS) {
    invalidField = 'html';
  } else if (
    payload.attachmentBase64 !== undefined &&
    (typeof payload.attachmentBase64 !== 'string' || payload.attachmentBase64.length > MAX_ATTACHMENT_BASE64_CHARS)
  ) {
    invalidField = 'attachmentBase64';
  }
  if (invalidField) {
    const detail =
      invalidField === 'attachmentBase64' && typeof payload.attachmentBase64 === 'string'
        ? `attachment is about ${(payload.attachmentBase64.length * 0.75 / 1_000_000).toFixed(1)} MB, limit is about ${(MAX_ATTACHMENT_BASE64_CHARS * 0.75 / 1_000_000).toFixed(0)} MB`
        : undefined;
    return new Response(JSON.stringify({ error: 'Invalid email payload', field: invalidField, detail }), {
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
    to: [payload.to.trim()],
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
