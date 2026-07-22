# Push Notifications — Setup Guide

This adds real mobile/lock-screen push notifications to the ULAA admin panel,
using Web Push + Supabase Edge Functions. New files were added and a few
existing ones edited — nothing here changes the public-facing site.

## What was added
- `manifest.json`, `sw.js` — makes the app an installable PWA with a service worker
- `src/services/push.ts` — subscribe/unsubscribe logic
- `src/admin/PushNotificationToggle.tsx` — the bell-style button (wired into `AdminLayout.tsx`)
- `supabase/migrations/add_push_notifications.sql` — `push_subscriptions` table + trigger update
- `supabase/functions/send-push/index.ts` — edge function that actually sends the push
- `index.html`, `src/main.tsx`, `.env.example` — small edits to link the manifest and register the service worker

## Steps

### 1. Add app icons
Drop two PNGs into an `icons/` folder at the project root:
- `icons/icon-192.png` (192×192)
- `icons/icon-512.png` (512×512)

These are referenced by `manifest.json` and `sw.js`. Any square version of the ULAA logo works.

### 2. Generate VAPID keys
```bash
npx web-push generate-vapid-keys
```
This prints a public and private key pair. Keep both — public goes to the frontend, private stays server-side only.

### 3. Set the frontend env var
Add to your real `.env` (not `.env.example`):
```
VITE_VAPID_PUBLIC_KEY=<the public key from step 2>
```

### 4. Run the new migration
```bash
supabase db push
```
This creates `push_subscriptions` and enables `pg_net`. It also updates the `notify_new_enquiry()` function — **before running it**, open `supabase/migrations/add_push_notifications.sql` and replace:
- `<YOUR_PROJECT_REF>` — found in your Supabase project URL
- `<YOUR_EDGE_FUNCTION_SECRET>` — any random string you generate yourself, e.g. `openssl rand -hex 32`

### 5. Deploy the edge function
```bash
supabase functions deploy send-push --no-verify-jwt
```

### 6. Set edge function secrets
```bash
supabase secrets set \
  VAPID_PUBLIC_KEY=<public key from step 2> \
  VAPID_PRIVATE_KEY=<private key from step 2> \
  VAPID_SUBJECT=mailto:you@ulaa.app \
  EDGE_FUNCTION_SECRET=<same random string used in step 4>
```

### 7. Install the web-push dependency for the function
The edge function imports `npm:web-push@3` directly, so no local `npm install` is needed — Deno fetches it at deploy time.

### 8. Test end-to-end
1. Build and deploy the frontend as usual (`npm run build`).
2. On a phone, open the site in the browser, then **Add to Home Screen** (this matters most on iOS — Safari only allows Web Push from an installed PWA).
3. Open the installed app, go to the admin dashboard, tap the bell-outline icon in the top bar next to the existing notifications bell, and allow notifications when prompted.
4. Submit a test enquiry from the main site (in a different tab/device).
5. You should get a push notification — including with the screen locked, once the app is installed as a PWA and permission was granted.

## Notes / caveats
- **iOS**: requires iOS 16.4+, and the app must be installed via "Add to Home Screen" — a browser tab alone won't get push on iOS.
- **Android/Chrome**: more permissive; can work from a regular tab, but installing as a PWA is still recommended for reliability.
- **Permission prompt**: there is no way to skip or pre-grant this — the user must tap "Allow" themselves.
- **Multiple devices**: each device/browser gets its own row in `push_subscriptions`, so an admin can receive notifications on several phones/laptops at once.
- **Cleanup**: the edge function automatically deletes subscriptions that come back as expired (HTTP 410/404) from the push service.
