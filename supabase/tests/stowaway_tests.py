#!/usr/bin/env python3
"""
Stowaway: automated rule checks. Plays real games through the real database
functions with simulated players (each with its own secret token, exactly like
phones), then checks the rules, the secrets and the host controls.

SAFE USE: run it only against a throw-away local Postgres (see README.md). It
deletes every Stowaway room, so it refuses to run unless the database name
contains "test".

    TEST_DATABASE_URL=postgresql://postgres@localhost:5432/ulaa_test python3 stowaway_tests.py
    add --quick for a shorter run
"""
import collections, os, random, sys, uuid
import psycopg2, psycopg2.extras

DSN = os.environ.get('TEST_DATABASE_URL')
QUICK = '--quick' in sys.argv
if not DSN:
    sys.exit('Set TEST_DATABASE_URL to a throw-away database (see README.md).')

def connect(role=None):
    c = psycopg2.connect(DSN); c.autocommit = True
    if role: c.cursor().execute(f'set role {role}')
    return c

SU = connect()
_cur = SU.cursor(); _cur.execute('select current_database()')
if 'test' not in _cur.fetchone()[0]:
    sys.exit('Refusing to run: the database name must contain "test".')
API = connect('anon')   # what anyone holding the public key can do

def su(q, a=()):
    cur = SU.cursor(cursor_factory=psycopg2.extras.RealDictCursor); cur.execute(q, a)
    try: return cur.fetchall()
    except psycopg2.ProgrammingError: return None

class Err(Exception):
    def __init__(s, m): super().__init__(m); s.code = m

def rpc(fn, *args):
    cur = API.cursor()
    try:
        cur.execute(f'select public.{fn}({",".join(["%s"] * len(args))})', args)
        return cur.fetchone()[0]
    except psycopg2.Error as e:
        raise Err((e.pgerror or str(e)).split('\n')[0].replace('ERROR:', '').strip())

class P:
    def __init__(self, name): self.name, self.tok, self.id = name, str(uuid.uuid4()), None

def state(code, p): return rpc('yaaru_avan_state', code, p.tok)
def clear(): su('delete from yaaru_avan_rooms')

def start_vote(code, host_tok):
    # Deal -> description round -> (host skips) -> vote. The description round has its own checks below.
    rpc('yaaru_avan_begin_vote', code, host_tok)
    if rpc('yaaru_avan_state', code, host_tok)['room']['phase'] == 'describe': rpc('yaaru_avan_begin_vote', code, host_tok)

def new_room(n, stow=1, lost=0, level='medium', hide=False):
    ps = [P(f'P{i}') for i in range(n)]
    r = rpc('yaaru_avan_create_room', ps[0].name, ps[0].tok, 'Test'); code = r['code']; ps[0].id = r['player_id']
    for p in ps[1:]: p.id = rpc('yaaru_avan_join', code, p.name, p.tok)['player_id']
    rpc('yaaru_avan_set_settings', code, ps[0].tok, stow, lost, level, hide, False)
    return code, ps

def roles_of(code):
    return {r['player_id']: r for r in su("""select pp.player_id, pp.role, pp.word, p.alive from yaaru_avan_player_private pp
        join yaaru_avan_players p on p.id = pp.player_id join yaaru_avan_rooms r on r.id = p.room_id where r.code = %s""", (code,))}

def play_round(code, ps, policy='random', check_counts=True):
    host, byid, problems = ps[0], {p.id: p for p in ps}, []
    rpc('yaaru_avan_start_round', code, host.tok, None, False)
    roles = roles_of(code); cnt = collections.Counter(r['role'] for r in roles.values())
    c = state(code, host)['counts']
    if check_counts and c and (c['explorers'], c['stowaways'], c['lost']) != (cnt['explorer'], cnt['stowaway'], cnt['lost']):
        problems.append(f'counts shown {c} but dealt {dict(cnt)}')
    for p in ps:
        me = state(code, p)['me']
        if me['role'] != roles[p.id]['role'] or me['word'] != roles[p.id]['word']: problems.append('a player was shown the wrong role/word')
    for p in ps: rpc('yaaru_avan_ready', code, p.tok)
    rpc('yaaru_avan_begin_vote', code, host.tok)
    for _ in range(400):
        room = state(code, host)['room']; ph = room['phase']
        if ph == 'vote':
            roles = roles_of(code); alive = [p for p in ps if roles[p.id]['alive']]
            for v in alive:
                pl = {x['id']: x for x in state(code, host)['players']}
                if state(code, host)['room']['phase'] != 'vote' or pl[v.id]['voted']: continue
                others = [p for p in alive if p.id != v.id]
                if policy == 'smart' and roles[v.id]['role'] == 'explorer':
                    tgt = random.choice([p for p in others if roles[p.id]['role'] != 'explorer'] or others)
                elif policy == 'bad':
                    tgt = random.choice([p for p in others if roles[p.id]['role'] == 'explorer'] or others)
                else: tgt = random.choice(others)
                rpc('yaaru_avan_cast_vote', code, v.tok, tgt.id)
        elif ph == 'describe':
            rpc('yaaru_avan_describe_done', code, host.tok)
        elif ph == 'offboard':
            su("update yaaru_avan_rooms set offboard_at = now() - interval '10 seconds' where code = %s", (code,))
            rpc('yaaru_avan_after_reveal', code, random.choice(ps).tok)
        elif ph == 'guess':
            outp = byid[room['out_player']]; ew = next(r['word'] for r in roles_of(code).values() if r['role'] == 'explorer')
            right = random.random() < .3
            if room['guess_text'] is None: rpc('yaaru_avan_submit_guess', code, outp.tok, ew if right else 'zzzz')
            rpc('yaaru_avan_judge_guess', code, random.choice([p for p in ps if p.id != outp.id]).tok, right)
        elif ph in ('roundEnd', 'final'): break
        else: problems.append(f'unexpected phase {ph}'); break
    else: problems.append('round did not finish')
    return state(code, host), problems

