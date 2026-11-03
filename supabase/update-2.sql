-- Update 2 (Nov 3): ship dates + Logistics spot quotes.
-- Run once in Supabase → SQL Editor → New query → Run. Safe to run again.

-- Ship dates: each request stores its real ship date and days of notice.
alter table public.requests add column if not exists ship_date date;
alter table public.requests add column if not exists notice_days int check (notice_days between 0 and 366);
alter table public.requests alter column week drop not null;
alter table public.requests drop constraint if exists requests_week_check;
grant update (status, week, ship_date, notice_days, spot_chance, extra_cost, profit_per_truck, color)
  on public.requests to anon, authenticated;

-- Spot quotes: Logistics types a real quote for a lane; every price tag uses it.
create table if not exists public.spot_quotes (
  kind        text not null check (kind in ('order', 'transfer')),
  destination text not null check (char_length(destination) <= 60),
  quote       int  not null check (quote between 0 and 20000),
  updated_at  timestamptz not null default now(),
  primary key (kind, destination)
);
alter table public.spot_quotes enable row level security;
drop policy if exists "anyone can read quotes" on public.spot_quotes;
drop policy if exists "anyone can add quotes" on public.spot_quotes;
drop policy if exists "anyone can change quotes" on public.spot_quotes;
drop policy if exists "anyone can clear quotes" on public.spot_quotes;
create policy "anyone can read quotes" on public.spot_quotes for select to anon, authenticated using (true);
create policy "anyone can add quotes" on public.spot_quotes for insert to anon, authenticated with check (true);
create policy "anyone can change quotes" on public.spot_quotes for update to anon, authenticated using (true) with check (true);
create policy "anyone can clear quotes" on public.spot_quotes for delete to anon, authenticated using (true);
revoke all on public.spot_quotes from anon, authenticated;
grant select, insert, update, delete on public.spot_quotes to anon, authenticated;

do $$
begin
  alter publication supabase_realtime add table public.spot_quotes;
exception when duplicate_object then null;
end $$;

-- "New round" now also clears spot quotes.
create or replace function public.reset_demo(pin text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from demo_settings where key = 'reset_pin' and value = pin) then
    raise exception 'Wrong PIN';
  end if;
  delete from requests where id is not null;
  delete from spot_quotes where true;
end $$;
