# Game rule tests

Two scripts play real games through the real database functions with simulated
players (each with its own secret token, like a phone) and check the rules:

| Script | Game | Checks |
|---|---|---|
| `stowaway_tests.py` | Stowaway | 42: winners and points, word bag, role counts, who can see what, host controls, joining, ties, the Lost Soul's one-shot guess, live updates, share links |
| `find_my_twin_tests.py` | Find My Twin | 41: pairing for every group size 2 to 24, no repeated pairs, scores recomputed independently, reveal-only mode, roster, "skip stuck pairs", edited questions, secrecy, host controls, live updates |

Run them **before every release that touches `supabase/migration/*stowaway*` or
`*find_my_twin*`**, and after any change to a game's rules. Never run them against
your real Supabase project: they delete every room and briefly edit saved game
content, so each script refuses to start unless the database name contains `test`.

## One-time setup (a throw-away local Postgres 14 or newer)

```bash
createdb ulaa_test
pip install psycopg2-binary
cd supabase
for f in tests/stub_supabase.sql \
         migration/add_stowaway_online.sql \
         migration/add_stowaway_share_links.sql \
         migration/fix_stowaway_logic_and_privacy.sql \
         migration/remove_stowaway_clue_round.sql \
         migration/drop_stowaway_clue_and_challenge_leftovers.sql \
         migration/add_find_my_twin.sql \
         migration/update_find_my_twin_10_questions.sql \
         migration/make_find_my_twin_editable.sql \
         migration/add_find_my_twin_roster.sql \
         migration/add_find_my_twin_reveal_mode.sql \
         migration/harden_find_my_twin.sql \
         migration/fix_find_my_twin_phase_checks.sql; do
  psql -v ON_ERROR_STOP=1 -d ulaa_test -f "$f"
done
```

(`upgrade_stowaway_max_15.sql` is not needed on a fresh database.)

## Run

```bash
cd supabase/tests
export TEST_DATABASE_URL=postgresql://localhost/ulaa_test
python3 stowaway_tests.py          # about a minute
python3 find_my_twin_tests.py      # about 15 seconds
# add --quick to either for a shorter run
```

Every line should say `PASS`. A `FAIL` line names the rule that broke, and the
exit code is 1, so it can also run in CI.

## When you change a rule
1. Change it in the app code **and** the SQL where a game has both (Stowaway's one-phone engine and its online rooms must agree).
2. Add a check to the matching script for the new rule.
3. Drop and rebuild `ulaa_test` with the steps above, then run both scripts.
