# Game rule tests

Two scripts play real games through the real database functions with simulated
players (each with its own secret token, like a phone) and check the rules:

| Script | Game | Checks |
|---|---|---|
| `yaaru_avan_tests.py` | Yaaru Avan | 87 (`--no-specials` skips the special-role checks): winners and points, word bag, role counts, who can see what, host controls, joining, ties, the Lost Soul's one-shot guess, the description round, Undercover's win rule and points, Stranger-only games, tie-breaks and the Boomerang bounce, special roles (dealing, caps, pairs, Falafel Vendor, Boomerang, Ghost, Revenger, Goddess, Joy Fool and Duelist bonuses, secrecy), live updates, share links |
| `find_my_twin_tests.py` | Find My Twin | 41: pairing for every group size 2 to 24, no repeated pairs, scores recomputed independently, reveal-only mode, roster, "skip stuck pairs", edited questions, secrecy, host controls, live updates |

Run them **before every release that touches `supabase/migration/*yaaru_avan*` or
`*find_my_twin*`**, and after any change to a game's rules. Never run them against
your real Supabase project: they delete every room and briefly edit saved game
content, so each script refuses to start unless the database name contains `test`.

## One-time setup (a throw-away local Postgres 14 or newer)

```bash
createdb ulaa_test
pip install psycopg2-binary
cd supabase
for f in tests/stub_supabase.sql \
         migration/add_yaaru_avan_online.sql \
         migration/add_yaaru_avan_share_links.sql \
         migration/fix_yaaru_avan_logic_and_privacy.sql \
         migration/remove_yaaru_avan_clue_round.sql \
         migration/drop_yaaru_avan_clue_and_challenge_leftovers.sql \
         migration/rename_yaaru_avan_begin_clues_to_begin_vote.sql \
         migration/add_yaaru_avan_special_roles.sql \
         migration/add_yaaru_avan_special_picker.sql \
         migration/add_yaaru_avan_online_switch.sql \
         migration/adopt_undercover_rules_for_yaaru_avan.sql \
         migration/update_yaaru_avan_online_roles_to_ulaa.sql \
         migration/rename_stowaway_to_yaaru_avan.sql \
         migration/yaaru_avan_pickpocket_always_guesses.sql \
         migration/raise_yaaru_avan_max_players_to_20.sql \
         migration/yaaru_avan_tie_redescribe.sql \
         migration/yaaru_avan_boomerang_tie.sql \
         migration/yaaru_avan_rename_internal_names.sql \
         migration/yaaru_avan_rename_roles.sql \
         migration/yaaru_avan_rename_stranger.sql \
         migration/yaaru_avan_rename_specials.sql \
         migration/yaaru_avan_rename_special_columns.sql \
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

(`upgrade_yaaru_avan_max_15.sql` is not needed on a fresh database. Keep this list in the order the files are applied to your real project: the rename migration must come after the Ulaa roles one, and the later `yaaru_avan_*` files use the renamed functions.)

## Run

```bash
cd supabase/tests
export TEST_DATABASE_URL=postgresql://localhost/ulaa_test
python3 yaaru_avan_tests.py          # a few minutes; add --quick for about a minute
python3 find_my_twin_tests.py      # about 15 seconds
# add --quick to either for a shorter run
```

Every line should say `PASS`. A `FAIL` line names the rule that broke, and the
exit code is 1, so it can also run in CI.

## When you change a rule
1. Change it in the app code **and** the SQL where a game has both (Yaaru Avan's one-phone engine and its online rooms must agree).
2. Add a check to the matching script for the new rule.
3. Drop and rebuild `ulaa_test` with the steps above, then run both scripts.
