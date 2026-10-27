# Yaaru Avan review — 27 October 2026

## Fixes

1. **Pickpocket typed guess used the wrong answer.** The one-phone screen selected the first nonempty player word, which could be the Stranger's word. It now uses the round's explicit Tourist word.
2. **Other Pickpockets received points for somebody else's guess.** A successful guess previously awarded all surviving Pickpockets six points and a win statistic. Only the actual guesser now receives them, in both one-phone and online scoring. Ordinary survival scoring is unchanged.
3. **Revenger could lose their turn at a winning elimination.** The winner check ran before revenge. Pending revenge now resolves before the round winner is decided, in both modes; Pickpocket guesses and Retriever decisions retain their earlier priority.
4. **Zero-Stranger setups did not survive reopening.** Loading `0` used a truthy fallback of `1`. The loader now preserves zero, and role counts reject fractions/nonfinite values and sanitize malformed stored counts.
5. **Pickpocket-only survival wins were labelled Stranger wins.** Both result screens now identify the surviving side correctly.
6. **Negative Duelist points displayed as `+-2`.** Both result screens now display `-2`.

## Validation

- 15 Chromium browser scenarios, using the actual one-phone React component, event handlers and CSS at 390 × 844. Deterministic deals make edge cases repeatable; missing image/font assets are replaced only inside the test harness. External requests are blocked.
- No special roles: boarding and hidden passes, description, normal voting, Tourist win, survival win, next round, correct/wrong Pickpocket guesses, zero-Stranger game, and tie re-description with restricted candidates.
- Special roles: Revenger at the winning elimination; Sniper hit and backfire; Lovers with a Pickpocket partner's final guess; Boomerang single-voter bounce; private Retriever handoffs and restored voting; eliminated Ghost voting; eliminated Goddess resolving ties; Duelist penalty; Falafel Vendor carrying the Joy Fool's first-out bonus.
- 10 engine test cases, including every valid core-role split for 3–20 players and 2,000 randomized special-role assignments. Checked slot caps, distinct players, reciprocal pairs, restrictions, scoring, saved settings, Retriever one-use rules, and revenge timing.
- 4 PostgreSQL-compatible PGlite contract tests execute the changed SQL functions against an isolated minimal schema, including 100 online special deals and applying the patch twice. These are not a full Supabase deployment or full room lifecycle test.
- TypeScript project check and ESLint for changed source/test files pass. Existing dependency versions in the supplied lockfile are preserved; test dependencies were added.

## Apply to your project

1. Merge the files from this ZIP into your existing project. Keep your existing `src/assets` and `public` directories: the supplied archive omitted them.
2. Finish any active online rounds. Run **only the new** `supabase/migration/fix_yaaru_avan_scoring_and_revenge.sql` after your already-installed Yaaru Avan migrations. It is transactional and safe to run twice. Do not rerun old migrations, which can restore obsolete functions.
3. Install dependencies (`npm ci`) and deploy the updated app. One-phone fixes need only the app deployment; online scoring/revenge fixes also need the SQL patch.

Changed application files:

- `src/components/ui/yaaruAvanEngine.ts`
- `src/components/ui/YaaruAvanGame.tsx`
- `src/components/ui/YaaruAvanOnline.tsx`
- `supabase/migration/fix_yaaru_avan_scoring_and_revenge.sql` (new)

Tests and documentation are in `tests/yaaru-avan`, `package.json`, `package-lock.json`, and `docs`.

## Repeat the tests

```sh
npm ci
npm run test:yaaru
npx playwright install chromium
npm run test:yaaru:browser
npx tsc -b
npx eslint tests/yaaru-avan src/components/ui/YaaruAvanGame.tsx src/components/ui/YaaruAvanOnline.tsx src/components/ui/yaaruAvanEngine.ts
```

If Chromium is already installed elsewhere, set `YA_CHROMIUM_PATH` to that executable when running the browser command. The isolated Vite harness is test-only; it is not used in the production build.

## Limits

No live Supabase database or deployed website was changed. Real multi-device online rooms, network loss/reconnection, and the complete Supabase migration chain were not exercised. Browser tests cover one-phone gameplay; online validation covers the SQL functions described above.

The full `npm run build` reaches Vite but fails because the original ZIP lacks referenced assets (game icons, fonts, hero media and other images) and the `public` directory. Those assets were not invented or replaced in the application. The contrast check passes; retain the assets from the existing project before building for deployment.
