-- ============================================================================
-- Trip packages & options (e.g. Basic / Premium with Water Activities)
--
-- One generic model instead of hardcoded tiers:
--   upcoming_trips.trip_options   jsonb  { options: [{id,name,description,price}],
--                                          packages: [{id,name,description,option_ids[],highlight,early_bird,price,early_bird_price}] }
--   enquiries.selected_option_ids text[] the option ids this traveler took
--   enquiries.package_id          text   package picked (label only)
--   enquiries.package_name        text   name snapshot of that package
--
-- Pricing is done SERVER-SIDE. The public booking form only sends ids —
-- never an amount — and set_enquiry_active_price() below computes
--   total_amount = base price + sum(price of every valid selected option)
-- A package can also carry its OWN admin-set price ("price") and early-bird
-- price ("early_bird_price", used while the trip's early-bird deadline is
-- open and the package has early_bird = true). When a package has its own
-- price that number is the whole total — options add nothing on top. With no
-- own price, the rule below applies:
-- where the base price is PER PACKAGE: the early-bird price only applies to
-- packages flagged "early_bird": true in trip_options (e.g. Premium); every
-- other package (e.g. Basic) always pays the regular trip price. Trips with
-- no packages keep the old rule (early-bird while the window is open).
-- so a raw request can't underpay by faking a total. Unknown option ids
-- are silently dropped. Admin-authored inserts that already supply
-- total_amount are untouched (same rule as before); only their option ids
-- are validated.
--
-- Safe to re-run: add column if not exists / create or replace.
-- ============================================================================

alter table public.upcoming_trips
  add column if not exists trip_options jsonb;

comment on column public.upcoming_trips.trip_options is
  'Public packages/options a traveler can choose from: { options: [{id,name,description,price}], packages: [{id,name,description,option_ids,highlight,early_bird,price,early_bird_price}] }. A package with its own price charges exactly that (early_bird_price while early-bird is open and early_bird = true); A package price = trip price + sum of its options'' prices; the early-bird price only applies to packages with early_bird = true. Null = plain single-price trip.';

alter table public.enquiries
  add column if not exists selected_option_ids text[] not null default '{}',
  add column if not exists package_id text,
  add column if not exists package_name text;

comment on column public.enquiries.selected_option_ids is
  'Ids from upcoming_trips.trip_options.options this traveler took. Validated and priced by set_enquiry_active_price().';

create or replace function public.set_enquiry_active_price()
returns trigger
language plpgsql
as $function$
declare
  found_price               numeric(10, 2);
  found_early_bird_price    numeric(10, 2);
  found_early_bird_deadline date;
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
begin
  if new.trip_id is null then
    return new;
  end if;

  select price, early_bird_price, early_bird_deadline, trip_options
    into found_price, found_early_bird_price, found_early_bird_deadline, cfg
    from upcoming_trips where id = new.trip_id;

  -- Keep only option ids that really exist on this trip, and add up what
  -- they cost.
  if cfg is not null and coalesce(array_length(new.selected_option_ids, 1), 0) > 0 then
    select coalesce(array_agg(o->>'id'), '{}'),
           coalesce(sum(coalesce((o->>'price')::numeric, 0)), 0)
      into valid_ids, options_total
      from jsonb_array_elements(coalesce(cfg->'options', '[]'::jsonb)) o
     where (o->>'id') = any(new.selected_option_ids);
  end if;
  new.selected_option_ids := valid_ids;

  -- Package is only a label: keep it if it exists on the trip, and
  -- snapshot its name so the list still reads right if it's renamed later.
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
    -- Package with its own admin-set price: that number is the total.
    if found_pkg_early_bird and coalesce(found_pkg_eb_price, 0) > 0
       and found_early_bird_deadline is not null
       and found_early_bird_deadline >= current_date then
      new.total_amount := found_pkg_eb_price;
      new.package_type := 'early_bird';
    else
      new.total_amount := found_pkg_price;
      new.package_type := 'normal';
    end if;
  elsif new.total_amount is null then
    -- Early bird applies when its window is open AND, on a trip that has
    -- packages, the chosen package is flagged for it. (A trip with packages
    -- but no valid package chosen is charged the regular price.)
    if found_early_bird_price is not null and found_early_bird_deadline is not null
       and found_early_bird_deadline >= current_date
       and (not has_packages or found_pkg_early_bird) then
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

drop trigger if exists enquiry_price_from_trip on public.enquiries;
create trigger enquiry_price_from_trip
  before insert on public.enquiries
  for each row execute function public.set_enquiry_active_price();
