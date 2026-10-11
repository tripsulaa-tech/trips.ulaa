#!/usr/bin/env python3
"""
Find My Twin: automated rule checks. Plays real games through the real database
functions with simulated players (each with its own secret token, like a phone)
and checks pairing, scoring, secrecy, the host controls and live updates.

SAFE USE: run only against a throw-away local Postgres (see README.md). It
deletes every Find My Twin room and briefly edits the saved game content, so it
refuses to run unless the database name contains "test".

    TEST_DATABASE_URL=postgresql://postgres@localhost:5432/ulaa_test python3 find_my_twin_tests.py
    add --quick for a shorter run
"""
import collections, itertools, json, os, random, sys, uuid
import psycopg2, psycopg2.extras

DSN = os.environ.get('TEST_DATABASE_URL')
QUICK = '--quick' in sys.argv
if not DSN: sys.exit('Set TEST_DATABASE_URL to a throw-away database (see README.md).')

def connect(role=None):
    c = psycopg2.connect(DSN); c.autocommit = True
    if role: c.cursor().execute(f'set role {role}')
    return c

SU = connect()
_c = SU.cursor(); _c.execute('select current_database()')
if 'test' not in _c.fetchone()[0]: sys.exit('Refusing to run: the database name must contain "test".')
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

def refused(fn, *args):
    try: rpc(fn, *args); return None
    except Err as e: return e.code

class P:
    def __init__(self, name): self.name, self.tok, self.id = name, str(uuid.uuid4()), None

def state(code, p): return rpc('ftwin_state', code, p.tok)
def clear(): su('delete from ftwin_rooms')
DEFAULT_W = [14, 8, 10, 10, 8, 12, 10, 12, 8, 8]

# The edited-content section changes the saved game content; always put it back,
# even if the script stops half way.
import atexit
def _restore():
    try: su("delete from site_content where key = 'game:twin-prompts'")
    except Exception: pass
_restore(); atexit.register(_restore)

def new_room(n, roster=None, reveal=False, qn=10, answers=True):
    ps = [P(f'P{i}') for i in range(n)]
    r = rpc('ftwin_create_room', ps[0].name, ps[0].tok, 'Test', roster, reveal); code = r['code']; ps[0].id = r['player_id']
    for p in ps[1:]: p.id = rpc('ftwin_join', code, p.name, p.tok)['player_id']
    if answers:
        for p in ps: p.ans = ''.join(random.choice('01') for _ in range(qn)); rpc('ftwin_submit_answers', code, p.tok, p.ans)
    return code, ps

def oracle_base(a, b, weights):
    tot = sum(weights[:len(a)]); sim = sum(w for w, x, y in zip(weights, a, b) if x == y)
    return 50 + (sim * 45) // tot

def finish_round(code, ps):
    for p in ps:
        for e in state(code, p)['edges']: rpc('ftwin_found', code, p.tok, e['id'])
    for p in ps:
        for e in state(code, p)['edges']: rpc('ftwin_done', code, p.tok, e['id'])

RESULTS = []
def check(name, ok, detail=''): RESULTS.append((name, bool(ok), '' if ok else str(detail)))
random.seed(2026)
sizes = [2, 3, 4, 5, 6, 7, 8, 11, 12, 16, 23, 24] if not QUICK else [2, 3, 5, 8, 24]

