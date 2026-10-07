-- ============================================================================
-- Early bird by SEATS ("first N paid people get the early-bird price")
--
-- upcoming_trips.early_bird_seats  integer  null = not seat-limited (the old
--                                           deadline-based early bird keeps
--                                           working exactly as before).
--
-- When early_bird_seats > 0 AND early_bird_price is set, the trip is in
-- "seat mode":
--   * The deadline date is ignored; only seats decide.
--   * A seat is USED once its enquiry has received money (booking_id is set,
--     i.e. amount_paid went above 0) and was priced early_bird. It STAYS used
--     if that person later cancels or is refunded.
--   * Early bird is a trip-level discount (price - early_bird_price, e.g.
--     1999 - 1799 = 200). It is not tied to Basic / Premium: it comes off
--     every package, whether the package is trip price + options or has its
--     own admin-set price.
--   * Insert time: an enquiry is quoted early bird if a seat is still free
--     (group seats are checked one by one: group_seq 1, 2, 3...).
--   * Payment time: the first time money lands on an early-bird enquiry, the
--     seat is settled. If the early-bird seats are already all paid, the
--     enquiry is moved to the normal price (package_type = 'normal',
--     total_amount + (price - early_bird_price), so discounts/options are kept).
--     This applies to admin-added bookings too.
--
-- Safe to re-run.
-- ============================================================================

alter table public.upcoming_trips
  add column if not exists early_bird_seats integer;

alter table public.upcoming_trips
  drop constraint if exists upcoming_trips_early_bird_seats_check;
alter table public.upcoming_trips
  add constraint upcoming_trips_early_bird_seats_check
  check (early_bird_seats is null or early_bird_seats > 0);

comment on column public.upcoming_trips.early_bird_seats is
  'Optional seat limit for the early-bird price (e.g. 5). When set together with early_bird_price the deadline is ignored and the first N PAID seats get the early-bird price. Null = deadline-based early bird as before.';

-- Paid early-bird seats on a trip. Cancelled/refunded seats still count
-- (booking_id is never cleared), so a freed seat is not handed out again.
create or replace function public.early_bird_seats_taken(p_trip_id uuid, p_exclude uuid default null)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
    from public.enquiries
   where trip_id = p_trip_id
     and package_type = 'early_bird'
     and booking_id is not null
     and (p_exclude is null or id <> p_exclude);
$$;

-- PII-free list for the public site: how many early-bird seats are used on
-- each seat-limited trip (same idea as get_waitlist_reserved_counts()).
create or replace function public.get_early_bird_seats_taken()
returns table (trip_id uuid, taken_count integer)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, public.early_bird_seats_taken(t.id)
    from public.upcoming_trips t
   where t.early_bird_seats is not null
     and t.early_bird_seats > 0;
$$;

revoke all on function public.early_bird_seats_taken(uuid, uuid) from public;
revoke all on function public.get_early_bird_seats_taken() from public;
grant execute on function public.get_early_bird_seats_taken() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Insert-time pricing: same as add_trip_packages.sql, plus seat mode.
-- ----------------------------------------------------------------------------
create or replace function public.set_enquiry_active_price()
returns trigger
language plpgsql
as $function$
declare
  found_price               numeric(10, 2);
  found_early_bird_price    numeric(10, 2);
  found_early_bird_deadline date;
  found_eb_seats            integer;
  cfg                       jsonb;
  valid_ids                 text[] := '{}';
  options_total             numeric := 0;
  found_pkg_name            text;
  found_pkg_early_bird      boolean := false;
  has_packages              boolean := false;
  found_pkg_price           numeric;
  found_pkg_eb_price        numeric;
  base_amount               numeric;
  base_package_type         text;
  seat_mode                 boolean := false;
  early_open                boolean := false;
