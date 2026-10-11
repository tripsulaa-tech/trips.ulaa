-- ============================================================================
-- "Early-bird seats only" packages (Early Bird package + separate Normal package)
--
-- A package in upcoming_trips.trip_options may now carry  early_bird_only: true.
-- With a seat-limited early bird (early_bird_seats > 0):
--   * If ANY package has early_bird_only, the seat discount
--     (price - early_bird_price) applies ONLY to those packages. Every other
--     package (e.g. "Normal") is always quoted its regular price.
--   * If NO package has it, nothing changes: the discount still comes off every
--     package, exactly as before.
--   * Seats are still used only by PAID enquiries with package_type =
--     'early_bird', so Normal bookings never consume an early-bird seat.
--   * When the seats are gone, an early_bird_only package is shown "Sold out"
--     on the site and is not offered in the booking form. If a stale page still
--     books it, the enquiry is simply quoted the package's regular price.
--
-- Only set_enquiry_active_price() changes (insert-time quote); the payment-time
-- settle_early_bird_seat() needs no change. Safe to re-run.
-- ============================================================================

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
  found_pkg_early_only      boolean := false;
  any_early_only            boolean := false;
  seat_eligible             boolean := false;
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
           nullif(p->>'early_bird_price', '')::numeric,
           coalesce((p->>'early_bird_only')::boolean, false)
      into found_pkg_name, found_pkg_early_bird, found_pkg_price, found_pkg_eb_price, found_pkg_early_only
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

  -- Does ANY package on this trip carry early_bird_only? Then the seat
  -- discount reaches only such packages; otherwise it reaches every package
  -- (the behaviour before this migration).
  any_early_only := exists (
    select 1
      from jsonb_array_elements(coalesce(cfg->'packages', '[]'::jsonb)) p
     where coalesce((p->>'early_bird_only')::boolean, false)
  );
  seat_eligible := seat_mode and (not any_early_only or coalesce(found_pkg_early_only, false));

  has_packages := cfg is not null
                  and jsonb_typeof(cfg->'packages') = 'array'
                  and jsonb_array_length(cfg->'packages') > 0;

  if new.total_amount is null and found_pkg_name is not null and coalesce(found_pkg_price, 0) > 0 then
    -- Package with its own admin-set price. In seat mode the trip's early-bird
    -- discount (price - early_bird_price) comes off it while seats are free.
    if seat_eligible and early_open and found_price is not null then
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
    if early_open and ((not seat_mode and (not has_packages or found_pkg_early_bird)) or seat_eligible) then
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
