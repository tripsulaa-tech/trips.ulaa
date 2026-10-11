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

def state(code, p): return rpc('stowaway_state', code, p.tok)
def clear(): su('delete from stowaway_rooms')

def new_room(n, stow=1, lost=0, level='medium', hide=False):
    ps = [P(f'P{i}') for i in range(n)]
    r = rpc('stowaway_create_room', ps[0].name, ps[0].tok, 'Test'); code = r['code']; ps[0].id = r['player_id']
    for p in ps[1:]: p.id = rpc('stowaway_join', code, p.name, p.tok)['player_id']
    rpc('stowaway_set_settings', code, ps[0].tok, stow, lost, level, hide, False)
    return code, ps

def roles_of(code):
    return {r['player_id']: r for r in su("""select pp.player_id, pp.role, pp.word, p.alive from stowaway_player_private pp
        join stowaway_players p on p.id = pp.player_id join stowaway_rooms r on r.id = p.room_id where r.code = %s""", (code,))}

def play_round(code, ps, policy='random', check_counts=True):
    host, byid, problems = ps[0], {p.id: p for p in ps}, []
    rpc('stowaway_start_round', code, host.tok, None, False)
    roles = roles_of(code); cnt = collections.Counter(r['role'] for r in roles.values())
    c = state(code, host)['counts']
    if check_counts and c and (c['explorers'], c['stowaways'], c['lost']) != (cnt['explorer'], cnt['stowaway'], cnt['lost']):
        problems.append(f'counts shown {c} but dealt {dict(cnt)}')
    for p in ps:
        me = state(code, p)['me']
        if me['role'] != roles[p.id]['role'] or me['word'] != roles[p.id]['word']: problems.append('a player was shown the wrong role/word')
    for p in ps: rpc('stowaway_ready', code, p.tok)
    rpc('stowaway_begin_vote', code, host.tok)
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
                rpc('stowaway_cast_vote', code, v.tok, tgt.id)
        elif ph == 'offboard':
            su("update stowaway_rooms set offboard_at = now() - interval '10 seconds' where code = %s", (code,))
            rpc('stowaway_after_reveal', code, random.choice(ps).tok)
        elif ph == 'guess':
            outp = byid[room['out_player']]; ew = next(r['word'] for r in roles_of(code).values() if r['role'] == 'explorer')
            right = random.random() < .3
            if room['guess_text'] is None: rpc('stowaway_submit_guess', code, outp.tok, ew if right else 'zzzz')
            rpc('stowaway_judge_guess', code, random.choice([p for p in ps if p.id != outp.id]).tok, right)
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
        if o == 'stowaways' and not (sneaky and sneaky >= ex): issues['sneaky side won without reaching parity'] += 1
        if o == 'lost-steal' and not any(r['role'] == 'lost' and r['alive'] for r in roles.values()): issues['lost-steal without a Lost Soul'] += 1
        gains = {p['id']: p['gained'] for p in room['round_summary']['players']}
        for pid, r in roles.items():
            want = 2 if (o == 'explorers' and r['role'] == 'explorer') else 3 if (o == 'stowaways' and r['alive'] and r['role'] != 'explorer') \
                else 4 if (o == 'lost-steal' and r['alive'] and r['role'] == 'lost') else 0
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
total = su("select count(*) c from stowaway_word_pairs where level='hard'")[0]['c']
for i in range(2 * total + 5):
    before = su("select used_pairs, last_category from stowaway_room_private rp join stowaway_rooms r on r.id = rp.room_id where r.code = %s", (code,))[0]
    unused = [] if i == 0 else su("select category from stowaway_word_pairs where level='hard' and not (id = any(%s))", (before['used_pairs'],))
    rpc('stowaway_start_round', code, ps[0].tok, None, i == 0)
    row = su("select used_pairs, category from stowaway_room_private rp join stowaway_rooms r on r.id = rp.room_id where r.code = %s", (code,))[0]
    cur = row['used_pairs'][-1]
    if cur in seen and len(set(seen)) < total and len(row['used_pairs']) > 1: errs.append('pair repeated before the bag was used up')
    if i and row['category'] == last and any(u['category'] != last for u in unused): errs.append('same category twice although another was available')
    seen.append(cur); last = row['category']
    su("update stowaway_rooms set phase = 'roundEnd' where code = %s", (code,))