RESULTS = []
def check(name, ok, detail=''): RESULTS.append((name, bool(ok), '' if ok else str(detail)))

random.seed(2024)

# ── 1. Every role split, every table size: counts shown = roles dealt ──
sizes = range(3, 16, 3 if QUICK else 1)
bad = []
for n in sizes:
    for stow, lost in [(1, 0), (1, 1), (2, 1), (3, 2), (4, 1), (6, 2)]:
        code, ps = new_room(n, stow, lost); st, pr = play_round(code, ps, random.choice(['random', 'smart']))
        bad += [(n, stow, lost, x) for x in pr]
    clear()
check('role counts shown match the roles dealt (all sizes and splits)', not bad, bad[:3])

# ── 2. Full multi-round games obey the rules ──
issues = collections.Counter()
for _ in range(25 if QUICK else 120):
    n = random.randint(3, 15); stow, lost = random.choice([(1, 0), (1, 1), (2, 1), (2, 2), (3, 1), (3, 2)])
    code, ps = new_room(n, stow, lost)
    for rnd in range(3):
        st, pr = play_round(code, ps, random.choice(['random', 'smart', 'bad']), check_counts=False)
        for x in pr: issues[x] += 1
        room = st['room']
        if room['phase'] != 'roundEnd': issues['ended in ' + room['phase']] += 1; break
        roles = roles_of(code); o = room['outcome']
        sneaky = sum(1 for r in roles.values() if r['alive'] and r['role'] != 'explorer')
        ex = sum(1 for r in roles.values() if r['alive'] and r['role'] == 'explorer')
        if o == 'explorers' and sneaky: issues['explorers won with sneaky players aboard'] += 1
        if o == 'stowaways' and not (sneaky and ex <= 1): issues['sneaky side won with more than one Traveller left'] += 1
        if o == 'lost-steal' and not any(r['role'] == 'lost' and r['alive'] for r in roles.values()): issues['lost-steal without a Lost Soul'] += 1
        gains = {p['id']: p['gained'] for p in room['round_summary']['players']}
        for pid, r in roles.items():
            want = 2 if (o == 'explorers' and r['role'] == 'explorer') else 10 if (o == 'stowaways' and r['alive'] and r['role'] == 'stowaway') \
                else 6 if (o == 'stowaways' and r['alive'] and r['role'] == 'lost') else 6 if (o == 'lost-steal' and r['alive'] and r['role'] == 'lost') else 0
            if gains[pid] != want: issues[f'wrong points ({o}, {r["role"]})'] += 1
        seats = [p['seat'] for p in st['players']]
        if len(set(seats)) != len(seats): issues['duplicate seat numbers'] += 1
        if room['round_no'] != rnd + 1: issues['round number wrong'] += 1
    clear()
check('winners, points, seats and round numbers follow the rules (multi-round games)', not issues, dict(issues))

# ── 3. Word bag ──
# No pair twice before the bag is used up, and never the same category twice in a
# row unless every unused pair left is in that category (then a repeat is unavoidable).
code, ps = new_room(5, 1, 0, level='hard'); seen, last, errs = [], None, []
total = su("select count(*) c from yaaru_avan_word_pairs where level='hard'")[0]['c']
for i in range(2 * total + 5):
    before = su("select used_pairs, last_category from yaaru_avan_room_private rp join yaaru_avan_rooms r on r.id = rp.room_id where r.code = %s", (code,))[0]
    unused = [] if i == 0 else su("select category from yaaru_avan_word_pairs where level='hard' and not (id = any(%s))", (before['used_pairs'],))
    rpc('yaaru_avan_start_round', code, ps[0].tok, None, i == 0)
    row = su("select used_pairs, category from yaaru_avan_room_private rp join yaaru_avan_rooms r on r.id = rp.room_id where r.code = %s", (code,))[0]
    cur = row['used_pairs'][-1]
    if cur in seen and len(set(seen)) < total and len(row['used_pairs']) > 1: errs.append('pair repeated before the bag was used up')
    if i and row['category'] == last and any(u['category'] != last for u in unused): errs.append('same category twice although another was available')
    seen.append(cur); last = row['category']
    su("update yaaru_avan_rooms set phase = 'roundEnd' where code = %s", (code,))
check('word bag: no early repeats, category variety kept whenever possible', not errs, errs[:2]); clear()

# ── 4. Secrets and permissions ──
leaks = []
for t in ['yaaru_avan_player_private', 'yaaru_avan_room_private', 'yaaru_avan_votes', 'yaaru_avan_word_pairs', 'yaaru_avan_share_links', 'yaaru_avan_rooms', 'yaaru_avan_players']:
    try: API.cursor().execute(f'select * from public.{t} limit 1'); leaks.append(t)
    except psycopg2.Error: pass
