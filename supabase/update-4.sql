-- Update 4: customer outlooks. Lets the items table hold a "forecast" item (a customer's next 6 weeks).
-- Run once in Supabase → SQL Editor → New query → Run. Safe to run again. Changes no existing rows.

alter table public.items drop constraint if exists items_type_check;
alter table public.items add constraint items_type_check
  check (type in ('order', 'transfer', 'ask', 'forecast'));

alter table public.items drop constraint if exists items_status_check;
alter table public.items add constraint items_status_check
  check (status in ('waiting', 'offered', 'confirmed', 'declined', 'booked', 'asked', 'yes', 'part', 'no', 'noted', 'shared'));