check('word bag: no early repeats, category variety kept whenever possible', not errs, errs[:2]); clear()

# ── 4. Secrets and permissions ──
leaks = []
for t in ['stowaway_player_private', 'stowaway_room_private', 'stowaway_votes', 'stowaway_word_pairs', 'stowaway_share_links', 'stowaway_rooms', 'stowaway_players']:
    try: API.cursor().execute(f'select * from public.{t} limit 1'); leaks.append(t)
    except psycopg2.Error: pass
check('the public key cannot read any game table directly', not leaks, leaks)
code, ps = new_room(4, 1, 0); host_only = []
for fn, args in [('stowaway_start_round', (None, False)), ('stowaway_set_locked', (True,)), ('stowaway_kick', (ps[0].id,)), ('stowaway_resolve_now', ()), ('stowaway_end_game', ())]:
    try: rpc(fn, code, ps[1].tok, *args); host_only.append(fn)
    except Err: pass
check('players cannot use host-only actions', not host_only, host_only)
try: rpc('stowaway_state', code, str(uuid.uuid4())); stranger = True
except Err: stranger = False
check('a stranger cannot read a room', not stranger); clear()

# ── 5. The Lost Soul cannot cheat ──
code, ps = new_room(6, 1, 1); host = ps[0]
rpc('stowaway_start_round', code, host.tok, None, False)
roles = roles_of(code); lost = next(p for p in ps if roles[p.id]['role'] == 'lost')
for p in ps: rpc('stowaway_ready', code, p.tok)
rpc('stowaway_begin_vote', code, host.tok)
for v in [p for p in ps if p.id != lost.id]: rpc('stowaway_cast_vote', code, v.tok, lost.id)
rpc('stowaway_cast_vote', code, lost.tok, next(p for p in ps if p.id != lost.id).id)
su("update stowaway_rooms set offboard_at = now() - interval '10 seconds' where code = %s", (code,)); rpc('stowaway_after_reveal', code, host.tok)
ew = next(r['word'] for r in roles.values() if r['role'] == 'explorer')
rpc('stowaway_submit_guess', code, lost.tok, ew)
judge = next(p for p in ps if p.id != lost.id)
check('the guesser never receives the exact-match flag', state(code, lost)['room']['guess_match'] is None)
check('the judges do receive it', state(code, judge)['room']['guess_match'] is True)
try: rpc('stowaway_submit_guess', code, lost.tok, 'second try'); second = True
except Err as e: second = e.code != 'already_guessed'
check('only one guess is accepted', not second)
rpc('stowaway_judge_guess', code, judge.tok, True)
check('judging the guess ends the round', state(code, host)['room']['phase'] == 'roundEnd'); clear()

# ── 6. Host controls, joining, ties ──
code, ps = new_room(3, 1, 0); host = ps[0]
rpc('stowaway_start_round', code, host.tok, None, False); [rpc('stowaway_ready', code, p.tok) for p in ps]
rpc('stowaway_begin_vote', code, host.tok)
for i, p in enumerate(ps): rpc('stowaway_cast_vote', code, p.tok, ps[(i + 1) % 3].id)
room = state(code, host)['room']
check('a tied vote asks everyone to vote again', room['phase'] == 'vote' and room['last_result']['tie'] is True)
check('a tie clears the "voted" flags', not any(p['voted'] for p in state(code, host)['players'])); clear()

