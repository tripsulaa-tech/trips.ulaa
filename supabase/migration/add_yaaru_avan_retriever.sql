-- Retriever: run this entire file AFTER the existing Yaaru Avan migrations,
-- including yaaru_avan_rename_special_columns.sql and
-- yaaru_avan_no_pickpocket_joyfool_revenger.sql. Then deploy the edited app files.
-- Finish any active rounds first. Transactional and safe to run again.
-- Tourist-only; 2+ Strangers at deal (not remaining, and not Pickpockets).
-- One successful return per round, only the direct vote victim. No extra points.
-- A 30-second private decision expires without consuming the power.

begin;

alter table public.yaaru_avan_player_private
  add column if not exists retrieval_used boolean not null default false,
  add column if not exists last_out_order int;
alter table public.yaaru_avan_rooms
  add column if not exists retrieve_deadline timestamptz;
update public.yaaru_avan_player_private set last_out_order = out_order
 where last_out_order is null and out_order is not null;

alter table public.yaaru_avan_player_private drop constraint if exists yaaru_avan_player_private_special_check;
alter table public.yaaru_avan_player_private add constraint yaaru_avan_player_private_special_check
  check ((special is null or special in ('joyFool','duelists','boomerang','goddess','ghost','revenger','falafelVendor','lovers','retriever'))
     and (dip_as is null or dip_as in ('joyFool','boomerang','goddess','ghost','revenger','retriever')));
alter table public.yaaru_avan_rooms drop constraint if exists yaaru_avan_rooms_phase_check;
alter table public.yaaru_avan_rooms add constraint yaaru_avan_rooms_phase_check
  check (phase in ('lobby','deal','describe','vote','tiebreak','offboard','guess','revenger','retrieve','retrieved','roundEnd','final'));

-- Deal restricted abilities first. A special is selected once; each player has at most one.
create or replace function public._ya_deal_specials(p_room uuid, p_n int, p_strangers int, p_enabled text[])
returns void language plpgsql security definer set search_path = public as $$
declare enabled text[]; chosen text[]; dealt text[]; sp text; a uuid; b uuid; core text; ability text;
begin
  enabled := array(select x from unnest(array['joyFool','duelists','boomerang','goddess','ghost','revenger','falafelVendor','lovers','retriever']) x
    where (p_enabled is null or x = any(p_enabled))
      and p_n >= case x when 'falafelVendor' then 4 when 'revenger' then 5 when 'duelists' then 5 when 'lovers' then 5 else 0 end
      and (x <> 'retriever' or p_strangers >= 2));
  chosen := array(select x from unnest(enabled) x order by random() limit (p_n / 3));
  dealt := chosen;
  for sp in select x from unnest(chosen) x order by
    case when x = 'retriever' then 0 when x in ('joyFool','revenger') then 1 else 2 end
  loop
    select pp.player_id into a from yaaru_avan_player_private pp join yaaru_avan_players p on p.id = pp.player_id
      where p.room_id = p_room and pp.special is null
        and (sp <> 'retriever' or pp.role = 'tourist')
        and (sp not in ('joyFool','revenger') or pp.role <> 'pickpocket')
      order by random() limit 1;
    if a is null then continue; end if;
    if sp in ('duelists','lovers') then
      select pp.player_id into b from yaaru_avan_player_private pp join yaaru_avan_players p on p.id = pp.player_id
        where p.room_id = p_room and pp.special is null and pp.player_id <> a order by random() limit 1;
      if b is null then continue; end if;
      update yaaru_avan_player_private set special = sp, partner = b where player_id = a;
      update yaaru_avan_player_private set special = sp, partner = a where player_id = b;
    else
      update yaaru_avan_player_private set special = sp where player_id = a;
    end if;
  end loop;
  select pp.player_id, pp.role into a, core from yaaru_avan_player_private pp join yaaru_avan_players p on p.id = pp.player_id
    where p.room_id = p_room and pp.special = 'falafelVendor';
  if a is not null then
    select x into ability from unnest(enabled) x
      where x not in ('duelists','lovers','falafelVendor') and not (x = any(dealt))
        and (x <> 'retriever' or core = 'tourist')
        and (x not in ('joyFool','revenger') or core <> 'pickpocket') order by random() limit 1;
    update yaaru_avan_player_private set dip_as = ability,
      special = case when ability is null then null else 'falafelVendor' end where player_id = a;
  end if;
end $$;