check('the public key cannot read any game table directly', not leaks, leaks)
code, ps = new_room(4, 1, 0); host_only = []
for fn, args in [('yaaru_avan_start_round', (None, False)), ('yaaru_avan_set_locked', (True,)), ('yaaru_avan_kick', (ps[0].id,)), ('yaaru_avan_resolve_now', ()), ('yaaru_avan_end_game', ())]:
    try: rpc(fn, code, ps[1].tok, *args); host_only.append(fn)
    except Err: pass
check('players cannot use host-only actions', not host_only, host_only)
try: rpc('yaaru_avan_state', code, str(uuid.uuid4())); stranger = True
except Err: stranger = False
check('a stranger cannot read a room', not stranger); clear()

# ── 5. The Lost Soul cannot cheat ──
code, ps = new_room(6, 1, 1); host = ps[0]
rpc('yaaru_avan_start_round', code, host.tok, None, False)
roles = roles_of(code); lost = next(p for p in ps if roles[p.id]['role'] == 'lost')
for p in ps: rpc('yaaru_avan_ready', code, p.tok)
start_vote(code, host.tok)
for v in [p for p in ps if p.id != lost.id]: rpc('yaaru_avan_cast_vote', code, v.tok, lost.id)
rpc('yaaru_avan_cast_vote', code, lost.tok, next(p for p in ps if p.id != lost.id).id)
su("update yaaru_avan_rooms set offboard_at = now() - interval '10 seconds' where code = %s", (code,)); rpc('yaaru_avan_after_reveal', code, host.tok)
ew = next(r['word'] for r in roles.values() if r['role'] == 'explorer')
rpc('yaaru_avan_submit_guess', code, lost.tok, ew)
judge = next(p for p in ps if p.id != lost.id)
check('the guesser never receives the exact-match flag', state(code, lost)['room']['guess_match'] is None)
check('the judges do receive it', state(code, judge)['room']['guess_match'] is True)
try: rpc('yaaru_avan_submit_guess', code, lost.tok, 'second try'); second = True
except Err as e: second = e.code != 'already_guessed'
check('only one guess is accepted', not second)
rpc('yaaru_avan_judge_guess', code, judge.tok, True)
check('judging the guess ends the round', state(code, host)['room']['phase'] == 'roundEnd'); clear()

# ── 6. Host controls, joining, ties ──
code, ps = new_room(3, 1, 0); host = ps[0]
rpc('yaaru_avan_start_round', code, host.tok, None, False); [rpc('yaaru_avan_ready', code, p.tok) for p in ps]
start_vote(code, host.tok)
for i, p in enumerate(ps): rpc('yaaru_avan_cast_vote', code, p.tok, ps[(i + 1) % 3].id)
room = state(code, host)['room']
check('a tied vote asks everyone to vote again', room['phase'] == 'vote' and room['last_result']['tie'] is True)
check('a tie clears the "voted" flags', not any(p['voted'] for p in state(code, host)['players'])); clear()

code, ps = new_room(5, 1, 0); host = ps[0]
rpc('yaaru_avan_start_round', code, host.tok, None, False); [rpc('yaaru_avan_ready', code, p.tok) for p in ps]
start_vote(code, host.tok)
try: rpc('yaaru_avan_resolve_now', code, host.tok); early = True
except Err as e: early = e.code != 'no_votes_yet'
check('"reveal now" needs at least one vote', not early)
rpc('yaaru_avan_cast_vote', code, ps[1].tok, ps[2].id); rpc('yaaru_avan_cast_vote', code, ps[3].tok, ps[2].id)
rpc('yaaru_avan_resolve_now', code, host.tok)
check('"reveal now" offboards the top-voted player', state(code, host)['room']['out_player'] == ps[2].id)
try: rpc('yaaru_avan_cast_vote', code, ps[2].tok, ps[0].id); dead_vote = True
except Err: dead_vote = False
check('an offboard player cannot vote', not dead_vote); clear()

code, ps = new_room(4, 1, 0)
names = [p['name'] for p in (rpc('yaaru_avan_join', code, 'P1', str(uuid.uuid4())) and state(code, ps[0])['players'])]
check('duplicate names are numbered', len({n.lower() for n in names}) == len(names), names)
rpc('yaaru_avan_set_locked', code, ps[0].tok, True)
try: rpc('yaaru_avan_join', code, 'Late', str(uuid.uuid4())); locked = False
except Err as e: locked = e.code == 'room_locked'
check('a locked room refuses new players', locked)
rpc('yaaru_avan_set_locked', code, ps[0].tok, False); rpc('yaaru_avan_start_round', code, ps[0].tok, None, False)
check('a player who reconnects keeps their seat', rpc('yaaru_avan_join', code, 'x', ps[1].tok)['player_id'] == ps[1].id)
try: rpc('yaaru_avan_join', code, 'New', str(uuid.uuid4())); started = False
except Err as e: started = e.code == 'game_started'
check('nobody can join a game in progress', started); clear()

code, ps = new_room(15, 1, 0)
try: rpc('yaaru_avan_join', code, 'Sixteen', str(uuid.uuid4())); full = False
except Err as e: full = e.code == 'room_full'
check('the 16th player is refused', full); clear()

code, ps = new_room(4, 1, 0); rpc('yaaru_avan_leave', code, ps[0].tok)
check('the host leaving hands the room to the next player', state(code, ps[1])['room']['host_id'] == ps[1].id)
try: rpc('yaaru_avan_claim_host', code, ps[2].tok); claim = True
except Err as e: claim = e.code != 'host_present'
check('nobody can take over while the host is present', not claim)
su("update yaaru_avan_player_private set last_seen = now() - interval '5 minutes' where player_id = %s", (ps[1].id,))
rpc('yaaru_avan_claim_host', code, ps[2].tok)
check('anyone can take over once the host has gone quiet', state(code, ps[2])['room']['host_id'] == ps[2].id); clear()

