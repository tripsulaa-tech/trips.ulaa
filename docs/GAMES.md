# Ulaa Games: style and build guide

Follow this when adding or changing a game, so every game looks, sounds and feels the same. Reference implementations: `PackBagGame.tsx`, `TravelMatchGame.tsx`, `StowawayGame.tsx`, `FindMyTwinGame.tsx` in `src/components/ui/`.

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

## Online group games (Stowaway, Find My Twin)
These two need Supabase (everyone uses their own phone), so they are the exception to "front-end only".
- Stowaway: `supabase/migration/add_stowaway_online.sql`, join link `/play/stowaway/:code`.
- Find My Twin: `supabase/migration/add_find_my_twin.sql`, join link `/play/twin/:code`. Run the SQL once in the Supabase SQL editor before using the game.
  - Files: `FindMyTwinGame.tsx` (tile + intro), `FindMyTwinOnline.tsx` (all room screens), `findMyTwinApi.ts` (calls), `useTwinRoom.ts` (live sync), `findMyTwinEngine.ts` (questions + prompts), `pages/FindMyTwinJoinPage.tsx`.
  - Flow: everyone answers 5 questions, host reveals, the database pairs people (best match first), each phone shows "You + Name, 92% match, Find Name!", both tap "I found", a conversation prompt unlocks, both tap "We talked", anyone unlocks the next round (new twin, never a repeat). 4 rounds max.
  - Answers and pairings are private in the database. A phone only gets its own twin(s).
  - The question ORDER in `findMyTwinEngine.ts` must match the weights in `_ft_score` in the SQL.
  - To add a prompt, add a line to `PROMPTS` (round N uses prompt N).