create or replace function public.yaaru_avan_set_settings(
  p_code text, p_token uuid, p_strangers int, p_pickpockets int, p_level text,
  p_hide_counts boolean, p_dares boolean, p_specials boolean default false,
  p_special_ids text[] default null)
returns void language plpgsql security definer set search_path = public as $$
declare me public.yaaru_avan_players; r public.yaaru_avan_rooms; s int; l int; ids text[];
begin
  me := _ya_me(p_code, p_token);
  r := _ya_lock_room(me.room_id);
  if r.host_id <> me.id then raise exception 'host_only'; end if;
  if r.phase <> 'lobby' then raise exception 'wrong_phase'; end if;
  if p_level not in ('easy','medium','hard') then raise exception 'bad_level'; end if;
  s := greatest(0, least(coalesce(p_strangers, 1), 12));
  l := greatest(0, least(coalesce(p_pickpockets, 0), 2));
  if s + l = 0 then s := 1; end if;   -- at least one Pickpocket or one Stranger
  ids := case when p_special_ids is null then null else array(
           select distinct x from unnest(p_special_ids) x
            where x in ('joyFool','duelists','boomerang','goddess',
                        'ghost','revenger','falafelVendor','lovers','retriever')) end;
  update yaaru_avan_rooms set level = p_level, hide_counts = coalesce(p_hide_counts, false),
         dares = coalesce(p_dares, false),
         specials = coalesce(p_specials, false) and (ids is null or cardinality(ids) > 0),
         special_ids = ids
   where id = r.id;
  update yaaru_avan_room_private set strangers = s, pickpockets = l where room_id = r.id;
end $$;