code, ps = new_room(6, 2, 1, hide=True)
check('"hide counts" hides them from everyone but the host', state(code, ps[1])['counts'] is None and state(code, ps[0])['counts'] is not None); clear()

code, ps = new_room(5, 1, 0); st, _ = play_round(code, ps, 'smart', False)
pts = {p['id']: p['points'] for p in st['players']}; rpc('yaaru_avan_to_lobby', code, ps[0].tok); st2 = state(code, ps[0])
check('back to the lobby keeps scores and hides old roles', {p['id']: p['points'] for p in st2['players']} == pts and st2['me']['role'] is None)
st3, pr = play_round(code, ps, 'smart', False); check('a second game in the same room runs', st3['room']['phase'] == 'roundEnd' and not pr, pr)
rpc('yaaru_avan_start_round', code, ps[0].tok, None, True)
check('"new game" resets scores and round number', all(p['points'] == 0 for p in state(code, ps[0])['players']) and state(code, ps[0])['room']['round_no'] == 1); clear()

code, ps = new_room(4, 1, 0); rpc('yaaru_avan_start_round', code, ps[0].tok, None, False); [rpc('yaaru_avan_ready', code, p.tok) for p in ps]
rpc('yaaru_avan_begin_vote', code, ps[0].tok); room = state(code, ps[0])['room']
check('after the deal the first stop opens with the description round', room['phase'] == 'describe', room['phase'])
check('the room no longer carries the old challenge, speaking-order and timer columns', not {'challenges', 'turn_order', 'turn_pos', 'timer_started_at', 'challenge_id'} & room.keys(), sorted(room)); clear()

# ── 7. Live updates ──
def rev(code): return su("select s.rev from yaaru_avan_signal s join yaaru_avan_rooms r on r.id = s.room_id where r.code = %s", (code,))[0]['rev']
code, ps = new_room(5, 1, 0); r0 = rev(code); state(code, ps[1])
check('a heartbeat does not trigger refreshes', rev(code) == r0)
rpc('yaaru_avan_join', code, 'Zed', str(uuid.uuid4())); r1 = rev(code)
rpc('yaaru_avan_start_round', code, ps[0].tok, None, False); r2 = rev(code)
check('each action moves the live-update counter exactly once', (r1, r2) == (r0 + 1, r1 + 1), (r0, r1, r2))
cur = API.cursor(); cur.execute('select * from public.yaaru_avan_signal'); cols = [d[0] for d in cur.description]
check('the public live-update table exposes only room id + counter', cols == ['room_id', 'rev'], cols); clear()

# ── 8. Share links (Admin -> Games -> Play Stowaway) ──
AUTH = connect('authenticated')   # a signed-in admin (the test stub's is_admin() is always true)
def rpc_as(conn, fn, *args):
    cur = conn.cursor()
    try:
        cur.execute(f'select public.{fn}({",".join(["%s"] * len(args))})', args)
        return cur.fetchone()[0]
    except psycopg2.Error as e:
        raise Err((e.pgerror or str(e)).split('\n')[0].replace('ERROR:', '').strip())
su('delete from yaaru_avan_share_links')
names = ['Asha', 'Ravi', 'Meena', 'Karthik']
sc = rpc_as(AUTH, 'yaaru_avan_create_share', names, 'Coorg Escape')
check('an admin can make a share link with a 4-character code', isinstance(sc, str) and len(sc) == 4 and sc == sc.lower(), sc)
got = rpc_as(API, 'yaaru_avan_get_share', sc.upper())
check('anyone can open a link by its code (any letter case)', got and got['players'] == names and got['trip_title'] == 'Coorg Escape', got)
check('an unknown code opens nothing', rpc_as(API, 'yaaru_avan_get_share', 'zzzz') is None)
blocked = []
for fn, args in [('yaaru_avan_create_share', (names, 'x')), ('yaaru_avan_update_share', (sc, names, 'x'))]:
    try: rpc_as(API, fn, *args); blocked.append(fn)
    except Err: pass
check('the public key cannot create or change a share link', not blocked, blocked)
bad = []
for pl in (['A', 'B'], [f'P{i}' for i in range(16)], ['A', '  ', 'B', ''], None):
    try: rpc_as(AUTH, 'yaaru_avan_create_share', pl, ''); bad.append(pl)
    except Err: pass
check('a link needs 3 to 15 real names', not bad, bad)
cl = rpc_as(AUTH, 'yaaru_avan_create_share', ['  Priya\t ', '', 'X' * 40, 'Ravi', 'Meena'], '')
check('names are trimmed, blanks dropped and capped at 18 characters', rpc_as(API, 'yaaru_avan_get_share', cl)['players'] == ['Priya', 'X' * 18, 'Ravi', 'Meena'])
check('updating keeps the same code and swaps the players', rpc_as(AUTH, 'yaaru_avan_update_share', sc, ['Zed', 'Yan', 'Xin'], 'Hampi') is True
      and rpc_as(API, 'yaaru_avan_get_share', sc) == {'players': ['Zed', 'Yan', 'Xin'], 'trip_title': 'Hampi'})