begin
  if new.trip_id is null then
    return new;
  end if;

  select price, early_bird_price, early_bird_deadline, early_bird_seats, trip_options
    into found_price, found_early_bird_price, found_early_bird_deadline, found_eb_seats, cfg
    from upcoming_trips where id = new.trip_id;

  seat_mode := coalesce(found_eb_seats, 0) > 0 and coalesce(found_early_bird_price, 0) > 0;

  if seat_mode then
    -- A seat is free for this row if the paid early-bird seats plus this
    -- row's position in its group still fit inside the limit.
    early_open := public.early_bird_seats_taken(new.trip_id) + coalesce(new.group_seq, 1) <= found_eb_seats;
  else
    early_open := found_early_bird_price is not null
                  and found_early_bird_deadline is not null
                  and found_early_bird_deadline >= current_date;
  end if;

  if cfg is not null and coalesce(array_length(new.selected_option_ids, 1), 0) > 0 then
    select coalesce(array_agg(o->>'id'), '{}'),
           coalesce(sum(coalesce((o->>'price')::numeric, 0)), 0)
      into valid_ids, options_total
      from jsonb_array_elements(coalesce(cfg->'options', '[]'::jsonb)) o
     where (o->>'id') = any(new.selected_option_ids);
  end if;
  new.selected_option_ids := valid_ids;

  if new.package_id is not null then
    select p->>'name',
           coalesce((p->>'early_bird')::boolean, false),
           nullif(p->>'price', '')::numeric,
           nullif(p->>'early_bird_price', '')::numeric
      into found_pkg_name, found_pkg_early_bird, found_pkg_price, found_pkg_eb_price
      from jsonb_array_elements(coalesce(cfg->'packages', '[]'::jsonb)) p
     where (p->>'id') = new.package_id
     limit 1;
    if found_pkg_name is null then
      new.package_id := null;
      new.package_name := null;
    else
      new.package_name := found_pkg_name;
    end if;
  else
    new.package_name := null;
  end if;

  has_packages := cfg is not null
                  and jsonb_typeof(cfg->'packages') = 'array'
                  and jsonb_array_length(cfg->'packages') > 0;

  if new.total_amount is null and found_pkg_name is not null and coalesce(found_pkg_price, 0) > 0 then
    -- Package with its own admin-set price. In seat mode the trip's early-bird
    -- discount (price - early_bird_price) comes off it while seats are free.
    if seat_mode and early_open and found_price is not null then
      new.total_amount := greatest(0, found_pkg_price - (found_price - found_early_bird_price));
      new.package_type := 'early_bird';
    elsif not seat_mode and found_pkg_early_bird and coalesce(found_pkg_eb_price, 0) > 0 and early_open then
      new.total_amount := found_pkg_eb_price;
      new.package_type := 'early_bird';
    else
      new.total_amount := found_pkg_price;
      new.package_type := 'normal';
    end if;
  elsif new.total_amount is null then
    if early_open and (not has_packages or found_pkg_early_bird or seat_mode) then
      base_amount := found_early_bird_price;
      base_package_type := 'early_bird';
    elsif found_price is not null then
      base_amount := found_price;
      base_package_type := 'normal';
    end if;

    if base_amount is not null then
      new.total_amount := base_amount + options_total;
      new.package_type := base_package_type;
    end if;
  end if;

  return new;
end;
$function$;

-- ----------------------------------------------------------------------------
-- Payment-time settlement: the first payment on an early-bird enquiry either
-- takes a seat or, when every early-bird seat is already paid, moves the
-- enquiry to the normal price.
-- ----------------------------------------------------------------------------
create or replace function public.settle_early_bird_seat()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  t_price     numeric(10, 2);
  t_eb_price  numeric(10, 2);
  t_eb_seats  integer;
  taken       integer;
begin
  if new.trip_id is null
     or new.package_type is distinct from 'early_bird'
     or coalesce(new.amount_paid, 0) <= 0 then
    return new;
  end if;

  -- Only the FIRST payment settles the seat.
  if tg_op = 'UPDATE' and (coalesce(old.amount_paid, 0) > 0 or old.booking_id is not null) then
    return new;
  end if;
  if new.booking_id is not null and tg_op = 'INSERT' then
    return new;
  end if;

  -- Lock the trip row so two payments recorded at the same moment can't
  -- both take the last seat.
  select price, early_bird_price, early_bird_seats
    into t_price, t_eb_price, t_eb_seats
    from public.upcoming_trips
   where id = new.trip_id
   for update;

  if coalesce(t_eb_seats, 0) <= 0 or coalesce(t_eb_price, 0) <= 0 then
    return new;  -- not a seat-limited trip
  end if;

  taken := public.early_bird_seats_taken(new.trip_id, new.id);

  if taken >= t_eb_seats then
    new.package_type := 'normal';
    if new.total_amount is not null and t_price is not null then
      new.total_amount := new.total_amount + (t_price - t_eb_price);
    end if;
  end if;

  return new;
end;
$function$;

-- Name sorts BEFORE trg_enquiries_assign_booking_id on purpose, so the seat
-- is settled before booking_id is issued for this row.
drop trigger if exists trg_enquiries_a_settle_early_bird on public.enquiries;
create trigger trg_enquiries_a_settle_early_bird
  before insert or update on public.enquiries
  for each row execute function public.settle_early_bird_seat();
