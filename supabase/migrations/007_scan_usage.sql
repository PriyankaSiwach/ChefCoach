-- 007: Server-side free scan counts (Stage 4)
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. New table public.scan_usage: one row per user per kind ('cook' or 'track')
--    with how many free scans they have used. Users can READ their own rows;
--    only the server (service_role key) can write.
-- 2. public.record_scan_usage(user, kind): adds 1 in a single atomic statement,
--    so two scans finishing at the same moment are both counted. Only the
--    service_role may call it.
-- 3. One-time seed: Cook counts the app already synced to profile_data.freeScansUsed
--    are copied in, so people don't get their free Cook scans back.
--    (Track counts were only ever stored on the phone, so there is nothing to copy.)
--
-- Run once in Supabase Dashboard → SQL Editor. Safe to re-run.
-- Undo with supabase/rollbacks/007_rollback.sql.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ── 1. Table ─────────────────────────────────────────────────────────────────
create table if not exists public.scan_usage (
  user_id     uuid        not null references auth.users (id) on delete cascade,
  kind        text        not null check (kind in ('cook', 'track')),
  used        integer     not null default 0 check (used >= 0),
  updated_at  timestamptz not null default now(),
  primary key (user_id, kind)
);

alter table public.scan_usage enable row level security;

drop policy if exists "scan_usage_select_own" on public.scan_usage;
create policy "scan_usage_select_own"
  on public.scan_usage for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- No insert/update/delete policies for users, and no table privileges either.
revoke all on table public.scan_usage from public, anon, authenticated;
grant select on table public.scan_usage to authenticated;
grant all on table public.scan_usage to service_role;

-- ── 2. Atomic "+1" (server only) ─────────────────────────────────────────────
create or replace function public.record_scan_usage(p_user_id uuid, p_kind text)
returns integer
language sql
security invoker
set search_path = ''
as $$
  insert into public.scan_usage as su (user_id, kind, used, updated_at)
  values (p_user_id, p_kind, 1, now())
  on conflict (user_id, kind) do update
    set used = su.used + 1,
        updated_at = now()
  returning su.used;
$$;

revoke all on function public.record_scan_usage(uuid, text) from public, anon, authenticated;
grant execute on function public.record_scan_usage(uuid, text) to service_role;

-- ── 3. Seed Cook counts from what the app already synced (runs once) ─────────
insert into public.scan_usage (user_id, kind, used)
select
  p.id,
  'cook',
  least(floor((p.profile_data ->> 'freeScansUsed')::numeric), 1000)::integer
from public.profiles p
where jsonb_typeof(p.profile_data -> 'freeScansUsed') = 'number'
  and (p.profile_data ->> 'freeScansUsed')::numeric >= 1
  and exists (select 1 from auth.users u where u.id = p.id)
on conflict (user_id, kind) do nothing;

commit;
