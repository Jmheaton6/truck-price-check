-- Update 3: one table for the rebuilt app (customer orders, transfers, carrier asks).
-- Run once in Supabase → SQL Editor → New query → Run. Safe to run again.
-- The old requests / spot_quotes tables stay but the app no longer uses them.

create table if not exists public.items (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  type       text not null check (type in ('order', 'transfer', 'ask')),
  status     text not null check (status in ('waiting', 'offered', 'confirmed', 'declined', 'booked', 'asked', 'yes', 'part', 'no', 'noted')),
  data       jsonb not null default '{}'::jsonb check (pg_column_size(data) < 4000)
);

alter table public.items enable row level security;
drop policy if exists "anyone can read items" on public.items;
drop policy if exists "anyone can add items" on public.items;
drop policy if exists "anyone can update items" on public.items;
create policy "anyone can read items" on public.items for select to anon, authenticated using (true);
create policy "anyone can add items" on public.items for insert to anon, authenticated with check (true);
create policy "anyone can update items" on public.items for update to anon, authenticated using (true) with check (true);

revoke all on public.items from anon, authenticated;
grant select, insert on public.items to anon, authenticated;
grant update (status, data) on public.items to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

do $$
begin
  alter publication supabase_realtime add table public.items;
exception when duplicate_object then null;
end $$;

-- New round: same PIN as before (demo_settings.reset_pin).
create or replace function public.reset_items(pin text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from demo_settings where key = 'reset_pin' and value = pin) then
    raise exception 'Wrong PIN';
  end if;
  delete from items where id is not null;
end $$;

revoke all on function public.reset_items(text) from public;
grant execute on function public.reset_items(text) to anon, authenticated;
