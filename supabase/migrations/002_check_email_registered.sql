-- Login UX: distinguish "no account" vs "wrong password" (Supabase returns the same
-- invalid_credentials for both). Callable with the anon key from the client.
--
-- Run in Supabase Dashboard → SQL Editor (or: supabase db push)

create or replace function public.check_email_registered(user_email text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users
    where lower(email) = lower(trim(user_email))
  );
$$;

revoke all on function public.check_email_registered(text) from public;
grant execute on function public.check_email_registered(text) to anon, authenticated;
