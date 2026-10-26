# Ulaa Games: style and build guide

Follow this when adding or changing a game, so every game looks, sounds and feels the same. Reference implementations: `PackBagGame.tsx`, `TravelMatchGame.tsx`, `YaaruAvanGame.tsx`, `FindMyTwinGame.tsx` in `src/components/ui/`.

## Where things live
- `/games` page: `src/pages/GamesPage.tsx`. It renders `TripGames` with `layout="thumb"`.
- `TripGames.tsx`: the list of games. A new game gets added here, in the same row.
- Shared styles/helpers: `gameUi.ts` (button/glass/chip classes, name storage, share helper), `gameParts.tsx` (`GameTile`, `ScoreRing`, `TimerRing`, `Confetti`, `CountUp`, `NameField`, `BrandMark`).
- Sound + haptics: `gameAudio.ts` (`useSynth`) and `haptics.ts`. Never call `navigator.vibrate` or create an AudioContext directly.
- Full screen popup: `Modal` with `flush fullScreen`.

## Visual language
- Background: `bg-gradient-to-b from-dark via-footer to-[#1B130E]`, text `text-cream`, plus the two blurred glows (terracotta top-centre, gold top-right).
- Icon medallion: gold gradient (`GameTile accent="gold"`), dark Phosphor `duotone` icon. All games use gold so the thumbnails match. Do not introduce a new accent colour.
- Titles: `font-display font-extrabold text-white`. Small labels: the `eyebrow` class.
- Buttons: only `primaryBtn`, `ghostBtn`, `iconBtn` from `gameUi.ts`. Cards: `glass`.
- Gold text for scores: `GOLD_GRAD_TEXT`. Green for good, red for bad feedback.
- Brand wordmark (`BrandMark`) at the top of every start screen.

## Layout rules
- Popup is full screen on every device. Root div: `px-4`, top padding that clears the close button and notch (`pt-[max(4rem,calc(env(safe-area-inset-top)+3.5rem))]`), bottom `env(safe-area-inset-bottom)`, `min-h-[100dvh]`, content in `w-full max-w-md` centred.
- Play areas fill the available height (see the `clamp(...)` stage in Pack the bag). If a game uses physics, measure the area and scale speeds to it.
- Add `onPointerDownCapture={onPressCapture}` plus `touch-manipulation` and no tap highlight on the root. Mark elements that make their own sound with `data-nofx`.

## Game flow (every game)
1. Start screen: icon, title, one-line rules, optional `NameField`, start button, sound toggle.
2. 3-2-1-Go countdown for timed games.
3. Play: HUD (score, timer or progress, streak), pause button, mute button. Pause automatically when the tab/app goes to the background.
4. Result: `ScoreRing`, rating title, `Confetti` for good results, best score (saved in localStorage), generated score-card image + Share, Play again, Back to menu.

## Sound and haptics
- Use `useSynth(mutedRef)`: `play('good' | 'bad' | 'gold' | 'power' | 'tick' | 'go' | 'win' | 'end' | 'flip' | 'miss' | 'click')`. Every sound already triggers a matching haptic. Add new sounds to both `SFX_HAPTIC` and the switch in `gameAudio.ts`.
- Call `ensure()` inside the first user tap (audio needs a gesture).
- Mute only affects sound. Haptics are off for reduced-motion users.

## Feel
- React to the touch immediately: use `onPointerDown` for tap targets in fast games, `whileTap` scale for tiles, `active:scale` on buttons.
- Animate with transforms/opacity only (`translate3d`), no per-item blur or heavy shadows on moving items.
- Respect `useReducedMotion`.

## Content rules
- The Games page is trip-agnostic. Games take `tripSlug=""` and `tripTitle="Ulaa"` there; copy must read naturally with no trip (see the `themed` checks in Pack the bag / Travel match).
- Everything is front-end only, best scores and name stay on the device.