create or replace function public.yaaru_avan_start_round(
  p_code text, p_token uuid, p_dare text default null, p_reset boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare me public.yaaru_avan_players; r public.yaaru_avan_rooms; rp public.yaaru_avan_room_private;
        n int; s int; l int; pair public.yaaru_avan_word_pairs; flip boolean; ew text; sw text;
        roles text[]; i int := 0; pid uuid; seat_no text; seats text[] := '{}';
begin
  me := _ya_me(p_code, p_token);
  r := _ya_lock_room(me.room_id);
  if r.host_id <> me.id then raise exception 'host_only'; end if;
  if r.phase not in ('lobby','roundEnd','final') then raise exception 'wrong_phase'; end if;
  select * into rp from yaaru_avan_room_private where room_id = r.id;
  select count(*) into n from yaaru_avan_players where room_id = r.id;
  if n < 3 then raise exception 'need_more_players'; end if;
  -- Shrink to a valid split if players changed since the host picked roles.
  s := rp.strangers; l := rp.pickpockets;
  l := least(l, case when n >= 10 then 2 else 1 end);
  while not _ya_roles_valid(n, s, l) and l > 0 loop l := l - 1; end loop;
  while not _ya_roles_valid(n, s, l) and s > 1 loop s := s - 1; end loop;
  if not _ya_roles_valid(n, s, l) then raise exception 'bad_roles'; end if;

  if p_reset then
    update yaaru_avan_players set points = 0, survived = 0, correct_votes = 0, wrong_votes = 0, pickpocket_wins = 0
     where room_id = r.id;
    update yaaru_avan_rooms set round_no = 0 where id = r.id;
    update yaaru_avan_room_private set used_pairs = '{}', last_category = null where room_id = r.id;
    select * into rp from yaaru_avan_room_private where room_id = r.id;
  end if;

  -- Word pair: not used yet, and not the same category twice in a row.
  select * into pair from yaaru_avan_word_pairs
   where level = r.level and not (id = any(rp.used_pairs)) and category is distinct from rp.last_category
   order by random() limit 1;
  if not found then
    select * into pair from yaaru_avan_word_pairs
     where level = r.level and not (id = any(rp.used_pairs)) order by random() limit 1;
  end if;
  if not found then
    update yaaru_avan_room_private set used_pairs = '{}' where room_id = r.id;
    select * into pair from yaaru_avan_word_pairs where level = r.level
     and category is distinct from rp.last_category order by random() limit 1;
    if not found then select * into pair from yaaru_avan_word_pairs where level = r.level order by random() limit 1; end if;
  end if;
  if pair.id is null then raise exception 'no_words'; end if;

  flip := random() < 0.5;
  ew := case when flip then pair.a else pair.b end;
  sw := case when flip then pair.b else pair.a end;

  roles := array_cat(array_cat(array_fill('tourist'::text, array[n - s - l]),
                               array_fill('stranger'::text, array[s])),
                     case when l > 0 then array_fill('pickpocket'::text, array[l]) else '{}'::text[] end);

  -- Shuffle players: seat order and roles are independent random shuffles.
  for pid in select id from yaaru_avan_players where room_id = r.id order by random() loop
    i := i + 1;
    loop
      seat_no := (1 + floor(random() * 28))::int || substr('ABCDEF', 1 + floor(random() * 6)::int, 1);
      exit when not (seat_no = any(seats));
    end loop;
    seats := array_append(seats, seat_no);
    update yaaru_avan_players set seat_idx = i - 1, seat = seat_no, alive = true, voted = false, ready = false where id = pid;
  end loop;

  i := 0;
  for pid in select id from yaaru_avan_players where room_id = r.id order by random() loop
    i := i + 1;
    update yaaru_avan_player_private
       set role = roles[i], word = case roles[i] when 'tourist' then ew when 'stranger' then sw else null end
     where player_id = pid;
  end loop;

  -- Clear last round's special-role state, then deal new specials if the room asked for them.
  update yaaru_avan_player_private
     set special = null, dip_as = null, partner = null, boomerang_used = false, revenge_done = false,
         ghost_hit = false, revenge_hit = false, out_stop = null, out_order = null, last_out_order = null, retrieval_used = false
   where player_id in (select id from yaaru_avan_players where room_id = r.id);

  if r.specials then perform _ya_deal_specials(r.id, n, s, r.special_ids); end if;

  delete from yaaru_avan_votes where room_id = r.id;
  update yaaru_avan_room_private
     set used_pairs = array_append(used_pairs, pair.id), last_category = pair.category,
         tourist_word = ew, stranger_word = sw, category = pair.category
   where room_id = r.id;
  update yaaru_avan_rooms
     set phase = 'deal', round_no = round_no + 1, stop_no = 1, start_idx = floor(random() * n)::int,
         out_player = null, offboard_at = null, bounce = null, retrieve_deadline = null,
         guess_queue = '{}', guess_after = null,
         guess_text = null, guess_match = null, outcome = null, last_result = null, round_summary = null,
         dare = case when r.dares then left(p_dare, 140) else null end
   where id = r.id;
end $$;

create or replace function public._ya_take_out(p_room uuid, p_player uuid, p_stop int)
returns uuid language plpgsql security definer set search_path = public as $$
declare n_out int; sp text; partner_id uuid;
begin
  select coalesce(max(greatest(pp.last_out_order, pp.out_order)), 0) into n_out from yaaru_avan_player_private pp join yaaru_avan_players p on p.id = pp.player_id
   where p.room_id = p_room;
  update yaaru_avan_player_private set out_stop = p_stop, out_order = n_out + 1, last_out_order = n_out + 1 where player_id = p_player;
  update yaaru_avan_players set alive = false where id = p_player;
  select coalesce(dip_as, special), partner into sp, partner_id
    from yaaru_avan_player_private where player_id = p_player;
  if sp = 'lovers' and partner_id is not null
     and exists (select 1 from yaaru_avan_players where id = partner_id and alive) then
    update yaaru_avan_player_private set out_stop = p_stop, out_order = n_out + 2, last_out_order = n_out + 2 where player_id = partner_id;
    update yaaru_avan_players set alive = false where id = partner_id;
    return partner_id;
  end if;
  return null;
end $$;

-- Called after Pickpocket guesses. Resolve retrieval BEFORE checking for a win.
create or replace function public._ya_after_out(p_room uuid, p_out uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.yaaru_avan_rooms; pp public.yaaru_avan_player_private; w text; out_seat int;
begin
  select * into r from yaaru_avan_rooms where id = p_room;
  select * into pp from yaaru_avan_player_private where player_id = p_out;
  if pp.role = 'tourist' and r.last_result->>'revenge_by' is null
     and not coalesce((r.last_result->>'retrieval_resolved')::boolean, false)
     and (r.last_result->>'out') = p_out::text
     and exists (select 1 from yaaru_avan_players where id = p_out and not alive)
     and (select count(*) from yaaru_avan_players p join yaaru_avan_player_private pv on pv.player_id = p.id
           where p.room_id = p_room and pv.role = 'stranger') >= 2
     and exists (select 1 from yaaru_avan_players p join yaaru_avan_player_private pv on pv.player_id = p.id
           where p.room_id = p_room and p.alive and pv.role = 'tourist'
             and coalesce(pv.dip_as, pv.special) = 'retriever' and not pv.retrieval_used) then
    update yaaru_avan_rooms set phase = 'retrieve', out_player = p_out,
      retrieve_deadline = now() + interval '30 seconds', guess_queue = '{}', guess_after = null where id = p_room;
    return;
  end if;
  w := _ya_winner(p_room);
  if w is not null then perform _ya_finish(p_room, w); return; end if;
  if coalesce(pp.dip_as, pp.special) = 'revenger' and not pp.revenge_done
     and exists (select 1 from yaaru_avan_players where id = p_out and not alive)
     and exists (select 1 from yaaru_avan_players where room_id = p_room and alive) then
    update yaaru_avan_rooms set phase = 'revenger', out_player = p_out where id = p_room;
    return;
  end if;
  select seat_idx into out_seat from yaaru_avan_players where id = p_out;
  perform _ya_begin_stop(p_room, r.stop_no + 1, out_seat + 1);
end $$;

-- Atomic private choice, locked against double taps, stale requests and competing phones.
create or replace function public.yaaru_avan_retrieve(
  p_code text, p_token uuid, p_use boolean, p_round int, p_stop int, p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.yaaru_avan_players; r public.yaaru_avan_rooms; pv public.yaaru_avan_player_private;
begin
  me := _ya_me(p_code, p_token);
  r := _ya_lock_room(me.room_id);
  if r.phase <> 'retrieve' then return; end if;
  if p_round is distinct from r.round_no or p_stop is distinct from r.stop_no
     or p_target is distinct from r.out_player then raise exception 'stale_retrieval'; end if;
  select * into pv from yaaru_avan_player_private where player_id = me.id;
  if not exists (select 1 from yaaru_avan_players where id = me.id and alive)
     or pv.role is distinct from 'tourist' or coalesce(pv.dip_as, pv.special) is distinct from 'retriever'
     or pv.retrieval_used then raise exception 'not_retriever'; end if;
  if now() >= r.retrieve_deadline then
    perform _ya_close_retrieval(r.id, false); return;
  end if;
  if p_use is null then raise exception 'bad_target'; end if;
  if p_use then
    if not exists (select 1 from yaaru_avan_players p join yaaru_avan_player_private pp on pp.player_id = p.id
                   where p.id = p_target and p.room_id = r.id and not p.alive and pp.role = 'tourist')
       or r.last_result->>'revenge_by' is not null then raise exception 'bad_target'; end if;
    update yaaru_avan_player_private set retrieval_used = true where player_id = me.id;
    update yaaru_avan_players set alive = true, voted = false where id = p_target;
    -- Keep last_out_order, word, partner and used powers; only undo scoring of this exit.
    update yaaru_avan_player_private set out_stop = null, out_order = null where player_id = p_target;
  end if;
  perform _ya_close_retrieval(r.id, p_use);
end $$;

create or replace function public._ya_close_retrieval(p_room uuid, p_used boolean)
returns void language plpgsql security definer set search_path = public as $$
declare r public.yaaru_avan_rooms;
begin
  update yaaru_avan_rooms set retrieve_deadline = null,
    last_result = last_result || jsonb_build_object('retrieval_resolved', true),
    phase = case when p_used then 'retrieved' else phase end,
    offboard_at = case when p_used then now() else offboard_at end
    where id = p_room returning * into r;
  if not p_used then perform _ya_after_out(p_room, r.out_player); end if;
end $$;

-- Every phone may advance an expired window; none can skip another player's live choice.
create or replace function public.yaaru_avan_advance_retrieval(p_code text, p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.yaaru_avan_players; r public.yaaru_avan_rooms;
begin
  me := _ya_me(p_code, p_token);
  r := _ya_lock_room(me.room_id);
  if r.phase = 'retrieve' and now() >= r.retrieve_deadline then
    perform _ya_close_retrieval(r.id, false);
  elsif r.phase = 'retrieved' and now() >= r.offboard_at + interval '4 seconds' then
    perform _ya_after_out(r.id, r.out_player);
  end if;
end $$;

create or replace function public.yaaru_avan_state(p_code text, p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me public.yaaru_avan_players; r public.yaaru_avan_rooms; rp public.yaaru_avan_room_private;
        mypriv public.yaaru_avan_player_private; n int; show_counts boolean; players jsonb; host_away boolean;
        fs int; fl int; room_json jsonb; partner_name text; i_vote boolean;
begin
  me := _ya_me(p_code, p_token);
  update yaaru_avan_player_private set last_seen = now() where player_id = me.id;
  select * into r from yaaru_avan_rooms where id = me.room_id;
  select * into rp from yaaru_avan_room_private where room_id = r.id;
  select * into mypriv from yaaru_avan_player_private where player_id = me.id;
  select count(*) into n from yaaru_avan_players where room_id = r.id;
  show_counts := (me.id = r.host_id) or not r.hide_counts;

  if n >= 3 then
    select f.fit_s, f.fit_l into fs, fl from public._ya_fit_roles(n, rp.strangers, rp.pickpockets) f;
  else
    fs := rp.strangers; fl := rp.pickpockets;
  end if;

  room_json := to_jsonb(r);
  if r.out_player is not distinct from me.id then
    room_json := room_json || jsonb_build_object('guess_match', null);
  end if;

  select name into partner_name from yaaru_avan_players where id = mypriv.partner;
  i_vote := (me.alive or (mypriv.out_order is not null and coalesce(mypriv.dip_as, mypriv.special) = 'ghost'))
            and not _ya_tied_out(r.id, me.id);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'name', p.name, 'seat', p.seat, 'seat_idx', p.seat_idx, 'alive', p.alive,
           'voted', p.voted, 'ready', p.ready, 'points', p.points, 'survived', p.survived,
           'correct_votes', p.correct_votes, 'wrong_votes', p.wrong_votes, 'pickpocket_wins', p.pickpocket_wins,
           'away', (pv.last_seen < now() - interval '45 seconds'),
           'voter', ((p.alive or (pv.out_order is not null and coalesce(pv.dip_as, pv.special) = 'ghost'))
                     and not _ya_tied_out(r.id, p.id)),
           -- The Goddess of Justice is announced to everyone once the words are dealt.
           -- Every other role stays secret.
           'public_special', case when r.specials
                                   and r.phase in ('deal','describe','vote','tiebreak','offboard','guess','revenger','retrieve','retrieved')
                                   and coalesce(pv.dip_as, pv.special) = 'goddess'
                                  then 'goddess' else null end
         ) order by p.joined_at), '[]'::jsonb)
    into players
    from yaaru_avan_players p join yaaru_avan_player_private pv on pv.player_id = p.id
   where p.room_id = r.id;

  select (pv.last_seen < now() - interval '60 seconds') into host_away
    from yaaru_avan_player_private pv where pv.player_id = r.host_id;

  return jsonb_build_object(
    'now', now(),
    'me', jsonb_build_object('id', me.id, 'role', mypriv.role, 'word', mypriv.word,
                             'special', coalesce(mypriv.dip_as, mypriv.special),
                             'dip', (mypriv.dip_as is not null),
                             'partner', partner_name,
                             'can_vote', i_vote,
                             'retrieval_used', mypriv.retrieval_used,
                             'can_retrieve', coalesce((r.phase = 'retrieve' and me.alive and mypriv.role = 'tourist'
                               and coalesce(mypriv.dip_as, mypriv.special) = 'retriever'
                               and not mypriv.retrieval_used and now() < r.retrieve_deadline), false)),
    'room', room_json,
    'players', players,
    'host_away', coalesce(host_away, true),
    'counts', case when show_counts then
        jsonb_build_object('tourists', n - fs - fl, 'strangers', fs, 'pickpockets', fl)
      else null end
  );
end $$;

revoke all on function public._ya_deal_specials(uuid,int,int,text[]),
  public._ya_take_out(uuid,uuid,int), public._ya_after_out(uuid,uuid),
  public._ya_close_retrieval(uuid,boolean) from public, anon, authenticated;
revoke all on function public.yaaru_avan_retrieve(text,uuid,boolean,int,int,uuid),
  public.yaaru_avan_advance_retrieval(text,uuid) from public;
grant execute on function public.yaaru_avan_set_settings(text,uuid,int,int,text,boolean,boolean,boolean,text[]),
  public.yaaru_avan_start_round(text,uuid,text,boolean), public.yaaru_avan_state(text,uuid),
  public.yaaru_avan_retrieve(text,uuid,boolean,int,int,uuid),
  public.yaaru_avan_advance_retrieval(text,uuid) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
