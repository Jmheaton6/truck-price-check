-- Truck Price Check: run once in Supabase → SQL Editor → New query → Run.
-- Then set your reset PIN with the last statement (change 1234 first),
-- and run update-2.sql for spot quotes.

create table if not exists public.requests (
  id               bigint generated always as identity primary key,
  created_at       timestamptz not null default now(),
  team             text not null check (team in ('sales', 'production', 'planning')),
  kind             text not null check (kind in ('order', 'transfer')),
  destination      text not null check (char_length(destination) <= 60),
  loads            int  not null check (loads between 1 and 200),
  week             int,                -- legacy; ship_date replaces it
  ship_date        date,
  notice_days      int check (notice_days between 0 and 366),
  spot_chance      numeric not null check (spot_chance between 0 and 1),
  extra_cost       int  not null,
  profit_per_truck int  not null,
  color            text not null check (color in ('green', 'yellow', 'red')),
  flex             text check (flex in ('inside', 'outside')),
  status           text not null default 'new' check (status in ('new', 'contract', 'spot'))
);

-- Anyone with the link can read and add requests. Updates are limited to the
-- columns the app changes (Logistics status, "move to next week").
alter table public.requests enable row level security;

drop policy if exists "anyone can read" on public.requests;
drop policy if exists "anyone can add" on public.requests;
drop policy if exists "anyone can update" on public.requests;
create policy "anyone can read" on public.requests for select to anon, authenticated using (true);
create policy "anyone can add" on public.requests for insert to anon, authenticated with check (status = 'new');
create policy "anyone can update" on public.requests for update to anon, authenticated using (true) with check (true);

revoke all on public.requests from anon, authenticated;
grant select, insert on public.requests to anon, authenticated;
grant update (status, week, ship_date, notice_days, spot_chance, extra_cost, profit_per_truck, color) on public.requests to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- Live updates for the hub and the Logistics screen.
do $$
begin
  alter publication supabase_realtime add table public.requests;
exception when duplicate_object then null;
end $$;

-- Reset PIN lives in a table nobody outside the database can read.
create table if not exists public.demo_settings (key text primary key, value text not null);
alter table public.demo_settings enable row level security;
revoke all on public.demo_settings from anon, authenticated;

create or replace function public.reset_demo(pin text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from demo_settings where key = 'reset_pin' and value = pin) then
    raise exception 'Wrong PIN';
  end if;
  delete from requests where id is not null;
end $$;

revoke all on function public.reset_demo(text) from public;
grant execute on function public.reset_demo(text) to anon, authenticated;

-- Change 1234 to your own PIN before running.
insert into public.demo_settings (key, value) values ('reset_pin', '1234')
on conflict (key) do update set value = excluded.value;
