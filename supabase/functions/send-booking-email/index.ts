// supabase/functions/send-booking-email/index.ts
//
// Sends the booking confirmation email for real, via Resend's API — the
// admin panel's own auth (Supabase JWT) is enough to call this, since only
// logged-in admins can reach the "Send booking email" button in the first
// place. No shared secret needed, unlike send-push (which is called from a
// DB trigger, not a logged-in user).
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

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
// Falls back to Resend's own shared test sender so the function doesn't
// crash if this hasn't been configured yet — but that sender can only
// deliver to the Resend account's own verified email, so real customer
// sends need RESEND_FROM_EMAIL set to an address on a verified domain.
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? 'Ulaa Trips <onboarding@resend.dev>';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendBookingEmailBody {
  to: string;
  subject: string;
  html: string;
  attachmentBase64?: string;
  attachmentFilename?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

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