## Adding a new game checklist
1. Create `XxxGame.tsx` modelled on an existing game (props: `tripId, tripSlug, tripTitle, className, compact, thumb`).
2. Render `GameTile` (with `thumb={thumb}`, `accent="gold"`) and a `Modal ... flush fullScreen`.
3. Add it to `TripGames.tsx` (thumb row, and the page layout).
4. Use `useSynth`, shared buttons and parts. No new colours or fonts.
5. Check: phone width, full screen, mute, pause, reduced motion, `tsc` and `eslint` clean.

## Admin-hosted games (Truth or Dare, Yaaru Avan?, Dumb Charades, Find My Twin)
These four are not on the public `/games` page. An admin hosts them from Admin -> Games -> Play:
- Pick a trip once at the top (upcoming or in-progress only). Its booked travellers are listed; if anyone is checked in only they start ticked, otherwise everyone does. Tick or untick. Code: `src/admin/games/useTripRoster.ts` and `TripRoster.tsx`.
- Under it, each game has a card (`GameCard.tsx`): its tile to play on this phone, and a share link.
  - Truth or Dare (`RosterGameCard.tsx`, thin wrapper `TruthOrDareHost.tsx`) is dealt the ticked names. "Make share link" saves first names under a short code; "Update link" keeps the code after the ticks change.
    - Truth or Dare: `/play/truth-or-dare/:code`, `supabase/migration/add_truth_or_dare_share_links.sql`, page `TruthOrDarePlayPage.tsx`.
    - Yaaru Avan? has no share link: online rooms are joined from the room's own link (`/play/yaaru-avan/:code`, with WhatsApp / Copy buttons in the lobby); the tile also plays pass and play on one phone with the ticked names. `add_yaaru_avan_share_links.sql` and its table are no longer used.
  - Dumb Charades and Find My Twin (`LinkGameHost.tsx`) need no player list, so they get a plain link: `/play/dumb-charades` (page `DumbCharadesPlayPage.tsx`) and `/play/twin` (join page; room invite links `/play/twin/:code` come from inside the game). No database setup.
- The other tabs ("Edit ...") change the questions, dares and word lists.
- Props: `defaultOpen` (open on the setup screen) on Truth or Dare, Yaaru Avan? and Dumb Charades; `players` (names to pre-fill) on Truth or Dare and Yaaru Avan?.

