-- Migration 004 (revised): subscription fields live inside profile_data JSONB
-- ─────────────────────────────────────────────────────────────────────────────
-- IMPORTANT: subscription data is stored as JSON keys inside the existing
-- profile_data column, NOT as separate columns.  No schema changes required.
--
-- Run this in the Supabase SQL Editor or via: supabase db push
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Remove the separate columns added by an earlier version of this migration
--    (safe no-op if they were never created).
alter table public.profiles
  drop column if exists is_pro,
  drop column if exists subscription_expires_at;

-- 2) Remove the old separate free_scans_used column added by migration 003.
alter table public.profiles
  drop column if exists free_scans_used;

-- 3) Drop old RPC functions from previous migration versions
drop function if exists public.set_pro_status(uuid, boolean, timestamptz);
drop function if exists public.get_pro_status(uuid);
drop function if exists public.increment_free_scans_used(uuid);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) JSONB helper: atomically merge subscription fields into profile_data
--
--    Called from the client after a successful purchase or restore.
--    Uses the PostgreSQL || (jsonb merge) operator — right side wins.
--
--    Fields written into profile_data:
--      isPro                boolean
--      subscriptionExpiresAt  ISO-8601 string or null
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.update_profile_subscription(
  p_user_id    uuid,
  p_is_pro     boolean,
  p_expires_at text    -- ISO-8601 or null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set profile_data = profile_data || jsonb_build_object(
    'isPro',                  p_is_pro,
    'subscriptionExpiresAt',  p_expires_at
  )
  where id = p_user_id;

  -- Create minimal row if the profile doesn't exist yet
  if not found then
    insert into public.profiles (id, profile_data)
    values (
      p_user_id,
      jsonb_build_object(
        'isPro',                 p_is_pro,
        'subscriptionExpiresAt', p_expires_at
      )
    )
    on conflict (id) do update
      set profile_data = public.profiles.profile_data || jsonb_build_object(
        'isPro',                  excluded.profile_data->>'isPro',
        'subscriptionExpiresAt',  excluded.profile_data->>'subscriptionExpiresAt'
      );
  end if;
end;
$$;

revoke all on function public.update_profile_subscription(uuid, boolean, text) from public;
grant execute on function public.update_profile_subscription(uuid, boolean, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) JSONB helper: atomically increment freeScansUsed inside profile_data
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.increment_scans_in_profile(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_count integer;
begin
  update public.profiles
  set profile_data = jsonb_set(
    profile_data,
    '{freeScansUsed}',
    to_jsonb(coalesce((profile_data->>'freeScansUsed')::integer, 0) + 1)
  )
  where id = p_user_id
  returning (profile_data->>'freeScansUsed')::integer into new_count;

  if not found then
    insert into public.profiles (id, profile_data)
    values (p_user_id, '{"freeScansUsed": 1}'::jsonb)
    on conflict (id) do update
      set profile_data = jsonb_set(
        public.profiles.profile_data,
        '{freeScansUsed}',
        to_jsonb(coalesce((public.profiles.profile_data->>'freeScansUsed')::integer, 0) + 1)
      )
    returning (public.profiles.profile_data->>'freeScansUsed')::integer into new_count;
  end if;

  return coalesce(new_count, 1);
end;
$$;

revoke all on function public.increment_scans_in_profile(uuid) from public;
grant execute on function public.increment_scans_in_profile(uuid) to authenticated;
