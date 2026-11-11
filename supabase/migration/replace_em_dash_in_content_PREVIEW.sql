-- ============================================================================
-- STEP 1 of 2 - PREVIEW ONLY (changes nothing)
-- ============================================================================
-- Counts how many rows in the website's CONTENT tables still contain the
-- em dash character, per column. Run this first, check the numbers, then run
-- replace_em_dash_in_content_APPLY.sql.
--
-- Tables covered (public-site / admin-editable content only):
--   upcoming_trips, completed_trips, testimonials, trip_leaders, gallery,
--   site_content, travel_card_settings
--
-- Deliberately NOT touched: enquiries, payments, invoices, activity_log,
-- waitlist, notifications, trip_finance_snapshots (customer / financial
-- history records). Columns named slug / key / url / image / photo / icon are
-- skipped, so URLs, slugs and storage paths can never change.
--
-- The em dash is written as chr(8212) so the SQL editor's encoding can't
-- corrupt it.
-- ============================================================================

drop table if exists pg_temp.em_dash_preview;
create temp table em_dash_preview (tbl text, col text, rows_with_em_dash bigint);

do $$
declare
  r    record;
  expr text;
  n    bigint;
begin
  for r in
    select c.table_name as t, c.column_name as col, c.data_type, c.udt_name
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public'
      and tb.table_type = 'BASE TABLE'
      and c.table_name = any (array[
        'upcoming_trips','completed_trips','testimonials','trip_leaders',
        'gallery','site_content','travel_card_settings'])
      and (c.data_type in ('text','character varying','jsonb')
           or c.udt_name in ('_text','_varchar'))
      and c.column_name !~ '(^|_)(slug|key|url|image|images|photo|icon)(_|$)'
    order by c.table_name, c.ordinal_position
  loop
    if r.data_type = 'jsonb' then
      expr := format('%I::text', r.col);
    elsif r.udt_name in ('_text','_varchar') then
      expr := format('array_to_string(%I, chr(31))', r.col);
    else
      expr := format('%I', r.col);
    end if;

    execute format('select count(*) from public.%I where %s like %L',
                   r.t, expr, '%' || chr(8212) || '%')
      into n;

    if n > 0 then
      insert into em_dash_preview values (r.t, r.col, n);
    end if;
  end loop;
end $$;

select * from em_dash_preview order by tbl, col;
