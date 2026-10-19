-- CrewSettle: database setup (boats, members, saved season). Documentation copy of what is in Supabase.
-- Paste everything into Supabase > SQL Editor > New query, and press Run.

-- 1. Tables
create table if not exists public.boats (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.boat_members (
  boat_id uuid not null references public.boats(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  created_at timestamptz not null default now(),
  primary key (boat_id, user_id)
);

create table if not exists public.seasons (
  boat_id uuid primary key references public.boats(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users(id) on delete set null
);

-- 2. Lock every table: each boat only sees its own data
alter table public.boats enable row level security;
alter table public.boat_members enable row level security;
alter table public.seasons enable row level security;

create or replace function public.is_boat_member(b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.boat_members m where m.boat_id = b and m.user_id = auth.uid());
$$;

drop policy if exists "members read boat" on public.boats;
create policy "members read boat" on public.boats
  for select to authenticated using (public.is_boat_member(id));

drop policy if exists "owner renames boat" on public.boats;
create policy "owner renames boat" on public.boats
  for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists "members read membership" on public.boat_members;
create policy "members read membership" on public.boat_members
  for select to authenticated using (user_id = auth.uid() or public.is_boat_member(boat_id));

drop policy if exists "members read season" on public.seasons;
create policy "members read season" on public.seasons
  for select to authenticated using (public.is_boat_member(boat_id));

drop policy if exists "members add season" on public.seasons;
create policy "members add season" on public.seasons
  for insert to authenticated with check (public.is_boat_member(boat_id));

drop policy if exists "members save season" on public.seasons;
create policy "members save season" on public.seasons
  for update to authenticated using (public.is_boat_member(boat_id)) with check (public.is_boat_member(boat_id));

-- 3. Create a boat and make the creator its owner, in one step
create or replace function public.create_boat(boat_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into public.boats (name, created_by) values (trim(boat_name), auth.uid()) returning id into new_id;
  insert into public.boat_members (boat_id, user_id, role) values (new_id, auth.uid(), 'owner');
  return new_id;
end $$;

-- 4. Who may use what (nothing is open to signed-out visitors)
revoke all on public.boats, public.boat_members, public.seasons from anon;
grant select, update on public.boats to authenticated;
grant select on public.boat_members to authenticated;
grant select, insert, update on public.seasons to authenticated;
revoke all on function public.create_boat(text) from public, anon;
grant execute on function public.create_boat(text) to authenticated;
revoke all on function public.is_boat_member(uuid) from public, anon;
grant execute on function public.is_boat_member(uuid) to authenticated;

-- 5. Hardening (run on the live database 2026-10-20): signed-in users get exactly what the app needs, nothing more.
revoke all on public.boats, public.boat_members, public.seasons from authenticated;
grant select on public.boats to authenticated;
grant update (name) on public.boats to authenticated;
grant select on public.boat_members to authenticated;
grant select, insert, update on public.seasons to authenticated;
