1. Local environment setup (.env)
Your Vite app needs a .env file with Supabase credentials:
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
Gotcha to remember: PowerShell's Set-Content -Encoding utf8 adds a UTF-8 BOM (byte-order mark) that breaks Vite's env parsing silently — it'll fall back to a placeholder client with no error. If you ever recreate .env by script, write it with Python instead to avoid BOM:
powershellpython -c "open('.env','w',encoding='utf-8').write('VITE_SUPABASE_URL=...\nVITE_SUPABASE_ANON_KEY=...\n')"
Also remember: Vite only reads .env at server startup, not live. Any time you change .env, you must fully kill the dev server and restart:
powershellnetstat -ano | findstr :5173
taskkill /PID <PID> /F
npm run dev
Then open a fresh browser tab (old tabs can stay connected to a stale server).
2. Supabase setup

Supabase dashboard → SQL Editor → run supabase/schema.sql to create tables (upcoming_trips, enquiries, etc.)
Supabase dashboard → Authentication → Users → Add user → set admin email/password → check "Auto Confirm User"
Test locally at localhost:5173/admin

3. Git setup and first push
powershellgit init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/tripsulaa-tech/trips.ulaa.git
git branch -M main
git push -u origin main
Issue you hit — corporate proxy/DNS: Bosch's network requires traffic through the local proxy (RB Local Proxy Manager, 127.0.0.1:3128). Direct DNS lookups fail. Fix:
powershellgit config --global http.proxy http://127.0.0.1:3128
git config --global https.proxy http://127.0.0.1:3128
(If you get "Permission denied" on the global config file, it usually still works after auth completes in-browser — Git can prompt an SSO/browser login on push.)
Issue — remote had existing commits (e.g. auto-created README):
powershellgit pull origin main --allow-unrelated-histories
If a conflict appears (e.g. in README.md) and you want to keep your local version:
powershellgit checkout --ours README.md
git add README.md
git commit -m "Merge remote README, keep local version"
git push -u origin main
4. Removing secrets from git tracking
.env should never be committed. If it accidentally got committed:
powershellgit rm --cached .env
Add-Content .gitignore ".env"
git add .gitignore
git commit -m "Stop tracking .env, add to gitignore"
git push origin main
This stops future tracking — the key still exists in old commit history. If the repo is/becomes public, rotate the Supabase anon key afterward (Supabase dashboard → Project Settings → API → regenerate).
.gitignore should always contain:
.env
.env.example (a template with no real values) is safe and fine to commit.
5. Deploying to Vercel

Go to vercel.com → sign in with GitHub → authorize access.
Dashboard → Add New → Project → Import tripsulaa-tech/trips.ulaa.
Confirm auto-detected settings: Framework = Vite, Build Command = npm run build, Output Directory = dist, Install Command = npm install.
Before deploying, expand Environment Variables and add:

VITE_SUPABASE_URL = (same value as your local .env)
VITE_SUPABASE_ANON_KEY = (same value as your local .env)
Apply to all environments (Production, Preview, Development)


Click Deploy. Takes 1–3 minutes.
Test the live URL (*.vercel.app) — check homepage loads trips, then /admin login works.
(Optional) Settings → Domains → add a custom domain, follow the DNS records Vercel gives you.

6. Auto-deploy (already on by default)
Every git push origin main automatically triggers a new Vercel deployment — no manual redeploy needed. To verify it's wired up:

Vercel → Settings → Git → confirm Production Branch = main
GitHub repo → Settings → Webhooks → should show a vercel.com webhook with green checkmarks

