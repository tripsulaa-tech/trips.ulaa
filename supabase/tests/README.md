# Game rule tests

`stowaway_tests.py` plays real Stowaway games through the real database
functions with simulated players (each with its own secret token, like a phone)
and checks 32 things: winners and points, the word bag, role counts, who can see
what, host controls, joining, ties, the Lost Soul's one-shot guess and live updates.

Run it **before every release that touches `supabase/migration/*stowaway*`**, and
after any change to the game rules. Never run it against your real Supabase
project: it deletes every Stowaway room, and refuses to start unless the
database name contains `test`.

## One-time setup (a throw-away local Postgres 14 or newer)

```bash
createdb ulaa_test
pip install psycopg2-binary
cd supabase
for f in tests/stub_supabase.sql \
         migration/add_stowaway_online.sql \
         migration/add_stowaway_share_links.sql \
         migration/fix_stowaway_logic_and_privacy.sql; do
  psql -v ON_ERROR_STOP=1 -d ulaa_test -f "$f"
done
```

(`upgrade_stowaway_max_15.sql` is not needed on a fresh database.)

## Run

```bash
cd supabase/tests
TEST_DATABASE_URL=postgresql://localhost/ulaa_test python3 stowaway_tests.py          # about a minute
TEST_DATABASE_URL=postgresql://localhost/ulaa_test python3 stowaway_tests.py --quick  # about 15 seconds
```

Every line should say `PASS`. A `FAIL` line names the rule that broke and the
exit code is 1, so it can also run in CI.

## When you change a rule
1. Change it in `stowawayEngine.ts` (one phone) **and** the SQL (online); they must agree.
2. Add a check here for the new rule.
3. Drop and rebuild `ulaa_test` with the steps above, then run the tests.
