-- Rollback for migrations/006_subscriptions_lockdown.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Removes the profiles trigger, the subscriptions table (and every row in it,
-- including the legacy snapshot), and the helper functions.
-- Profile data written while 006 was active is left exactly as it is.
--
-- Run in Supabase Dashboard → SQL Editor only if you need to undo 006.
-- Kept outside migrations/ so it is never mistaken for a forward migration.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

drop trigger if exists protect_profile_subscription_fields on public.profiles;
drop function if exists private.protect_profile_subscription_fields();

drop table if exists public.subscriptions;

drop function if exists private.try_timestamptz(text);

-- Remove the private schema only if nothing else lives in it.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'private')
     and not exists (
       select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'private'
     )
     and not exists (
       select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'private'
     )
  then
    execute 'drop schema private';
  end if;
end;
$$;

commit;