code, ps = new_room(5, 1, 0); host = ps[0]
rpc('stowaway_start_round', code, host.tok, None, False); [rpc('stowaway_ready', code, p.tok) for p in ps]
rpc('stowaway_begin_vote', code, host.tok)
try: rpc('stowaway_resolve_now', code, host.tok); early = True
except Err as e: early = e.code != 'no_votes_yet'
check('"reveal now" needs at least one vote', not early)
rpc('stowaway_cast_vote', code, ps[1].tok, ps[2].id); rpc('stowaway_cast_vote', code, ps[3].tok, ps[2].id)
rpc('stowaway_resolve_now', code, host.tok)
check('"reveal now" offboards the top-voted player', state(code, host)['room']['out_player'] == ps[2].id)
try: rpc('stowaway_cast_vote', code, ps[2].tok, ps[0].id); dead_vote = True
except Err: dead_vote = False
check('an offboard player cannot vote', not dead_vote); clear()

code, ps = new_room(4, 1, 0)
names = [p['name'] for p in (rpc('stowaway_join', code, 'P1', str(uuid.uuid4())) and state(code, ps[0])['players'])]
check('duplicate names are numbered', len({n.lower() for n in names}) == len(names), names)
rpc('stowaway_set_locked', code, ps[0].tok, True)
try: rpc('stowaway_join', code, 'Late', str(uuid.uuid4())); locked = False
except Err as e: locked = e.code == 'room_locked'
check('a locked room refuses new players', locked)
rpc('stowaway_set_locked', code, ps[0].tok, False); rpc('stowaway_start_round', code, ps[0].tok, None, False)
check('a player who reconnects keeps their seat', rpc('stowaway_join', code, 'x', ps[1].tok)['player_id'] == ps[1].id)
try: rpc('stowaway_join', code, 'New', str(uuid.uuid4())); started = False
except Err as e: started = e.code == 'game_started'
check('nobody can join a game in progress', started); clear()

code, ps = new_room(15, 1, 0)
try: rpc('stowaway_join', code, 'Sixteen', str(uuid.uuid4())); full = False
except Err as e: full = e.code == 'room_full'
check('the 16th player is refused', full); clear()

code, ps = new_room(4, 1, 0); rpc('stowaway_leave', code, ps[0].tok)
check('the host leaving hands the room to the next player', state(code, ps[1])['room']['host_id'] == ps[1].id)
try: rpc('stowaway_claim_host', code, ps[2].tok); claim = True
except Err as e: claim = e.code != 'host_present'
check('nobody can take over while the host is present', not claim)
su("update stowaway_player_private set last_seen = now() - interval '5 minutes' where player_id = %s", (ps[1].id,))
rpc('stowaway_claim_host', code, ps[2].tok)
check('anyone can take over once the host has gone quiet', state(code, ps[2])['room']['host_id'] == ps[2].id); clear()

code, ps = new_room(6, 2, 1, hide=True)
check('"hide counts" hides them from everyone but the host', state(code, ps[1])['counts'] is None and state(code, ps[0])['counts'] is not None); clear()

code, ps = new_room(5, 1, 0); st, _ = play_round(code, ps, 'smart', False)
pts = {p['id']: p['points'] for p in st['players']}; rpc('stowaway_to_lobby', code, ps[0].tok); st2 = state(code, ps[0])
check('back to the lobby keeps scores and hides old roles', {p['id']: p['points'] for p in st2['players']} == pts and st2['me']['role'] is None)
st3, pr = play_round(code, ps, 'smart', False); check('a second game in the same room runs', st3['room']['phase'] == 'roundEnd' and not pr, pr)
rpc('stowaway_start_round', code, ps[0].tok, None, True)
check('"new game" resets scores and round number', all(p['points'] == 0 for p in state(code, ps[0])['players']) and state(code, ps[0])['room']['round_no'] == 1); clear()

code, ps = new_room(4, 1, 0); rpc('stowaway_start_round', code, ps[0].tok, None, False); [rpc('stowaway_ready', code, p.tok) for p in ps]
rpc('stowaway_begin_vote', code, ps[0].tok); room = state(code, ps[0])['room']
check('after the deal the game goes straight to the vote', room['phase'] == 'vote', room['phase'])
check('the room no longer carries the old challenge, speaking-order and timer columns', not {'challenges', 'turn_order', 'turn_pos', 'timer_started_at', 'challenge_id'} & room.keys(), sorted(room)); clear()

