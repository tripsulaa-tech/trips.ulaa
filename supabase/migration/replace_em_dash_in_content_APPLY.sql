-- ============================================================================
-- STEP 2 of 2 - APPLY: replace the em dash with a plain hyphen "-"
-- ============================================================================
-- Run replace_em_dash_in_content_PREVIEW.sql first. Take a database backup
-- (Supabase > Database > Backups) before running this.
--
-- Same tables and column rules as the preview. Only rows that actually contain
-- an em dash are updated. The update runs as a single DO block, so if anything
-- fails, nothing is changed.
--
-- Note: the normal "updated_at" triggers on these tables will stamp the
-- touched rows with the current time. That is harmless.
--
-- Safe to run more than once (a second run changes 0 rows).
-- ============================================================================

drop table if exists pg_temp.em_dash_applied;
create temp table em_dash_applied (tbl text, col text, rows_updated bigint);

do $$
declare
  r    record;
  n    bigint;
  sql  text;
  has  text;
  setx text;
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
      has  := format('%I::text', r.col);
      setx := format('%I = replace(%I::text, chr(8212), %L)::jsonb', r.col, r.col, '-');
    elsif r.udt_name in ('_text','_varchar') then
      has  := format('array_to_string(%I, chr(31))', r.col);
      setx := format(
        '%I = (select array_agg(replace(e, chr(8212), %L) order by n) from unnest(%I) with ordinality as u(e, n))',
        r.col, '-', r.col);
    else
      has  := format('%I', r.col);
      setx := format('%I = replace(%I, chr(8212), %L)', r.col, r.col, '-');
    end if;

    sql := format('update public.%I set %s where %s like %L',
                  r.t, setx, has, '%' || chr(8212) || '%');
    execute sql;
    get diagnostics n = row_count;

    if n > 0 then
      insert into em_dash_applied values (r.t, r.col, n);
    end if;
  end loop;
end $$;

select * from em_dash_applied order by tbl, col;