## Online group games (Yaaru Avan?, Find My Twin)
These two need Supabase (everyone uses their own phone), so they are the exception to "front-end only".
- Yaaru Avan? (hosted from Admin -> Games, see above): online join link `/play/yaaru-avan/:code`. Run in the Supabase SQL editor, once each and in this order: `add_yaaru_avan_online.sql`, `add_yaaru_avan_share_links.sql`, `upgrade_yaaru_avan_max_15.sql` (only if the first file was run before the 15-player change), `fix_yaaru_avan_logic_and_privacy.sql` (one-shot Lost Soul guess, correct role counts, private room tables; live updates use `yaaru_avan_signal`). Never re-run `add_yaaru_avan_online.sql` on a live project: it restores the old functions. After all the Yaaru Avan? migrations, run `rename_stowaway_to_yaaru_avan.sql` last (renames the old tables and functions to `yaaru_avan_*` / `_ya_*`) and deploy the matching app build; never re-run the older files afterwards. After the rename, run `yaaru_avan_pickpocket_always_guesses.sql` once (like Undercover, a Pickpocket always gets a last guess when eliminated, including as a Lover's partner; adds `guess_queue` / `guess_after` to `yaaru_avan_rooms` and replaces `yaaru_avan_after_reveal` and `yaaru_avan_judge_guess`) and deploy the matching app build. The one-phone game follows the same rule in `YaaruAvanGame.tsx` (`afterReveal`); change one, change both. Last, run `raise_yaaru_avan_max_players_to_20.sql` once (rooms take 3 to 20 players like Undercover, and `yaaru_avan_state` announces the Goddess of Justice to everyone through `players[].public_special` from the deal on; every other role stays secret) and deploy the matching app build. The player cap also lives in `MAX_PLAYERS` in `yaaruAvanEngine.ts`; change both together. Then run `yaaru_avan_tie_redescribe.sql` once (a tied vote with no Goddess follows Undercover's FAQ: the tied players each describe once more, then the other players vote again among them and the tied players sit that vote out; tied again, the host decides; replaces `_ya_resolve_vote`, `yaaru_avan_cast_vote` and `yaaru_avan_state`, adds `_ya_tied_out`) and deploy the matching app build. The one-phone game does the same in `YaaruAvanGame.tsx` (`startTieBreak`): the host ticks who is tied under "Vote tied?"; change one, change both. Mr. Meme (each description round a random player describes by gestures only) is one-phone only: it is a setup switch in `YaaruAvanGame.tsx`, saved with the setup, and is deliberately not in online rooms because the official rules say to use it only when everyone can see each other. Later migrations, each once and in this order: `raise_yaaru_avan_max_players_to_20.sql` (rooms hold 20), `yaaru_avan_tie_redescribe.sql` (a tied vote with no Goddess: the tied players describe once more and the others re-vote; host picks if it ties again), `yaaru_avan_boomerang_tie.sql` (a Boomerang bounce with several voters makes the voters tied and follows the same tie rules), then `yaaru_avan_rename_internal_names.sql` (renames the stored Stranger, special and phase values and columns to the current names, converts rooms in progress, and moves the saved word-list key to `game:yaaru-avan`) and last `yaaru_avan_rename_roles.sql` (the same for the Tourist and Pickpocket role values, outcomes and columns), and `yaaru_avan_rename_stranger.sql` after it (Stowaway to Stranger: the role value, the `strangers` / `stranger_word` columns, the `p_strangers` setting and the game functions, rewritten from their live definitions; safe to run twice), then `yaaru_avan_rename_specials.sql` (the special roles get their current ids: `joyFool`, `duelists`, `boomerang`, `goddess`, `ghost`, `revenger`, `falafelVendor`; the `payback` phase becomes `revenger`, `yaaru_avan_payback` becomes `yaaru_avan_revenge`, `ticket_used` becomes `boomerang_used`; rooms in progress are converted; safe to run twice), and last `yaaru_avan_rename_special_columns.sql` (`payback_done`, `payback_hit`, `rider_hit` become `revenge_done`, `revenge_hit`, `ghost_hit`; the app never reads them, so no app change; safe to run twice); deploy the matching app build in the same sitting as the four before it.
- Find My Twin: join link `/play/twin/:code`. Run these in the Supabase SQL editor, once each and in this order: `add_find_my_twin.sql`, `update_find_my_twin_10_questions.sql`, `make_find_my_twin_editable.sql`, `add_find_my_twin_roster.sql`, `add_find_my_twin_reveal_mode.sql`, `harden_find_my_twin.sql` (makes the room tables private; live updates use `ftwin_signal`), `fix_find_my_twin_phase_checks.sql` (host actions check the game phase).
  - Files: `FindMyTwinGame.tsx` (tile + intro), `FindMyTwinOnline.tsx` (all room screens), `findMyTwinApi.ts` (calls), `useTwinRoom.ts` (live sync), `findMyTwinEngine.ts` (questions + prompts), `pages/FindMyTwinJoinPage.tsx`.
  - Flow: everyone answers the questions (10 by default, editable in Admin -> Games), host reveals, the database pairs people (best match first), each phone shows "You + Name, 92% match, Find Name!", both tap "I found", a conversation prompt unlocks, both tap "We talked", anyone unlocks the next round (new twin, never a repeat). 4 rounds by default (one per conversation starter).
  - Answers and pairings are private in the database. A phone only gets its own twin(s).
  - The question ORDER in `findMyTwinEngine.ts` must match the weights in `_ft_score` in the SQL.
  - To add a prompt, add a line to `PROMPTS` (round N uses prompt N).

## Retriever update

