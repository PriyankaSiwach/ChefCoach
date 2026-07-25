-- Permanently delete the signed-in user's auth account (email + login).
-- Profile row is removed automatically (profiles.id → auth.users ON DELETE CASCADE).
--
-- REQUIRED: Run this once in Supabase Dashboard → SQL Editor.

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = auth, public
as $$
declare
  user_id uuid;
begin
  user_id := auth.uid();
  if user_id is null then
    raise exception 'not_authenticated';
  end if;

  delete from auth.users where id = user_id;
end;
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;
