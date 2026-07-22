# ULAA — Push Notification Setup Guide

This documents how admin push notifications are wired up end-to-end: a new enquiry on the site triggers a database event, which calls a Supabase Edge Function, which sends a web push notification to subscribed admin devices.

---

## 1. Architecture Overview

```
User submits enquiry form
        │
        ▼
INSERT into `enquiries` table
        │
        ▼
Trigger: notify_new_enquiry()
        │
        ├─► INSERT into `notifications` table (in-app notification)
        │
        └─► net.http_post() → Edge Function `send-push`
                     │  (Authorization: Bearer <secret>)
                     ▼
              send-push Edge Function
                     │
                     ├─ Verifies Bearer token === EDGE_FUNCTION_SECRET
                     ├─ Loads subscribed push endpoints
                     ├─ Signs payload with VAPID keys
                     └─ Sends Web Push → browser/device
```

Two secrets systems are involved and must always match:
- **Supabase Vault** (`edge_function_secret`) — read by the Postgres trigger function
- **Edge Function Secrets** (`EDGE_FUNCTION_SECRET`) — read by the `send-push` function itself

---

## 2. Prerequisites — VAPID Keys

Web Push requires a VAPID key pair (used to sign push messages so browsers trust the sender).

Generate once (e.g. via `web-push` CLI or any VAPID generator):
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (a `mailto:` address or URL identifying the sender)

---

## 3. Environment Variables

### Frontend (Vercel — Environment Variables)
| Variable | Notes |
|---|---|
| `VITE_VAPID_PUBLIC_KEY` | Public key, safe to expose to the browser |
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_ANON_KEY` | Anon/public key |

> ⚠️ Watch out for **UTF-8 BOM corruption** when setting Vite env vars from PowerShell — a leading BOM character silently breaks `import.meta.env` reads. Paste values from a plain text editor, not directly from a PowerShell echo.

### Supabase Edge Function Secrets (`Edge Functions → send-push → Secrets`)
| Variable | Notes |
|---|---|
| `EDGE_FUNCTION_SECRET` | Shared secret — must match Vault's `edge_function_secret` |
| `VAPID_PUBLIC_KEY` | |
| `VAPID_PRIVATE_KEY` | |
| `VAPID_SUBJECT` | |

### Supabase Vault (read by DB triggers via SQL, not by the Edge Function)
| Secret name | Notes |
|---|---|
| `edge_function_secret` | Must always match `EDGE_FUNCTION_SECRET` above |

---

## 4. Database Schema

Minimal supporting tables:

```sql
-- In-app notification feed
create table if not exists notifications (
  id bigint generated always as identity primary key,
  type text not null,
  title text not null,
  body text,
  link text,
  created_at timestamptz not null default now(),
  read boolean not null default false
);

-- Push subscription endpoints (one row per subscribed browser/device)
create table if not exists push_subscriptions (
  id bigint generated always as identity primary key,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
```

---

## 5. Database Trigger — `notify_new_enquiry()`

This function runs on `enquiries` INSERT. It writes the in-app notification row, then fires the push via `pg_net`, reading the shared secret from Vault at call time (never hardcoded):

```sql
CREATE OR REPLACE FUNCTION notify_new_enquiry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_secret text;
BEGIN
  INSERT INTO notifications (type, title, body, link)
  VALUES (
    'new_enquiry',
    'New enquiry from ' || NEW.full_name,
    COALESCE(NEW.trip_title, 'General enquiry') || ' · ' || NEW.email,
    '/admin/enquiries'
  );

  -- Fire-and-forget: wrapped so a push failure never rolls back the enquiry insert
  BEGIN
    SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
    WHERE name = 'edge_function_secret';

    PERFORM net.http_post(
      url := 'https://<project-ref>.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_secret
      ),
      body := jsonb_build_object(
        'title', 'New enquiry from ' || NEW.full_name,
        'body', COALESCE(NEW.trip_title, 'General enquiry') || ' · ' || NEW.email,
        'link', '/admin/enquiries'
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'push notify failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- Attach trigger (only needs to be created once; CREATE OR REPLACE on the
-- function above does not require recreating this)
CREATE TRIGGER trg_notify_new_enquiry
AFTER INSERT ON enquiries
FOR EACH ROW
EXECUTE FUNCTION notify_new_enquiry();
```

> **Key lesson learned**: an earlier version of this function had a literal placeholder (`'Bearer <your-secret>'`) instead of a live Vault lookup — meaning it was never actually authenticating correctly. Always confirm the function body performs a live `SELECT ... FROM vault.decrypted_secrets`, not a string literal.

---

## 6. Edge Function — `send-push`

Responsibilities:
1. Reject any request where `Authorization` header ≠ `Bearer ${EDGE_FUNCTION_SECRET}` (401 if mismatched).
2. Read all rows from `push_subscriptions`.
3. Send a Web Push message to each endpoint using the VAPID key pair.
4. Remove subscriptions that report as expired/invalid ("cleaned").
5. Return `{ sent, failed, cleaned }` counts.

Deploy/update secrets via CLI:
```bash
supabase secrets set EDGE_FUNCTION_SECRET=<value> --project-ref <project-ref>
supabase secrets set VAPID_PUBLIC_KEY=<value> VAPID_PRIVATE_KEY=<value> VAPID_SUBJECT=<value> --project-ref <project-ref>
```
Secret changes take effect on the next invocation — no redeploy required.

---

## 7. Frontend — Subscribing a Browser

Typical flow (adapt to your actual service worker file/path):

1. Register a service worker (e.g. `public/sw.js`) that listens for `push` events and displays a `Notification`.
2. On admin login / opt-in, request permission and subscribe:

```ts
const registration = await navigator.serviceWorker.register('/sw.js');
const subscription = await registration.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY),
});