# ── 1. Full games in "find them in person" mode, every table size ──
issues = collections.Counter()
for n in sizes:
    for _ in range(2 if QUICK else 4):
        code, ps = new_room(n); host = ps[0]; ids = {p.id: p for p in ps}
        rpc('ftwin_start', code, host.tok)
        seen_pairs, rounds = set(), 0
        while True:
            room = state(code, host)['room']
            if room['phase'] != 'hunt': break
            rounds += 1; rnd = room['round_no']
            edges = su('select a, b, score from ftwin_edges e join ftwin_rooms r on r.id = e.room_id where r.code = %s and e.round_no = %s', (code, rnd))
            if not edges: issues['a round with no pairs'] += 1; break
            degree = collections.Counter(x for e in edges for x in (e['a'], e['b']))
            if rnd == 1:
                if set(degree) != set(ids): issues['someone left without a twin in round 1'] += 1
                if n % 2 == 0 and any(d != 1 for d in degree.values()): issues['even group not a perfect matching'] += 1
                if n % 2 == 1 and sorted(degree.values()) != [1] * (n - 1) + [2]: issues['odd group did not form exactly one trio'] += 1
            for e in edges:
                key = frozenset((e['a'], e['b']))
                if key in seen_pairs: issues['a pair met twice'] += 1
                seen_pairs.add(key)
                base = oracle_base(ids[e['a']].ans, ids[e['b']].ans, DEFAULT_W)
                if not (e['score'] == 99 and base + 4 >= 99) and not (base <= e['score'] <= base + 4): issues['score does not match the rules'] += 1
                if not 50 <= e['score'] <= 99: issues['score outside 50-99'] += 1
            for p in ps:   # each phone sees its own pairs only
                mine = [e for e in edges if p.id in (e['a'], e['b'])]
                st = state(code, p)
                if len(st['edges']) != len(mine): issues['a phone sees the wrong number of pairs'] += 1
                if any('answers' in x for x in st['players']): issues['other players answers visible'] += 1
            finish_round(code, ps)
            if state(code, host)['room']['phase'] != 'roundEnd': issues['round did not end when everyone finished'] += 1; break
            rpc('ftwin_next_round', code, random.choice(ps).tok, rnd)
            if rounds > 12: issues['game never ended'] += 1; break
        if state(code, host)['room']['phase'] != 'final': issues['game did not reach the final screen'] += 1
        if rounds > 4: issues['more rounds than prompts'] += 1
        for p in ps:   # a person's history = every pair they were in (an odd group's trio gives one person two in a round)
            met = su('select count(*) c from ftwin_edges e join ftwin_rooms r on r.id = e.room_id where r.code = %s and (e.a = %s or e.b = %s)', (code, p.id, p.id))[0]['c']
            if len(state(code, p)['history']) != met: issues['history does not match the pairs the player was in'] += 1
    clear()
check('in-person games: pairing, no repeats, scores, privacy, round flow (all table sizes)', not issues, dict(issues))

# ── 2. Reveal-only mode ──
issues = collections.Counter()
for n in [2, 3, 5, 8, 24]:
    code, ps = new_room(n, reveal=True); rpc('ftwin_start', code, ps[0].tok)
    st = state(code, ps[0])
    if st['room']['phase'] != 'final': issues['reveal mode did not go straight to the final screen'] += 1
    if any(len(state(code, p)['history']) < 1 for p in ps): issues['someone has no twin in reveal mode'] += 1
    if len(st['all_pairs']) > 8: issues['more than 8 top pairs shown'] += 1
    sc = [x['score'] for x in st['all_pairs']]
    if sc != sorted(sc, reverse=True): issues['top pairs not sorted'] += 1
    clear()
check('reveal-only mode: instant final screen, everyone gets a twin, top pairs sorted', not issues, dict(issues))

# ── 3. Starting, answering, joining ──
code, ps = new_room(3, answers=False)
check('cannot start until everyone has answered', refused('ftwin_start', code, ps[0].tok) is not None)
for p in ps: rpc('ftwin_submit_answers', code, p.tok, '0101010101')
check('wrong-length answers are refused', refused('ftwin_submit_answers', code, ps[1].tok, '0101') is not None)
check('non-0/1 answers are refused', refused('ftwin_submit_answers', code, ps[1].tok, '01x1010101') is not None)
rpc('ftwin_retake', code, ps[1].tok); check('retaking clears the answer, so start waits again', refused('ftwin_start', code, ps[0].tok) is not None)
rpc('ftwin_submit_answers', code, ps[1].tok, '1111111111')
check('only the host can start', refused('ftwin_start', code, ps[1].tok) is not None)
rpc('ftwin_start', code, ps[0].tok)
check('nobody can join after the game started', refused('ftwin_join', code, 'Late', str(uuid.uuid4())) is not None)
check('a returning phone keeps its seat', rpc('ftwin_join', code, 'x', ps[1].tok)['player_id'] == ps[1].id); clear()
code, ps = new_room(1); check('a lone player cannot start', refused('ftwin_start', code, ps[0].tok) is not None); clear()
code, ps = new_room(24); check('the 25th player is refused', refused('ftwin_join', code, 'Extra', str(uuid.uuid4())) is not None); clear()
code, ps = new_room(3, answers=False)
check('a name that is already in the room is refused (any capitalisation)', refused('ftwin_join', code, 'p1', str(uuid.uuid4())) == 'name_taken')
rpc('ftwin_set_locked', code, ps[0].tok, True); check('a locked room refuses new players', refused('ftwin_join', code, 'Late', str(uuid.uuid4())) is not None); clear()