check('updating an unknown code reports false', rpc_as(AUTH, 'yaaru_avan_update_share', 'zzzz', names, '') is False)
su("update yaaru_avan_share_links set expires_at = now() - interval '1 minute' where code = %s", (sc,))
check('an expired link opens nothing', rpc_as(API, 'yaaru_avan_get_share', sc) is None)
rpc_as(AUTH, 'yaaru_avan_create_share', names, '')
check('making a new link clears expired ones', su('select count(*) n from yaaru_avan_share_links where code = %s', (sc,))[0]['n'] == 0)
su('delete from yaaru_avan_share_links')


# ── special roles (online) ──
SPECIAL_IDS = {'clown', 'rivals', 'sleepyhead', 'returnTicket', 'tripLeader', 'backseatRider', 'driver', 'buddies', 'payback', 'luckyDip'}
DIP_OK = {'clown', 'sleepyhead', 'returnTicket', 'tripLeader', 'backseatRider', 'driver'}

def specials_of(code):
    return su("""select pp.player_id, pp.special, pp.dip_as, pp.partner from yaaru_avan_player_private pp
        join yaaru_avan_players p on p.id = pp.player_id join yaaru_avan_rooms r on r.id = p.room_id where r.code = %s""", (code,))

# 1. Dealing: caps, pairs, Lucky Dip, off by default
deal_bad = collections.Counter(); seen_specials = set()
for _ in range(40 if QUICK else 200):
    n = random.randint(3, 15); code, ps = new_room(n)
    rpc('yaaru_avan_start_round', code, ps[0].tok, None, False)
    if any(r['special'] or r['dip_as'] for r in specials_of(code)): deal_bad['specials dealt while the switch is off'] += 1
    su("update yaaru_avan_rooms set phase = 'lobby' where code = %s", (code,))
    rpc('yaaru_avan_set_settings', code, ps[0].tok, 1, 0, 'medium', False, False, True)
    rpc('yaaru_avan_start_round', code, ps[0].tok, None, False)
    rows = specials_of(code); by = {r['player_id']: r for r in rows}
    got = [r for r in rows if r['special']]
    if len(got) > n // 3: deal_bad['more than one special per 3 players'] += 1
    seen_specials |= {r['special'] for r in got}
    for r in got:
        if r['special'] not in SPECIAL_IDS: deal_bad['unknown special'] += 1
        if r['special'] in ('rivals', 'buddies'):
            q = by.get(r['partner'])
            if not q or q['special'] != r['special'] or q['partner'] != r['player_id']: deal_bad['pair not matched'] += 1
        elif r['partner']: deal_bad['solo special has a partner'] += 1
        if r['special'] == 'luckyDip':
            others = {x['special'] for x in got if x is not r}
            if r['dip_as'] not in DIP_OK or r['dip_as'] in others: deal_bad['bad Lucky Dip draw'] += 1
        elif r['dip_as']: deal_bad['dip_as on a non Lucky Dip'] += 1
    clear()
check('specials are only dealt when the room switch is on', 'specials dealt while the switch is off' not in deal_bad, deal_bad)
check('at most one special per 3 players, pairs matched, Lucky Dip draws a free solo ability', not deal_bad, deal_bad)
check('every kind of special turns up across many deals', SPECIAL_IDS <= seen_specials, SPECIAL_IDS - seen_specials)

# helpers for forced scenarios
def scenario(n, stowaway_idx, specials, lost_idx=()):
    code, ps = new_room(n, len(stowaway_idx), len(lost_idx))
    rpc('yaaru_avan_start_round', code, ps[0].tok, None, False)
    rp = su('select pp.* from yaaru_avan_room_private pp join yaaru_avan_rooms r on r.id = pp.room_id where r.code = %s', (code,))[0]
    for i, p in enumerate(ps):
        role = 'stowaway' if i in stowaway_idx else 'lost' if i in lost_idx else 'explorer'
        su('update yaaru_avan_player_private set role = %s, word = %s where player_id = %s',
           (role, rp['stowaway_word'] if role == 'stowaway' else None if role == 'lost' else rp['explorer_word'], p.id))
    su('update yaaru_avan_player_private set special = null, dip_as = null, partner = null where player_id = any(%s::uuid[])', ([p.id for p in ps],))
    for i, (sp, partner) in specials.items():
        su('update yaaru_avan_player_private set special = %s, partner = %s where player_id = %s',
           (sp, ps[partner].id if partner is not None else None, ps[i].id))
    for p in ps: rpc('yaaru_avan_ready', code, p.tok)
    rpc('yaaru_avan_begin_vote', code, ps[0].tok)     # deal -> description round
    to_vote(code, ps)
    return code, ps, rp

def phase(code, ps): return state(code, ps[0])['room']['phase']
def to_vote(code, ps):
    # The host skips the description round (it has its own checks below).
    if phase(code, ps) == 'describe': rpc('yaaru_avan_begin_vote', code, ps[0].tok)
def vote_for(code, ps, target, skip=()):
    for p in ps:
        if p is target or p in skip: continue
        if not state(code, p)['me']['can_vote']: continue
        if phase(code, ps) != 'vote': break
        rpc('yaaru_avan_cast_vote', code, p.tok, target.id)
    if phase(code, ps) == 'vote' and target not in skip and state(code, target)['me']['can_vote']:
        other = next(p for p in ps if p is not target and state(code, p)['players'][0] and next(x for x in state(code, p)['players'] if x['id'] == p.id)['alive'])
        rpc('yaaru_avan_cast_vote', code, target.tok, other.id)
