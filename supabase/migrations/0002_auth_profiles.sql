-- Create a public.users profile for every new Supabase auth user.
-- Everyone signs up as a clipper. Team and client roles are only ever set by a super admin,
-- so nobody can sign up as staff by tampering with sign-up metadata.

create or replace function app.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, name, email, role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1)),
    new.email,
    'clipper'
  )
  on conflict (id) do nothing;
  return new;
end $$;

do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'auth' and table_name = 'users') then
    execute 'drop trigger if exists on_auth_user_created on auth.users';
    execute 'create trigger on_auth_user_created after insert on auth.users
             for each row execute function app.handle_new_auth_user()';
  end if;
end $$;