# ── 4. Roster mode ──
code, ps = new_room(1, roster=['Asha', 'Ben', 'Chitra'], answers=False)
names = rpc('ftwin_roster', code); check('roster lists the trip group', names is not None and len(json.dumps(names)) > 10, names)
check('a name not on the roster is refused', refused('ftwin_join', code, 'Zorro', str(uuid.uuid4())) is not None)
rpc('ftwin_join', code, 'Asha', str(uuid.uuid4()))
check('a roster name that is already taken is refused', refused('ftwin_join', code, 'Asha', str(uuid.uuid4())) is not None)
check('a free roster name works', rpc('ftwin_join', code, 'Ben', str(uuid.uuid4()))['player_id'] is not None); clear()

# ── 5. Host controls: skip only stuck pairs ──
code, ps = new_room(6); rpc('ftwin_start', code, ps[0].tok)
check('skip with nobody offline asks for confirmation', refused('ftwin_skip_pending', code, ps[0].tok, False) == 'nobody_away')
check('only the host can skip', refused('ftwin_skip_pending', code, ps[1].tok, True) is not None)
away = ps[3]; su("update ftwin_player_private set last_seen = now() - interval '5 minutes' where player_id = %s", (away.id,))
rpc('ftwin_skip_pending', code, ps[0].tok, False)
edges = su('select a, b, a_done, b_done from ftwin_edges e join ftwin_rooms r on r.id = e.room_id where r.code = %s', (code,))
skipped = [e for e in edges if e['a_done'] and e['b_done']]; open_ = [e for e in edges if not (e['a_done'] and e['b_done'])]
check('skip only touched the pair with the offline player', len(skipped) == 1 and away.id in (skipped[0]['a'], skipped[0]['b']) and len(open_) == len(edges) - 1, (len(skipped), len(open_)))
check('the round stays open while other pairs are still going', state(code, ps[0])['room']['phase'] == 'hunt')
rpc('ftwin_skip_pending', code, ps[0].tok, True)
check('"skip all" ends the round', state(code, ps[0])['room']['phase'] == 'roundEnd'); clear()
code, ps = new_room(2); rpc('ftwin_start', code, ps[0].tok); su("update ftwin_player_private set last_seen = now() - interval '5 minutes' where player_id = %s", (ps[1].id,))
rpc('ftwin_skip_pending', code, ps[0].tok, False); check('skipping the last open pair ends the round', state(code, ps[0])['room']['phase'] == 'roundEnd'); clear()
code, ps = new_room(4); rpc('ftwin_start', code, ps[0].tok)
other = su('select e.a, e.b, e.id from ftwin_edges e join ftwin_rooms r on r.id = e.room_id where r.code = %s', (code,))
mine_ids = {e['id'] for e in state(code, ps[0])['edges']}; foreign = next(e['id'] for e in other if e['id'] not in mine_ids)
check('a player cannot mark someone else\'s pair', refused('ftwin_found', code, ps[0].tok, foreign) is not None); clear()

# ── 5b. Host end-game / play-again only in the right phase (each check gets its own room) ──
code, ps = new_room(3, answers=False)
check('"end game" is refused in the lobby', refused('ftwin_end_game', code, ps[0].tok) is not None); clear()
code, ps = new_room(3)
check('"play again" is refused in the lobby and keeps everyone\'s answers',
      refused('ftwin_to_lobby', code, ps[0].tok) is not None and all(x['answered'] for x in state(code, ps[0])['players'])); clear()
code, ps = new_room(3); rpc('ftwin_start', code, ps[0].tok)
check('only the host can end the game', refused('ftwin_end_game', code, ps[1].tok) is not None)
check('the host can still end a game in the middle of a hunt', refused('ftwin_end_game', code, ps[0].tok) is None and state(code, ps[0])['room']['phase'] == 'final')
check('"play again" from the final screen resets to the lobby with answers cleared',
      refused('ftwin_to_lobby', code, ps[0].tok) is None and state(code, ps[0])['room']['phase'] == 'lobby' and not any(x['answered'] for x in state(code, ps[0])['players'])); clear()