def reveal(code, ps):
    su("update yaaru_avan_rooms set offboard_at = now() - interval '10 seconds' where code = %s", (code,))
    rpc('yaaru_avan_after_reveal', code, ps[1].tok)
    to_vote(code, ps)
def gains(code, ps):
    return {p.id: g for p in ps for g in [next(x['gained'] for x in state(code, ps[0])['room']['round_summary']['players'] if x['id'] == p.id)]}

# 2. One long round that uses most specials
code, ps, rp = scenario(9, {7, 8}, {1: ('payback', None), 2: ('backseatRider', None), 3: ('sleepyhead', None),
                                    4: ('clown', None), 5: ('buddies', 6), 6: ('buddies', 5), 0: ('returnTicket', None)})
issues = []
vote_for(code, ps, ps[4]); reveal(code, ps)                          # Clown out at stop 1
if phase(code, ps) != 'vote' or state(code, ps[0])['room']['stop_no'] != 2: issues.append('stop 2 did not start after the Clown')
vote_for(code, ps, ps[0])                                            # Return Ticket: vote cancelled
r = state(code, ps[0])['room']
if r['phase'] != 'vote' or not (r['last_result'] or {}).get('saved') or r['stop_no'] != 2: issues.append('Return Ticket did not cancel the vote')
if not next(x for x in state(code, ps[1])['players'] if x['id'] == ps[0].id)['alive']: issues.append('Return Ticket holder was removed')
vote_for(code, ps, ps[0]); reveal(code, ps)                          # second vote works
if phase(code, ps) != 'vote' or next(x for x in state(code, ps[1])['players'] if x['id'] == ps[0].id)['alive']: issues.append('Return Ticket worked twice')
vote_for(code, ps, ps[2]); reveal(code, ps)                          # Backseat Rider out -> guess
if phase(code, ps) != 'guess': issues.append(f'Backseat Rider did not get a guess (phase {phase(code, ps)})')
rpc('yaaru_avan_submit_guess', code, ps[2].tok, rp['stowaway_word'])   # a Traveller guesses the Pickpockets' word
if state(code, ps[3])['room']['guess_match'] is not True: issues.append('Rider guess not matched against the other side word')
if state(code, ps[2])['room']['guess_match'] is not None: issues.append('Rider could see the verdict')
try: rpc('yaaru_avan_judge_guess', code, ps[2].tok, True); issues.append('Rider judged own guess')
except Err: pass
rpc('yaaru_avan_judge_guess', code, ps[3].tok, True)
if phase(code, ps) != 'describe': issues.append('round did not continue with a description round after the Rider guess')
to_vote(code, ps)
if phase(code, ps) != 'vote': issues.append('round did not continue after the Rider guess')
if not state(code, ps[2])['me']['can_vote']: issues.append('Rider cannot vote after leaving')
if state(code, ps[4])['me']['can_vote']: issues.append('a plain out player can vote')
# stop 4: the Rider still votes, and the vote waits for the Rider
for p in ps:
    if p is ps[2] or not state(code, p)['me']['can_vote']: continue
    rpc('yaaru_avan_cast_vote', code, p.tok, (ps[3] if p is ps[1] else ps[1]).id)
if phase(code, ps) != 'vote': issues.append('the vote resolved without the Backseat Rider')
rpc('yaaru_avan_cast_vote', code, ps[2].tok, ps[1].id)
if phase(code, ps) != 'offboard': issues.append('the vote did not resolve once the Rider voted')
if phase(code, ps) == 'offboard' and state(code, ps[0])['room']['last_result'].get('special') != 'payback': issues.append('offboard reveal did not name the special')
reveal(code, ps)                                                     # Payback phase
if phase(code, ps) != 'payback': issues.append(f'no Payback phase (phase {phase(code, ps)})')
try: rpc('yaaru_avan_payback', code, ps[3].tok, ps[7].id); issues.append('someone else used the Payback')
except Err: pass
try: rpc('yaaru_avan_payback', code, ps[1].tok, ps[4].id); issues.append('Payback hit a player who was already out')
except Err: pass
rpc('yaaru_avan_payback', code, ps[1].tok, ps[7].id)
if phase(code, ps) != 'offboard' or state(code, ps[0])['room']['out_player'] != ps[7].id: issues.append('Payback did not take the victim out')
reveal(code, ps)
if phase(code, ps) != 'vote': issues.append(f'game did not go on after Payback (phase {phase(code, ps)})')
vote_for(code, ps, ps[8]); reveal(code, ps)                          # last Pickpocket caught
end = state(code, ps[0])['room']
if end['phase'] != 'roundEnd' or end['outcome'] != 'explorers': issues.append('round did not end with a Traveller win')
else:
    g = gains(code, ps)
    want = {0: 2, 1: 2 + 2, 2: 2 + 3, 3: 2 + 1, 4: 2 + 4, 5: 2 + 2, 6: 2 + 2, 7: 0, 8: 0}
    for i, w in want.items():
        if g[ps[i].id] != w: issues.append(f'P{i} scored {g[ps[i].id]}, expected {w}')
    sm = {x['id']: x for x in end['round_summary']['players']}
    if sm[ps[4].id].get('special') != 'clown' or sm[ps[4].id].get('bonus') != 4: issues.append('round summary does not show specials and bonuses')
check('Clown, Return Ticket, Backseat Rider, Payback, Sleepyhead and Buddies play out and score correctly', not issues, issues[:4])
clear()