await supabase.from('push_subscriptions').upsert({
  endpoint: subscription.endpoint,
  p256dh: subscription.toJSON().keys.p256dh,
  auth: subscription.toJSON().keys.auth,
});
```

3. In `sw.js`:
```js
self.addEventListener('push', (event) => {
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      data: { link: data.link },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.link));
});
```

---

## 8. Testing & Verification

### A. Manual test (bypasses the DB trigger, tests the Edge Function directly)
```powershell
$headers = @{ "Authorization" = "Bearer <EDGE_FUNCTION_SECRET>"; "Content-Type" = "application/json" }
$body = '{"title":"Manual test","body":"checking secret","link":"/admin"}'
Invoke-RestMethod -Uri "https://<project-ref>.supabase.co/functions/v1/send-push" -Method Post -Headers $headers -Body $body
```
Expect a response like:
```
sent failed cleaned
---- ------ -------
   1      0       0
```

### B. Trigger-fired test (validates the full DB → Edge Function path)
1. Submit a real enquiry through the live site form.
2. Check the most recent `pg_net` response:
```sql
select status_code, content::text, created
from net._http_response
order by created desc
limit 1;
```
Expect `status_code = 200` with a **fresh timestamp** matching your submission time. A `401` means the secret the trigger sends doesn't match what the Edge Function expects — see Troubleshooting.

---

## 9. Rotating the Shared Secret

Do this periodically, or immediately if the secret has been shared/pasted anywhere insecurely.

1. **Generate a new value:**
```powershell
-join ((48..57)+(97..102) | Get-Random -Count 32 | % {[char]$_})
```
2. **Update Vault:**
```sql
select vault.update_secret(
  (select id from vault.secrets where name = 'edge_function_secret'),
  '<new-secret>'
);
```
3. **Update the Edge Function secret** in `Edge Functions → Secrets` (dashboard) or:
```bash
supabase secrets set EDGE_FUNCTION_SECRET=<new-secret> --project-ref <project-ref>
```
4. **Re-verify** using both tests in Section 8 — manual call first, then a real trigger-fired enquiry, checking for a fresh `200` timestamp *after* the secret update time.

---

## 10. Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| Manual test returns 200, trigger-fired test returns 401 | Trigger function has a stale/placeholder secret instead of a live Vault lookup | Inspect with `select prosrc from pg_proc where proname = 'notify_new_enquiry';` — confirm it selects from `vault.decrypted_secrets`, not a hardcoded string |
| `net._http_response` shows an old timestamp after a "fix" | No new event was actually fired since the fix — re-running a `SELECT` doesn't trigger anything | Submit a real enquiry through the live site, not just the verification query |
| `len` in Vault ≠ expected character count | Hidden whitespace/newline from copy-paste | `select vault.update_secret(id, trim('<value>'))`, typing fresh rather than pasting |
| PowerShell 401 even with correct-looking secret | Header variable holds a literal placeholder string (e.g. `"Bearer NEW_SECRET"`) instead of the actual generated value | Substitute the real value into the `$headers` block before running |
| `grep` not recognized in PowerShell | `grep` is a Bash-ism | Use `Select-String` or its alias `sls` instead |

---

## 11. Security Notes
- Never hardcode the shared secret in source-controlled SQL, migrations, or Edge Function code — always read it from Vault (DB side) or Secrets (Edge Function side) at call/run time.
- `612dc490af7e538b` (the original test secret used during setup) was rotated to `46528d9eb3fc701a` after being pasted repeatedly across terminal, SQL, and chat — a good practice any time a secret has been visible in multiple places.
- A `git log -p --all | Select-String "<secret>"` check confirmed no historical commit ever contained the raw secret — worth re-running after any future rotation as a quick sanity check.