7. Your future workflow (day-to-day)
Whenever you make code changes:
powershell
cd C:\Users\bxe1cob\Desktop\ULAA
git add .
git commit -m "Gmail and Instagram link added"
git push origin main
That's it — Vercel picks it up and redeploys automatically. Check the Deployments tab on Vercel to confirm it went green.
If you ever add/change a Supabase env var, update it in both places: your local .env and Vercel → Settings → Environment Variables (then redeploy — Vercel doesn't auto-pick-up env var changes, you need to trigger a redeploy from the dashboard after saving new vars).

8. SPA Routing Fix for Vercel (Deep Links / Direct URL Access)
Symptom: `/admin`, `/trips/slug`, or any route other than `/` returns a Vercel 404 when accessed directly in the browser. Works fine locally because Vite's dev server automatically falls back to `index.html` for unknown paths. Vercel's static file server does not do this by default.

Root cause: Vercel serves the built `dist/` folder as static files. When you navigate directly to `/admin`, Vercel looks for a file at that path, finds nothing, and returns 404. Client-side routing (React Router) never gets a chance to run.

Fix: Add a `vercel.json` file in the project root (next to `package.json`) with a catch-all rewrite:

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

Create it with:
```powershell
python -c "import json,pathlib; pathlib.Path('vercel.json').write_text(json.dumps({'rewrites':[{'source':'/(.*)','destination':'/index.html'}]},indent=2)+'\n',encoding='utf-8')"
```

Then commit and push:
```powershell
git add vercel.json
git commit -m "Add SPA rewrite config for Vercel"
git push origin main
```

After the deployment finishes, all deep links (`/admin`, `/trips/...`, etc.) will load correctly on the live site.

> ⚠️ This file must exist in the repo. It is not a Vercel dashboard setting — it lives in the codebase.

---

9. Vercel Login Fails (CORS error / placeholder.supabase.co)
Symptom: Login works locally but on the live Vercel URL you get "Invalid email or password" and the browser console shows:

```
Access to fetch at 'https://placeholder.supabase.co/auth/v1/token...'
has been blocked by CORS policy
```

Root cause: Your `.env.local` file (which holds the real `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`) is gitignored and never pushed to GitHub. Vercel has no access to it and falls back to the placeholder values baked into `.env.example`.

Fix: Manually add the environment variables in the Vercel dashboard.

1. Go to https://vercel.com → `trips-ulaa` project → **Settings → Environment Variables**
2. Add both variables for **Production**:

| Variable | Value |
|----------|-------|
| `VITE_SUPABASE_URL` | Your real Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your real Supabase anon/public key |

3. Click **Save**
4. Go to **Deployments → latest deployment → ⋯ → Redeploy**

To find your values on your local machine:
```powershell
type .env.local
```

> ⚠️ Important: Vercel does NOT auto-redeploy when you save new environment variables. You must manually trigger a redeploy from the Deployments tab after saving.

> ⚠️ If you ever regenerate your Supabase anon key, remember to update it in both your local `.env.local` AND in Vercel → Settings → Environment Variables (then redeploy again).

---

10. Supabase Storage bucket setup for image uploads (Gallery, Trip covers, Album covers)

Symptom: Uploading an image (Gallery page, or Cover Image on Add/Edit Trip and Add/Edit Album) shows a browser alert:
```
Failed to upload. Make sure the Supabase storage bucket "..." exists and is public.
```

Root cause: The app code calls `supabase.storage.from(bucket).upload(...)`, but no matching bucket exists yet in the Supabase project — buckets are not auto-created.

Fix — create the bucket:
1. Supabase dashboard → **Storage** → **New bucket**
2. Name it exactly: `ulaa` (lowercase, no spaces)
3. Toggle **Public bucket** to **ON** (required so uploaded images display on the live site)
4. Click **Create bucket**

Fix — add access policies (needed even after the bucket exists, otherwise uploads fail with an RLS/permission error):
1. Storage → `ulaa` bucket → **Policies** → **New policy**
2. Policy name: `Public read, admin write`
3. Allowed operations: check **SELECT**, **INSERT**, **UPDATE**, **DELETE**
4. Target roles: leave blank (defaults to `public`)
5. Policy definition: `bucket_id = 'ulaa'`
6. Click **Review** → **Save policy**

> ⚠️ The bucket name in Supabase must be exactly `ulaa` — this is the name hardcoded in the app's upload calls (Gallery page, Trip cover image, Album cover image). If you ever rename the bucket in Supabase, the code must be updated to match, or uploads will fail again with the same error.

> Note: Leaving Target roles blank means anyone with the anon key can write to storage, not just the logged-in admin. That's fine to get unblocked, but for tighter security later, split this into two policies instead: a `SELECT` policy with Target roles blank (public read), and a separate `INSERT`/`UPDATE`/`DELETE` policy with Target roles set to `authenticated` (admin-only write).