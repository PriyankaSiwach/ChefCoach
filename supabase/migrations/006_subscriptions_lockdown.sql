-- 006: Subscriptions lockdown (Stage 1 — database only)
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. New table public.subscriptions: users can READ their own row; only the
--    server (service_role key) or the SQL editor can write it.
-- 2. One-time "legacy" snapshot: users whose profile says isPro = true with a
--    future subscriptionExpiresAt get Pro there, capped at 30 days from now.
-- 3. Trigger on public.profiles: app users can no longer set isPro or
--    subscriptionExpiresAt, and can never lower freeScansUsed. New rows start
--    with isPro = false, subscriptionExpiresAt = null, freeScansUsed = 0.
--    Writes are never rejected, so old app versions keep syncing without errors.
--
-- Run once in Supabase Dashboard → SQL Editor. Safe to re-run.
-- Undo with supabase/rollbacks/006_rollback.sql.
-- Do NOT add the "private" schema to Settings → API → Exposed schemas.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ── Helpers live outside "public" so they are not callable through the API ──
create schema if not exists private;
-- Lets the profiles trigger run during app writes. Not exposed through the API.
grant usage on schema private to anon, authenticated;

-- Parse an ISO date string; returns null instead of failing on bad input.
create or replace function private.try_timestamptz(value text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
begin
  return value::timestamptz;
exception when others then
  return null;
end;
$$;

revoke all on function private.try_timestamptz(text) from public, anon, authenticated;

-- ── 1. Subscriptions table ───────────────────────────────────────────────────
create table if not exists public.subscriptions (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  is_pro      boolean     not null default false,
  expires_at  timestamptz,
  source      text        not null check (source in ('revenuecat', 'comp', 'legacy')),
  product_id  text,
  updated_at  timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own"
  on public.subscriptions for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- No insert/update/delete policies for users, and no table privileges either.
revoke all on table public.subscriptions from public, anon, authenticated;
grant select on table public.subscriptions to authenticated;
grant all on table public.subscriptions to service_role;

-- ── 2. Legacy snapshot (runs once; existing rows are never overwritten) ──────
insert into public.subscriptions (user_id, is_pro, expires_at, source)
select
  p.id,
  true,
  least(e.expires_at, now() + interval '30 days'),
  'legacy'
from public.profiles p
cross join lateral (
  select private.try_timestamptz(p.profile_data ->> 'subscriptionExpiresAt') as expires_at
) e
where (p.profile_data ->> 'isPro') = 'true'
  and e.expires_at > now()
on conflict (user_id) do nothing;

-- ── 3. Protect subscription fields inside profiles.profile_data ─────────────
create or replace function private.protect_profile_subscription_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  jwt_role  text    := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  new_data  jsonb   := coalesce(new.profile_data, '{}'::jsonb);
  old_data  jsonb   := '{}'::jsonb;
  old_scans integer := 0;
  new_scans integer := 0;
begin
  -- Only app users are restricted. The server (service_role) and the
  -- dashboard / SQL editor (postgres) can still set these fields.
  if jwt_role not in ('anon', 'authenticated')
     and current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if jsonb_typeof(new_data) <> 'object' then
    new_data := '{}'::jsonb;
  end if;

  if tg_op = 'INSERT' then
    new.profile_data := new_data || jsonb_build_object(
      'isPro', false,
      'subscriptionExpiresAt', null,
      'freeScansUsed', 0
    );
    return new;
  end if;

  -- UPDATE, including the update half of the app's upsert.
  old_data := coalesce(old.profile_data, '{}'::jsonb);
  if jsonb_typeof(old_data) <> 'object' then
    old_data := '{}'::jsonb;
  end if;

  -- isPro / subscriptionExpiresAt: always keep whatever was stored before.
  new_data := new_data - 'isPro' - 'subscriptionExpiresAt';
  if old_data ? 'isPro' then
    new_data := new_data || jsonb_build_object('isPro', old_data -> 'isPro');
  end if;
  if old_data ? 'subscriptionExpiresAt' then
    new_data := new_data || jsonb_build_object('subscriptionExpiresAt', old_data -> 'subscriptionExpiresAt');
  end if;

  -- freeScansUsed: may go up, never down. Non-numbers count as 0; capped at 1,000,000.
  if jsonb_typeof(old_data -> 'freeScansUsed') = 'number' then
    old_scans := least(greatest(floor((old_data ->> 'freeScansUsed')::numeric), 0), 1000000)::integer;
  end if;
  if jsonb_typeof(new_data -> 'freeScansUsed') = 'number' then
    new_scans := least(greatest(floor((new_data ->> 'freeScansUsed')::numeric), 0), 1000000)::integer;
  end if;

  new.profile_data := new_data || jsonb_build_object('freeScansUsed', greatest(old_scans, new_scans));
  return new;
end;
$$;

drop trigger if exists protect_profile_subscription_fields on public.profiles;
create trigger protect_profile_subscription_fields
  before insert or update on public.profiles
  for each row
  execute function private.protect_profile_subscription_fields();

commit;