Apply `supabase/migration/add_yaaru_avan_retriever.sql` after the existing Yaaru Avan migrations (including `yaaru_avan_rename_special_columns.sql` and `yaaru_avan_no_pickpocket_joyfool_revenger.sql`), then deploy the edited app files. Finish active rounds first. The SQL is transactional and can be rerun. No SQL is needed for one-phone play.

Retriever uses one special slot and is dealt to one Tourist only, including when drawn by a Tourist Falafel Vendor. The round must start with at least two Strangers; Pickpockets do not count. Fewer than two disables its picker entry and excludes it from both deals and Vendor draws.

An active Retriever can return only the Tourist directly voted out, once per round. Skipping preserves the power for a later vote. A returned player keeps their word, votes and describes again; any Lover remains out. Revenge victims and indirect Lover exits cannot be retrieved. The restored elimination stops counting toward Joy Fool/Duelists scoring. The win check runs after the decision, before the next stop. Pickpocket last guesses still resolve first. Elimination reveals the Retriever and says its power is lost.

On one phone, every survivor receives a private handoff during the decision so the Retriever is not named publicly. Online, only the Retriever receives action buttons; after 30 seconds the window closes without using the power. Returning players are announced to everyone. Server-side room locking and round/stop/target checks protect against duplicate or stale requests. Every new round resets the power.

Validation: TypeScript and ESLint pass for the updated files. Local tests passed for 2,000 one-phone deals and 100 online deals, role eligibility and uniqueness, revival/skip/reuse, privacy, stale requests, timeout, early elimination, win timing, Lovers, Joy Fool/Duelists scoring, and new-round resets. The migration applied successfully twice in a local PGlite database built from the supplied prerequisite migrations. Live Supabase and multi-device play were not tested. The complete Vite build is blocked by assets absent from the supplied archive (including game images, fonts and home-hero videos); retain those assets from your existing project.
- Yaaru Avan? The Sniper (special role, 4+ players, never a Pickpocket): once per round, during a vote, the Sniper can shoot one player with no majority. A Stranger or Pickpocket goes offboard at once; a Tourist makes the shot backfire and the Sniper goes offboard instead. It works in both modes. One phone: flow in `YaaruAvanGame.tsx` (phase `sniper`). Online: only the Sniper's own phone shows a "Take my Sniper shot" button during a normal vote (`me.can_snipe` from `yaaru_avan_state`), which calls the `yaaru_avan_snipe` RPC; the offboarding screen then names the shooter and says whether it hit or backfired (`last_result.sniper*`). The shot is not a vote, so the Retriever cannot undo it, and it counts toward the right/wrong vote awards. Server side lives in `supabase/migration/add_yaaru_avan_sniper.sql` (deal, settings, state, snipe); run it before deploying the matching app build.

## Special roles: every ticked role is dealt

Both modes deal every special role the host ticks, each to a different player, as long as there is room. At most half the players can hold a special (6 players -> 3, 9 -> 4). Duelists and Lovers take two players. If more are ticked than fit, a random set that fits is dealt, and the picker says so. Roles that cannot apply are still skipped (group below the role's minimum, Retriever without 2 Strangers). Joy Fool, Revenger and Sniper never go to a Pickpocket; Retriever goes to a Tourist only. The Falafel Vendor secretly carries one of the other ticked single-player roles, which goes to the Vendor instead of a separate player; with none ticked the Vendor is dropped.

- One phone: `assignSpecials` and `maxSpecialPlayers` in `yaaruAvanSpecials.ts` (the old per-3-players cap and `count` option are gone).
- Online: run `supabase/migration/yaaru_avan_online_deal_all_ticked_specials.sql` in the Supabase SQL editor after `add_yaaru_avan_sniper.sql`, then deploy. It replaces only `_ya_deal_specials`. Finish active rounds first. Safe to re-run.
- To change the limit, change `maxSpecialPlayers` in the TypeScript and `places := p_n / 2` in the SQL together.
