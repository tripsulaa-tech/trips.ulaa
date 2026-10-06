-- ============================================================================
-- Travel Card settings shared by every admin.
--
-- Admin -> Travel Cards used to remember edited traveller names, the back-of-card
-- wording, badge print settings and the card size only in the browser it was typed
-- in. This table keeps them in the database so every admin sees the same values.
--
-- Why a separate table (and not site_content): site_content has a public read
-- policy, and the edited traveller names would be readable by anyone. This table
-- is admin-only (authenticated) with no public policy at all.
--
-- One row (key = 'shared') holds all the settings as JSON.
--
-- Safe to re-run. Run once in Supabase -> SQL Editor.
-- ============================================================================

create table if not exists public.travel_card_settings (
  key         text primary key,
  content     jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.travel_card_settings enable row level security;

drop policy if exists "Admin all travel card settings" on public.travel_card_settings;
create policy "Admin all travel card settings" on public.travel_card_settings
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop trigger if exists travel_card_settings_updated_at on public.travel_card_settings;
create trigger travel_card_settings_updated_at
  before update on public.travel_card_settings
  for each row execute function public.update_updated_at();
