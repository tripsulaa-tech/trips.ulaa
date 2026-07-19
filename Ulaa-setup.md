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
powershellcd C:\Users\bxe1cob\Desktop\ULAA
git add .
git commit -m "describe your change"
git push origin main
That's it — Vercel picks it up and redeploys automatically. Check the Deployments tab on Vercel to confirm it went green.
If you ever add/change a Supabase env var, update it in both places: your local .env and Vercel → Settings → Environment Variables (then redeploy — Vercel doesn't auto-pick-up env var changes, you need to trigger a redeploy from the dashboard after saving new vars).