# ── 7. Live updates ──
def rev(code): return su("select s.rev from stowaway_signal s join stowaway_rooms r on r.id = s.room_id where r.code = %s", (code,))[0]['rev']
code, ps = new_room(5, 1, 0); r0 = rev(code); state(code, ps[1])
check('a heartbeat does not trigger refreshes', rev(code) == r0)
rpc('stowaway_join', code, 'Zed', str(uuid.uuid4())); r1 = rev(code)
rpc('stowaway_start_round', code, ps[0].tok, None, False); r2 = rev(code)
check('each action moves the live-update counter exactly once', (r1, r2) == (r0 + 1, r1 + 1), (r0, r1, r2))
cur = API.cursor(); cur.execute('select * from public.stowaway_signal'); cols = [d[0] for d in cur.description]
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
su('delete from stowaway_share_links')
names = ['Asha', 'Ravi', 'Meena', 'Karthik']
sc = rpc_as(AUTH, 'stowaway_create_share', names, 'Coorg Escape')
check('an admin can make a share link with a 4-character code', isinstance(sc, str) and len(sc) == 4 and sc == sc.lower(), sc)
got = rpc_as(API, 'stowaway_get_share', sc.upper())
check('anyone can open a link by its code (any letter case)', got and got['players'] == names and got['trip_title'] == 'Coorg Escape', got)
check('an unknown code opens nothing', rpc_as(API, 'stowaway_get_share', 'zzzz') is None)
blocked = []
for fn, args in [('stowaway_create_share', (names, 'x')), ('stowaway_update_share', (sc, names, 'x'))]:
    try: rpc_as(API, fn, *args); blocked.append(fn)
    except Err: pass
check('the public key cannot create or change a share link', not blocked, blocked)
bad = []
for pl in (['A', 'B'], [f'P{i}' for i in range(16)], ['A', '  ', 'B', ''], None):
    try: rpc_as(AUTH, 'stowaway_create_share', pl, ''); bad.append(pl)
    except Err: pass
check('a link needs 3 to 15 real names', not bad, bad)
cl = rpc_as(AUTH, 'stowaway_create_share', ['  Priya\t ', '', 'X' * 40, 'Ravi', 'Meena'], '')
check('names are trimmed, blanks dropped and capped at 18 characters', rpc_as(API, 'stowaway_get_share', cl)['players'] == ['Priya', 'X' * 18, 'Ravi', 'Meena'])
check('updating keeps the same code and swaps the players', rpc_as(AUTH, 'stowaway_update_share', sc, ['Zed', 'Yan', 'Xin'], 'Hampi') is True
      and rpc_as(API, 'stowaway_get_share', sc) == {'players': ['Zed', 'Yan', 'Xin'], 'trip_title': 'Hampi'})
check('updating an unknown code reports false', rpc_as(AUTH, 'stowaway_update_share', 'zzzz', names, '') is False)
su("update stowaway_share_links set expires_at = now() - interval '1 minute' where code = %s", (sc,))
check('an expired link opens nothing', rpc_as(API, 'stowaway_get_share', sc) is None)
rpc_as(AUTH, 'stowaway_create_share', names, '')
check('making a new link clears expired ones', su('select count(*) n from stowaway_share_links where code = %s', (sc,))[0]['n'] == 0)
su('delete from stowaway_share_links')

# ── report ──
width = max(len(n) for n, _, _ in RESULTS)
for n, ok, d in RESULTS: print(('PASS  ' if ok else 'FAIL  ') + n + (f'\n        -> {d}' if not ok else ''))
failed = [n for n, ok, _ in RESULTS if not ok]
print(f'\n{len(RESULTS) - len(failed)} of {len(RESULTS)} checks passed' + ('' if not failed else f'; FAILED: {len(failed)}'))
sys.exit(1 if failed else 0)
