-- Migration: add free_scans_used to profiles
-- Run in Supabase SQL Editor or via: supabase db push

alter table public.profiles
  add column if not exists free_scans_used integer not null default 0;

-- Increment function callable from the client with the anon key.
-- Returns the new value so the client can update its local state.
create or replace function public.increment_free_scans_used(user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_val integer;
begin
  update public.profiles
  set free_scans_used = free_scans_used + 1
  where id = user_id
  returning free_scans_used into new_val;

  -- If no row yet, insert one (shouldn't normally happen, but safe guard)
  if not found then
    insert into public.profiles (id, free_scans_used)
    values (user_id, 1)
    on conflict (id) do update
      set free_scans_used = public.profiles.free_scans_used + 1
    returning free_scans_used into new_val;
  end if;

  return coalesce(new_val, 1);
end;
$$;

-- Only the authenticated user may call this for their own id
revoke all on function public.increment_free_scans_used(uuid) from public;
grant execute on function public.increment_free_scans_used(uuid) to authenticated;