# ── 6. Host handover ──
code, ps = new_room(4, answers=False); rpc('ftwin_leave', code, ps[0].tok)
check('the host leaving hands the room to the next player', state(code, ps[1])['room']['host_id'] == ps[1].id)
check('nobody can take over while the host is present', refused('ftwin_claim_host', code, ps[2].tok) is not None)
su("update ftwin_player_private set last_seen = now() - interval '5 minutes' where player_id = %s", (ps[1].id,)); rpc('ftwin_claim_host', code, ps[2].tok)
check('anyone can take over once the host went quiet', state(code, ps[2])['room']['host_id'] == ps[2].id); clear()

# ── 7. Admin-edited questions and prompts ──
su("insert into site_content (key, content) values ('game:twin-prompts', %s) on conflict (key) do update set content = excluded.content",
   (json.dumps({'questions': [{'weight': 5 + (i % 3)} for i in range(12)], 'prompts': ['a', 'b']}),))
code, ps = new_room(8, qn=12)
check('answers must match the edited question count', refused('ftwin_submit_answers', code, ps[0].tok, '0101010101') is not None)
rpc('ftwin_start', code, ps[0].tok); rounds = 0; weights = [5 + (i % 3) for i in range(12)]; ok_scores = True
while state(code, ps[0])['room']['phase'] == 'hunt':
    rounds += 1; rnd = state(code, ps[0])['room']['round_no']
    if rnd == 1:
        ids = {p.id: p for p in ps}
        for e in su('select e.a, e.b, e.score from ftwin_edges e join ftwin_rooms r on r.id = e.room_id where r.code = %s and e.round_no = 1', (code,)):
            base = oracle_base(ids[e['a']].ans, ids[e['b']].ans, weights)
            ok_scores &= (base <= e['score'] <= base + 4) or e['score'] == 99
    finish_round(code, ps); rpc('ftwin_next_round', code, ps[0].tok, rnd)
    if rounds > 6: break
check('edited weights are used for scoring', ok_scores)
check('the number of rounds follows the edited prompt count (2)', rounds == 2 and state(code, ps[0])['room']['phase'] == 'final', rounds)
su("delete from site_content where key = 'game:twin-prompts'"); clear()

# ── 8. Secrets and permissions ──
leaks = []
for t in ['ftwin_rooms', 'ftwin_players', 'ftwin_player_private', 'ftwin_edges']:
    try: API.cursor().execute(f'select * from public.{t} limit 1'); leaks.append(t)
    except psycopg2.Error: pass
check('the public key cannot read any game table directly', not leaks, leaks)
code, ps = new_room(3); check('a stranger cannot read a room', refused('ftwin_state', code, str(uuid.uuid4())) is not None)
cur = API.cursor(); cur.execute('select * from public.ftwin_signal limit 1'); cols = [d[0] for d in cur.description]
check('the public live-update table exposes only room id + counter', cols == ['room_id', 'rev'], cols)
priv = su("select answers from ftwin_player_private pp join ftwin_players p on p.id = pp.player_id join ftwin_rooms r on r.id = p.room_id where r.code = %s", (code,))
blob = json.dumps(state(code, ps[0]))
others = [x['answers'] for x in priv if x['answers'] != ps[0].ans]
check('a phone never receives another player\'s answers', all(a not in blob for a in others if a != ps[0].ans))

# ── 9. Live updates ──
def rev(code): return su('select s.rev from ftwin_signal s join ftwin_rooms r on r.id = s.room_id where r.code = %s', (code,))[0]['rev']
clear(); code, ps = new_room(4, answers=False); r0 = rev(code); state(code, ps[1])
check('a heartbeat does not trigger refreshes', rev(code) == r0)
rpc('ftwin_submit_answers', code, ps[1].tok, '0101010101'); r1 = rev(code)
check('each action moves the live-update counter exactly once', r1 == r0 + 1, (r0, r1)); clear()

for n, ok, d in RESULTS: print(('PASS  ' if ok else 'FAIL  ') + n + (f'\n        -> {d}' if not ok else ''))
failed = [n for n, ok, _ in RESULTS if not ok]
print(f'\n{len(RESULTS) - len(failed)} of {len(RESULTS)} checks passed' + ('' if not failed else f'; FAILED: {len(failed)}'))
sys.exit(1 if failed else 0)