# 3. A Traveller Backseat Rider guessing their own word is wrong
code, ps, rp = scenario(6, {5}, {1: ('backseatRider', None)})
vote_for(code, ps, ps[1]); reveal(code, ps)
rpc('yaaru_avan_submit_guess', code, ps[1].tok, rp['explorer_word'])
check('a Traveller Backseat Rider is checked against the Pickpockets word, not their own',
      state(code, ps[0])['room']['guess_match'] is False)
clear()

# 4. Rivals: the one whose rival goes first scores
code, ps, rp = scenario(6, {5}, {1: ('rivals', 2), 2: ('rivals', 1)})
vote_for(code, ps, ps[1]); reveal(code, ps); vote_for(code, ps, ps[5]); reveal(code, ps)
g = gains(code, ps) if phase(code, ps) == 'roundEnd' else {}
check('Rivals: +2 for the rival who outlasts the other', g and g[ps[2].id] == 4 and g[ps[1].id] == 2, g)
clear()

# 5. Trip Leader breaks a tie; without one it is still a tie
def tie_votes(code, ps):
    for voter, target in [(0, 1), (3, 1), (1, 2), (4, 2), (2, 5), (5, 4)]:
        if phase(code, ps) == 'vote': rpc('yaaru_avan_cast_vote', code, ps[voter].tok, ps[target].id)
code, ps, rp = scenario(6, {5}, {0: ('tripLeader', None)})
tie_votes(code, ps)
r = state(code, ps[0])['room']
check('the Trip Leader breaks a tie with their own vote', r['phase'] == 'offboard' and r['out_player'] == ps[1].id, r['phase'])
clear()
code, ps, rp = scenario(6, {5}, {})
tie_votes(code, ps)
r = state(code, ps[0])['room']
check('with no Trip Leader a tie is still a tie', r['phase'] == 'vote' and r['last_result']['tie'] is True, r['phase'])
clear()

# 6. Who can see what
code, ps, rp = scenario(6, {5}, {0: ('tripLeader', None), 3: ('driver', None), 1: ('clown', None), 2: ('rivals', 4), 4: ('rivals', 2)})
pubs = {x['id']: x['public_special'] for x in state(code, ps[1])['players']}
me1, me2 = state(code, ps[1])['me'], state(code, ps[2])['me']
leak = [k for x in state(code, ps[1])['players'] for k in x if k in ('special', 'dip_as', 'partner')]
check('everyone sees the Trip Leader and Driver, nobody sees other specials or partners',
      pubs[ps[0].id] == 'tripLeader' and pubs[ps[3].id] == 'driver' and pubs[ps[1].id] is None and pubs[ps[2].id] is None
      and me1['special'] == 'clown' and me1['partner'] is None and me2['special'] == 'rivals' and me2['partner'] == ps[4].name and not leak,
      (pubs, me1, me2, leak))
clear()

# 7. The new calls are not open to the wrong people
bad = []
for fn, args in [('_ya_after_out', (str(uuid.uuid4()), str(uuid.uuid4()))), ('_ya_active', (str(uuid.uuid4()),))]:
    try: rpc(fn, *args); bad.append(fn)
    except Err: pass
check('the internal special-role helpers cannot be called with the public key', not bad, bad)


# ── Undercover rules (online): description round, win condition, points, role counts ──
def room(code, ps): return state(code, ps[0])['room']

# 8. The description round
code, ps = new_room(6, 1, 0)
rpc('yaaru_avan_start_round', code, ps[0].tok, None, False)
for p in ps: rpc('yaaru_avan_ready', code, p.tok)
rpc('yaaru_avan_begin_vote', code, ps[0].tok)
r = room(code, ps); st = state(code, ps[0]); seat_of = {x['id']: x['seat_idx'] for x in st['players']}
order = r['describe_order']
want = sorted(seat_of, key=lambda i: (seat_of[i] - r['start_idx']) % 6)
check('the first stop starts with a description round, from the random starting seat, round the table',
      r['phase'] == 'describe' and r['describe_pos'] == 0 and order == want, (r['phase'], order, want))
byid = {p.id: p for p in ps}
speaker, other = byid[order[0]], byid[order[3]]
try: rpc('yaaru_avan_describe_done', code, other.tok, 0); wrong = False
except Err as e: wrong = e.code == 'not_your_turn'
check('only the current speaker or the host can finish a turn', wrong and room(code, ps)['describe_pos'] == 0)
rpc('yaaru_avan_describe_done', code, speaker.tok, 0)
rpc('yaaru_avan_describe_done', code, speaker.tok, 0)        # a double tap from the same screen
check('a turn finishes once: a repeated tap does not skip the next speaker', room(code, ps)['describe_pos'] == 1, room(code, ps)['describe_pos'])
for k in range(1, 6): rpc('yaaru_avan_describe_done', code, byid[order[k]].tok, k)
check('after the last speaker the group moves on to the discussion and vote', room(code, ps)['phase'] == 'vote' and room(code, ps)['describe_order'] == [])
clear()

# 9. Later stops, Driver and Sleepyhead, host skip
code, ps, rp = scenario(7, {6}, {})
vote_target = ps[2]
for p in ps:
    if p is vote_target: continue
    rpc('yaaru_avan_cast_vote', code, p.tok, vote_target.id)
