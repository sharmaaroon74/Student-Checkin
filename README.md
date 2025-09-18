# Sunny Days – Version 5 (Supabase + Vercel) — Full UI

This package includes the full Version 5 UI (Bus / Center / Skip pages) wired to Supabase:
- Auth login (email/password)
- RPCs: `api_daily_reset`, `api_set_status` (SECURITY DEFINER)
- Realtime on `public.roster_status`
- Optimistic UI updates

## Setup (Windows + Git Bash)
1) Copy env:
   cp .env.example .env.local
   # then edit .env.local with your VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
2) Supabase → SQL Editor → run `supabase_setup.sql`
3) Enable Realtime for `public.roster_status`
4) Run locally:
   npm install
   npm run dev

## Deploy (Vercel)
- Framework Preset: Vite
- Build Command: npm run build
- Output Directory: dist
- Root Directory: this folder
- Env vars in Vercel:
  - VITE_SUPABASE_URL
  - VITE_SUPABASE_ANON_KEY
- Ensure devDependencies install (commit package-lock.json, or set NPM_CONFIG_PRODUCTION=false). Clear build cache if needed.
