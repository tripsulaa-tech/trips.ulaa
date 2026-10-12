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
    - Yaaru Avan? has no share link: online rooms are joined from the room's own link (`/play/stowaway/:code`, with WhatsApp / Copy buttons in the lobby); the tile also plays pass and play on one phone with the ticked names. `add_yaaru_avan_share_links.sql` and its table are no longer used.
  - Dumb Charades and Find My Twin (`LinkGameHost.tsx`) need no player list, so they get a plain link: `/play/dumb-charades` (page `DumbCharadesPlayPage.tsx`) and `/play/twin` (join page; room invite links `/play/twin/:code` come from inside the game). No database setup.
- The other tabs ("Edit ...") change the questions, dares and word lists.
- Props: `defaultOpen` (open on the setup screen) on Truth or Dare, Yaaru Avan? and Dumb Charades; `players` (names to pre-fill) on Truth or Dare and Yaaru Avan?.

## Online group games (Yaaru Avan?, Find My Twin)
These two need Supabase (everyone uses their own phone), so they are the exception to "front-end only".
- Yaaru Avan? (hosted from Admin -> Games, see above): online join link `/play/stowaway/:code`. Run in the Supabase SQL editor, once each and in this order: `add_yaaru_avan_online.sql`, `add_yaaru_avan_share_links.sql`, `upgrade_yaaru_avan_max_15.sql` (only if the first file was run before the 15-player change), `fix_yaaru_avan_logic_and_privacy.sql` (one-shot Lost Soul guess, correct role counts, private room tables; live updates use `stowaway_signal`). Never re-run `add_yaaru_avan_online.sql` on a live project: it restores the old functions. After all the Yaaru Avan? migrations, run `rename_stowaway_to_yaaru_avan.sql` last (renames the `stowaway_*` / `_sw_*` tables and functions to `yaaru_avan_*` / `_ya_*`) and deploy the matching app build; never re-run the older files afterwards. After the rename, run `yaaru_avan_pickpocket_always_guesses.sql` once (like Undercover, a Pickpocket always gets a last guess when eliminated, including as a Lover's partner; adds `guess_queue` / `guess_after` to `yaaru_avan_rooms` and replaces `yaaru_avan_after_reveal` and `yaaru_avan_judge_guess`) and deploy the matching app build. The one-phone game follows the same rule in `YaaruAvanGame.tsx` (`afterReveal`); change one, change both. Last, run `raise_yaaru_avan_max_players_to_20.sql` once (rooms take 3 to 20 players like Undercover, and `yaaru_avan_state` announces the Goddess of Justice to everyone through `players[].public_special` from the deal on; every other role stays secret) and deploy the matching app build. The player cap also lives in `MAX_PLAYERS` in `yaaruAvanEngine.ts`; change both together. Then run `yaaru_avan_tie_redescribe.sql` once (a tied vote with no Goddess follows Undercover's FAQ: the tied players each describe once more, then the other players vote again among them and the tied players sit that vote out; tied again, the host decides; replaces `_ya_resolve_vote`, `yaaru_avan_cast_vote` and `yaaru_avan_state`, adds `_ya_tied_out`) and deploy the matching app build. The one-phone game does the same in `YaaruAvanGame.tsx` (`startTieBreak`): the host ticks who is tied under "Vote tied?"; change one, change both. Mr. Meme (each description round a random player describes by gestures only) is one-phone only: it is a setup switch in `YaaruAvanGame.tsx`, saved with the setup, and is deliberately not in online rooms because the official rules say to use it only when everyone can see each other.
- Find My Twin: join link `/play/twin/:code`. Run these in the Supabase SQL editor, once each and in this order: `add_find_my_twin.sql`, `update_find_my_twin_10_questions.sql`, `make_find_my_twin_editable.sql`, `add_find_my_twin_roster.sql`, `add_find_my_twin_reveal_mode.sql`, `harden_find_my_twin.sql` (makes the room tables private; live updates use `ftwin_signal`), `fix_find_my_twin_phase_checks.sql` (host actions check the game phase).
  - Files: `FindMyTwinGame.tsx` (tile + intro), `FindMyTwinOnline.tsx` (all room screens), `findMyTwinApi.ts` (calls), `useTwinRoom.ts` (live sync), `findMyTwinEngine.ts` (questions + prompts), `pages/FindMyTwinJoinPage.tsx`.
  - Flow: everyone answers the questions (10 by default, editable in Admin -> Games), host reveals, the database pairs people (best match first), each phone shows "You + Name, 92% match, Find Name!", both tap "I found", a conversation prompt unlocks, both tap "We talked", anyone unlocks the next round (new twin, never a repeat). 4 rounds by default (one per conversation starter).
  - Answers and pairings are private in the database. A phone only gets its own twin(s).
  - The question ORDER in `findMyTwinEngine.ts` must match the weights in `_ft_score` in the SQL.
  - To add a prompt, add a line to `PROMPTS` (round N uses prompt N).