rpc('yaaru_avan_cast_vote', code, vote_target.tok, ps[0].id)
su("update yaaru_avan_rooms set offboard_at = now() - interval '10 seconds' where code = %s", (code,))
rpc('yaaru_avan_after_reveal', code, ps[1].tok)
r = room(code, ps); st = state(code, ps[0]); seat_of = {x['id']: x['seat_idx'] for x in st['players']}
gone = seat_of[vote_target.id]
alive_ids = [x['id'] for x in st['players'] if x['alive']]
want = sorted(alive_ids, key=lambda i: (seat_of[i] - (gone + 1)) % 7)
check('the next stop starts a new description round at the seat after the player who left, without them',
      r['phase'] == 'describe' and r['stop_no'] == 2 and r['describe_order'] == want and vote_target.id not in r['describe_order'], (r['phase'], r['describe_order'], want))
clear()

code, ps, rp = scenario(6, {5}, {3: ('driver', None), 4: ('sleepyhead', None)})
# scenario() skipped the first description round; rebuild stop 1 to look at its order
su("update yaaru_avan_rooms set phase = 'deal' where code = %s", (code,))
rpc('yaaru_avan_begin_vote', code, ps[0].tok)
r = room(code, ps)
check('a Driver starts the description round and a Sleepyhead sits out Stop 1',
      r['describe_order'][0] == ps[3].id and ps[4].id not in r['describe_order'] and len(r['describe_order']) == 5, r['describe_order'])
rpc('yaaru_avan_begin_vote', code, ps[0].tok)
check('the host can skip the description round', room(code, ps)['phase'] == 'vote')
try: rpc('yaaru_avan_begin_vote', code, ps[1].tok); skipped = True
except Err: skipped = False
check('only the host can start or skip it', not skipped)
clear()

# 10. Win condition and points: the sneaky side needs ONE Traveller left
code, ps, rp = scenario(5, {3, 4}, {})
vote_for(code, ps, ps[0]); reveal(code, ps)
r = room(code, ps)
check('with 2 Pickpockets against 2 Travellers the game goes on (Undercover rule)', r['phase'] == 'vote' and r['stop_no'] == 2, (r['phase'], r['stop_no']))
vote_for(code, ps, ps[1]); reveal(code, ps)
r = room(code, ps); g = gains(code, ps) if r['phase'] == 'roundEnd' else {}
check('with one Traveller left the Pickpockets win: 10 each, Travellers 0',
      r['phase'] == 'roundEnd' and r['outcome'] == 'stowaways' and g[ps[3].id] == 10 and g[ps[4].id] == 10 and g[ps[0].id] == 0 and g[ps[2].id] == 0, (r['phase'], r['outcome'], g))
clear()

code, ps, rp = scenario(4, set(), {}, lost_idx={3})
vote_for(code, ps, ps[0]); reveal(code, ps); vote_for(code, ps, ps[1]); reveal(code, ps)
r = room(code, ps); g = gains(code, ps) if r['phase'] == 'roundEnd' else {}
check('a Stranger-only game works, and a Stranger who lasts to the end scores 6',
      r['phase'] == 'roundEnd' and r['outcome'] == 'stowaways' and g[ps[3].id] == 6, (r['phase'], g))
clear()

code, ps, rp = scenario(5, {4}, {}, lost_idx={3})
vote_for(code, ps, ps[3]); reveal(code, ps)
rpc('yaaru_avan_submit_guess', code, ps[3].tok, rp['explorer_word']); rpc('yaaru_avan_judge_guess', code, ps[0].tok, True)
r = room(code, ps); g = gains(code, ps) if r['phase'] == 'roundEnd' else {}
check('a Stranger who guesses the Travellers word wins at once for 6, everyone else 0',
      r['phase'] == 'roundEnd' and r['outcome'] == 'lost-steal' and g[ps[3].id] == 6 and sum(g.values()) == 6, (r['phase'], g))
clear()

code, ps, rp = scenario(5, {3}, {})
vote_for(code, ps, ps[3]); reveal(code, ps)
r = room(code, ps); g = gains(code, ps) if r['phase'] == 'roundEnd' else {}
check('Travellers win for 2 each when every Pickpocket is caught', r['outcome'] == 'explorers' and all(g[ps[i].id] == 2 for i in (0, 1, 2)) and g[ps[3].id] == 0 and g[ps[4].id] == 2, (r['outcome'], g))
clear()

# 11. At least one Pickpocket or one Stranger
bad = []
for n, stow, lost in [(5, 0, 1), (9, 0, 1), (12, 0, 2)]:
    code, ps = new_room(n, stow, lost); rpc('yaaru_avan_start_round', code, ps[0].tok, None, False)
    c = collections.Counter(r['role'] for r in roles_of(code).values())
    if (c['stowaway'], c['lost']) != (stow, lost): bad.append((n, stow, lost, dict(c)))
    clear()
code, ps = new_room(6, 0, 0)
sv = su('select pp.stowaways, pp.lost from yaaru_avan_room_private pp join yaaru_avan_rooms r on r.id = pp.room_id where r.code = %s', (code,))[0]
check('Stranger-only splits are dealt as asked', not bad, bad)
check('asking for no Pickpockets and no Strangers falls back to one Pickpocket', (sv['stowaways'], sv['lost']) == (1, 0), sv)
clear()

# ── report ──
width = max(len(n) for n, _, _ in RESULTS)
for n, ok, d in RESULTS: print(('PASS  ' if ok else 'FAIL  ') + n + (f'\n        -> {d}' if not ok else ''))
failed = [n for n, ok, _ in RESULTS if not ok]
print(f'\n{len(RESULTS) - len(failed)} of {len(RESULTS)} checks passed' + ('' if not failed else f'; FAILED: {len(failed)}'))
sys.exit(1 if failed else 0)
