# ULAA — Unseen. Local. Adventures.

Girls-only travel platform. Discover hidden destinations, travel safely, and create unforgettable memories with like-minded women.

**Live site:** https://trips-ulaa.vercel.app
**Repository:** https://github.com/tripsulaa-tech/trips.ulaa

---

## Tech Stack

- **Frontend:** React + TypeScript, built with Vite
- **Styling:** Tailwind CSS, Framer Motion for animations
- **Backend / Database / Auth:** Supabase (Postgres + Auth)
- **Hosting:** Vercel (auto-deploys on push to `main`)
- **Icons:** lucide-react

---

## Project Structure

```
ULAA/
├── src/
│   ├── admin/            # Admin panel pages (Dashboard, Trips, Gallery, Enquiries, Login)
│   ├── components/
│   │   ├── layout/       # Navbar, Footer, Layout, FloatingWhatsApp
│   │   └── ui/            # Reusable UI (Button, Modal, TripCard, BookingForm, etc.)
│   ├── context/           # AuthContext
│   ├── pages/              # Public pages (Home, Upcoming/Completed Trips, About, Contact, etc.)
│   ├── sections/           # Homepage sections (Hero, Testimonials, Gallery Preview, etc.)
│   ├── services/           # api.ts, supabase.ts (Supabase client + queries)
│   ├── routes/              # AppRouter.tsx
│   └── types/                # Shared TypeScript types
├── supabase/
│   └── schema.sql          # Database schema (upcoming_trips, enquiries, etc.)
├── public/                   # Logos, favicon, static assets
├── .env                       # Local environment variables (not committed)
└── .env.example               # Template for required environment variables
```

---

## Public Pages

- **Home** — Hero section, trust badges (Girls Only / Verified Organizers / Hidden Destinations / Small Groups / Local Experiences), upcoming trips preview, gallery preview, testimonials, "What's Coming" section
- **Upcoming Trips** — Browsable list of bookable trips
- **Completed Trips** — Past trip albums/gallery
- **About** — Company info
- **Contact** — Enquiry form, floating WhatsApp button
- **Book Now** — Booking flow

## Admin Panel (`/admin`)

- **Login** — Supabase Auth email/password
- **Dashboard** — Overview cards: Upcoming Trips, Completed Albums, Total Enquiries, New Enquiries
- **Manage Trips** — Add/edit/publish trips
- **View Enquiries** — Manage booking requests
- **Gallery** — Upload and manage photos/albums

---

## Local Development Setup

1. Clone the repo and install dependencies:
   ```powershell
   npm install
   ```
2. Create a `.env` file in the project root with:
   ```
   VITE_SUPABASE_URL=your-project-url
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```
   **Note:** Write this file as plain UTF-8 without a BOM. `Set-Content -Encoding utf8` in Windows PowerShell adds a BOM by default and breaks Vite's env parsing silently (falls back to a placeholder client, no error shown). Use Python to write it safely if scripting:
   ```powershell
   python -c "open('.env','w',encoding='utf-8').write('VITE_SUPABASE_URL=...\nVITE_SUPABASE_ANON_KEY=...\n')"
   ```
3. Run the schema in Supabase: Dashboard → SQL Editor → paste and run `supabase/schema.sql`.
4. Create an admin user: Supabase Dashboard → Authentication → Users → Add user → check "Auto Confirm User".
5. Start the dev server:
   ```powershell
   npm run dev
   ```
   Vite only reads `.env` at startup — if you change it, fully kill the dev server (`netstat -ano | findstr :5173` → `taskkill /PID <PID> /F`) and restart, then open a **fresh** browser tab.
6. Visit `localhost:5173/admin` and sign in.

---

## Deployment (Vercel)

- Project is connected to GitHub repo `tripsulaa-tech/trips.ulaa`, branch `main`.
- Build settings: Framework = Vite, Build Command = `npm run build`, Output Directory = `dist`.
- Environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) are set in Vercel → Project Settings → Environment Variables, matching the local `.env` values.
- **Auto-deploy is enabled by default:** every `git push origin main` triggers a new production deployment automatically via a GitHub webhook.
- If you change an env var value in Vercel, you must trigger a manual redeploy afterward — Vercel doesn't auto-pick-up env var changes on existing deployments.

Day-to-day workflow:
```powershell
git add .
git commit -m "describe your change"
git push origin main
```

---

## What's Been Done So Far

**Environment & local setup**
- Diagnosed and fixed Supabase env vars not loading — caused by a stale dev server still running after `.env` was updated, and separately by a UTF-8 BOM corrupting the `VITE_SUPABASE_URL` key name when written via PowerShell.

**Git & GitHub**
- Initialized git repo, connected to `tripsulaa-tech/trips.ulaa` on GitHub.
- Diagnosed and resolved a corporate proxy/DNS issue (Bosch network requires routing through the local RB Local Proxy Manager on `127.0.0.1:3128`; direct DNS lookups fail) that was blocking `git push`.
- Resolved a merge conflict (add/add on `README.md`) from an auto-created remote README, keeping the local version.
- Removed `.env` from git tracking after it was accidentally committed, and added it to `.gitignore` to prevent future leaks.

**Deployment**
- Deployed the app to Vercel from the GitHub repo, with Supabase environment variables configured in Vercel's dashboard.
- Verified and confirmed auto-deploy on push is working (production branch = `main`, GitHub webhook active).

**UI changes**
- Increased the navbar logo size in `src/components/layout/Navbar.tsx` in stages (from `h-11` up to `h-32`), and increased the navbar height (`h-18` → `h-24`) to give the logo more room without clipping.

---

## Known Open Items

- Backup files (`*.bak.<timestamp>`) created by patch scripts were being accidentally committed to git — needs `*.bak.*` added to `.gitignore` and existing tracked backups removed.
- Git committer identity is currently auto-derived from Windows username/hostname (`bxe1cob@bosch.com`) — consider setting explicitly with `git config --global user.name` / `user.email` if this should be different.
- If the GitHub repo is or becomes public, the originally-committed Supabase anon key (from the first commit, before `.env` was untracked) is still present in git history — rotate the key in Supabase if that's a concern.

---

## Patching Convention (for future changes)

UI/code changes in this project are applied via small Python patch scripts run directly on the dev machine, using exact string replacement with:
- A timestamped backup of the file before editing
- An `assert` that aborts with no changes if the target string isn't found (prevents silent no-ops or partial matches)
- Direct edits with no intermediate file transfer — scripts are written to a temp `.py` file, run, then deleted
