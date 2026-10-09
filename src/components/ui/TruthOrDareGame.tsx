import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Sparkle, Plus, X, Play, Check, SkipForward, ArrowCounterClockwise, SpeakerHigh, SpeakerSlash,
  ChatCircleDots, Lightning, Flag, Fire, Timer, Trophy, ArrowUp, Question, Shuffle, ListNumbers,
} from '@phosphor-icons/react';
import Modal from './Modal';
import { useSynth } from './gameAudio';
import { GameTile, TimerRing, Confetti } from './gameParts';
import { GOLD_GRAD_TEXT, primaryBtn, ghostBtn, iconBtn, glass, eyebrow, cleanName } from './gameUi';
import { useGameContent } from '../../hooks/useGameContent';
import { TOD_LEVELS, TOD_DEFAULTS, sanitizeTodContent, type TodKind, type TodLevel, type TodTwist } from './truthOrDareData';

// "Truth or Dare": pass-and-play on one phone, built to keep a group hooked.
//  - Spin the bottle picks who is next (or play in order), and it favours
//    people who have had fewer turns.
//  - Pick Truth, Dare, or "Surprise me" (which can deal a group twist card).
//    Cards arrive face down: tap to flip.
//  - Points scale with the heat (Chill 1, Spicy 2, Wild 3, twists 2), with a
//    streak bonus for every third completed card in a row. "Heat up" raises
//    the level as the rounds go on.
//  - Dares can start a 30-second timer; each player gets 2 skips.
//  - The end screen hands out awards (Champion, Bravest, Open Book, Chicken).
// Front-end only: nothing is stored except the shared sound setting.
//
// Admin-hosted: this game is no longer on the public Games page. Admin ->
// Games -> "Play Truth or Dare" picks a trip and passes the booked travellers
// who are present in as `players`, so the setup screen opens already filled.

const MUTE_KEY = 'ulaa:packbag:muted'; // one sound setting for all the games
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 10;
const SKIPS_PER_PLAYER = 2;
const TWIST_CHANCE = 0.18;
const DARE_SECONDS = 30;
const SPIN_MS = 3200;
const SPIN_TICKS = 16;
const POINTS: Record<TodLevel, number> = { chill: 1, spicy: 2, wild: 3 };
const TWIST_POINTS = 2;
const HUES = ['#E9C25A', '#D98A3A', '#F4B183', '#C8962A', '#E07A5F', '#81B29A', '#F2CC8F', '#B5838D', '#A8DADC', '#CDB4DB'];

type LevelChoice = TodLevel | 'heatup';
type Phase = 'idle' | 'setup' | 'spin' | 'pick' | 'card' | 'summary';
type CardKind = TodKind | 'twist';
interface Card { kind: CardKind; level: TodLevel; title: string; text: string; points: number }
interface Stat { points: number; truths: number; dares: number; twists: number; skipped: number; skipsLeft: number; streak: number; turns: number }

const emptyStat = (): Stat => ({ points: 0, truths: 0, dares: 0, twists: 0, skipped: 0, skipsLeft: SKIPS_PER_PLAYER, streak: 0, turns: 0 });

interface Props {
  tripId?: string;
  tripSlug?: string;
  tripTitle?: string;
  className?: string;
  compact?: boolean;
  thumb?: boolean;
  /** Slim one-line tile (admin Games page). */
  row?: boolean;
  /** Names to pre-fill the setup screen with (e.g. the travellers present on a trip). */
  players?: string[];
  /** Upper limit on players; defaults to MAX_PLAYERS. */
  maxPlayers?: number;
  /** Open straight on the setup screen (used by the shared /play/truth-or-dare link). */
  defaultOpen?: boolean;
}

function shuffled<T>(list: T[]): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const levelFor = (choice: LevelChoice, round: number): TodLevel =>
  choice !== 'heatup' ? choice : round <= 2 ? 'chill' : round <= 4 ? 'spicy' : 'wild';

const HeatDots = ({ level }: { level: TodLevel }) => (
  <span className="inline-flex items-center gap-0.5 text-[#F0CE7A]" aria-label={`Heat: ${level}`}>
    {[0, 1, 2].map(i => (
      <Fire key={i} size={13} weight={i <= ['chill', 'spicy', 'wild'].indexOf(level) ? 'fill' : 'regular'} className={i <= ['chill', 'spicy', 'wild'].indexOf(level) ? '' : 'opacity-30'} />
    ))}
  </span>
);

const initialNames = (preset?: string[], max = MAX_PLAYERS): string[] => {
  const list = (preset ?? []).map(cleanName).filter(Boolean).slice(0, max);
  return list.length ? list : ['', ''];
};

export default function TruthOrDareGame({ className = '', compact = false, thumb = false, row = false, players: presetPlayers, maxPlayers = MAX_PLAYERS, defaultOpen = false }: Props) {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>(defaultOpen ? 'setup' : 'idle');
  const [names, setNames] = useState<string[]>(() => initialNames(presetPlayers, maxPlayers));
  const presetKey = (presetPlayers ?? []).join('\u0001');
  const lastPresetKey = useRef(presetKey);
  // The roster changed (another trip picked, someone ticked present/absent):
  // refill the setup list, but never in the middle of a game.
  useEffect(() => {
    if (lastPresetKey.current === presetKey) return;
    lastPresetKey.current = presetKey;
    setNames(initialNames(presetPlayers, maxPlayers));
  }, [presetKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [levelChoice, setLevelChoice] = useState<LevelChoice>('heatup');
  const [spinMode, setSpinMode] = useState(true);

  const [players, setPlayers] = useState<string[]>([]);
  const [stats, setStats] = useState<Stat[]>([]);
  const [turnCount, setTurnCount] = useState(0);
  const [current, setCurrent] = useState(0);
  const [card, setCard] = useState<Card | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [gain, setGain] = useState<{ pts: number; bonus: boolean } | null>(null);

  const [rot, setRot] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [dareLeft, setDareLeft] = useState<number | null>(null);

  const [muted, setMuted] = useState<boolean>(() => {
    try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
  });
  const mutedRef = useRef(muted);
  const { ensure, play, onPressCapture } = useSynth(mutedRef);

  const decks = useRef<Record<string, string[]>>({});
  const twistDeck = useRef<TodTwist[]>([]);
  const tickTimers = useRef<number[]>([]);
  const dareEnd = useRef(0);
  const last = useRef(-1);

  const content = useGameContent('truth-or-dare', TOD_DEFAULTS, sanitizeTodContent);

  const round = players.length ? Math.floor(turnCount / players.length) + 1 : 1;
  const level = levelFor(levelChoice, round);

  const toggleMute = () => {
    const next = !muted;
    mutedRef.current = next;
    setMuted(next);
    try { localStorage.setItem(MUTE_KEY, next ? '1' : '0'); } catch { /* not remembered */ }
  };

  const filled = useMemo(() => names.map(cleanName).filter(Boolean), [names]);
  const canStart = filled.length >= MIN_PLAYERS;

  useEffect(() => () => { tickTimers.current.forEach(window.clearTimeout); }, []);

  // Dare countdown, from a fixed end time.
  useEffect(() => {
    if (dareLeft === null) return;
    const id = window.setInterval(() => {
      const s = Math.max(0, Math.ceil((dareEnd.current - Date.now()) / 1000));
      setDareLeft(s);
      if (s <= 5 && s > 0) play('tick');
      if (s === 0) { window.clearInterval(id); play('end'); }
    }, 250);
    return () => window.clearInterval(id);
  }, [dareLeft === null, play]); // eslint-disable-line react-hooks/exhaustive-deps

  const draw = (kind: TodKind, lvl: TodLevel): string => {
    const key = `${kind}-${lvl}`;
    if (!decks.current[key]?.length) decks.current[key] = shuffled(content.prompts[kind][lvl]);
    return decks.current[key].pop() ?? '';
  };

  const start = () => {
    if (!canStart) return;
    ensure();
    play('go');
    const seen = new Map<string, number>();
    const unique = filled.map(n => {
      const k = n.toLowerCase();
      const c = (seen.get(k) ?? 0) + 1;
      seen.set(k, c);
      return c > 1 ? `${n} ${c}` : n;
    });
    decks.current = {};
    twistDeck.current = shuffled(content.twists);
    setPlayers(unique);
    setStats(unique.map(emptyStat));
    setTurnCount(0);
    last.current = -1;
    setRot(0);
    if (spinMode) { setCurrent(0); setPhase('spin'); } else { setCurrent(0); setPhase('pick'); }
  };

  // Picks the next player: never the same twice in a row, favouring fewer turns.
  const choosePlayer = (): number => {
    const weights = players.map((_, i) => (i === last.current ? 0 : 1 / (1 + stats[i].turns * 1.5)));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) return i; }
    return 0;
  };

  const finishSpin = (idx: number) => {
    setSpinning(false);
    setCurrent(idx);
    last.current = idx;
    play('good');
    window.setTimeout(() => setPhase('pick'), reduce ? 0 : 900);
  };

  const spin = () => {
    if (spinning) return;
    const target = choosePlayer();
    const seg = 360 / players.length;
    const want = target * seg;
    const delta = (((want - rot) % 360) + 360) % 360;
    const next = rot + 1440 + delta;
    setSpinning(true);
    if (reduce) { setRot(next); finishSpin(target); return; }
    tickTimers.current.forEach(window.clearTimeout);
    tickTimers.current = [];
    for (let k = 1; k <= SPIN_TICKS; k++) {
      const t = 1 - Math.pow(1 - k / SPIN_TICKS, 1 / 3);
      tickTimers.current.push(window.setTimeout(() => play('tick'), t * SPIN_MS));
    }
    setRot(next);
    tickTimers.current.push(window.setTimeout(() => finishSpin(target), SPIN_MS + 80));
  };

  const choose = (k: TodKind | 'random') => {
    let c: Card;
    const lvl = level;
    if (k === 'random' && twistDeck.current.length && Math.random() < TWIST_CHANCE * 1.6) {
      const t = twistDeck.current.pop() as TodTwist;
      c = { kind: 'twist', level: lvl, title: t.title, text: t.text, points: TWIST_POINTS };
    } else {
      const picked: TodKind = k === 'random' ? (Math.random() < 0.5 ? 'truth' : 'dare') : k;
      c = { kind: picked, level: lvl, title: picked === 'truth' ? 'Truth' : 'Dare', text: draw(picked, lvl), points: POINTS[lvl] };
    }
    play('flip');
    setCard(c);
    setRevealed(false);
    setGain(null);
    setDareLeft(null);
    setPhase('card');
  };

  const reveal = () => { play(card?.kind === 'twist' ? 'gold' : 'flip'); setRevealed(true); };

  const startDareTimer = () => {
    play('go');
    dareEnd.current = Date.now() + DARE_SECONDS * 1000;
    setDareLeft(DARE_SECONDS);
  };

  const advance = () => {
    setDareLeft(null);
    setGain(null);
    setTurnCount(t => t + 1);
    if (spinMode) setPhase('spin');
    else { setCurrent(c => (c + 1) % players.length); last.current = (current + 1) % players.length; setPhase('pick'); }
  };

  const done = () => {
    if (!card) return;
    const st = stats[current];
    const streak = st.streak + 1;
    const bonus = streak % 3 === 0;
    const pts = card.points + (bonus ? 1 : 0);
    play(bonus ? 'win' : 'good');
    setStats(s => s.map((x, i) => (i === current ? {
      ...x,
      points: x.points + pts,
      streak,
      turns: x.turns + 1,
      truths: x.truths + (card.kind === 'truth' ? 1 : 0),
      dares: x.dares + (card.kind === 'dare' ? 1 : 0),
      twists: x.twists + (card.kind === 'twist' ? 1 : 0),
    } : x)));
    setGain({ pts, bonus });
    window.setTimeout(advance, reduce ? 0 : 1100);
  };

  const skip = () => {
    if (stats[current]?.skipsLeft <= 0) return;
    play('miss');
    setStats(s => s.map((x, i) => (i === current ? { ...x, skipped: x.skipped + 1, skipsLeft: x.skipsLeft - 1, streak: 0, turns: x.turns + 1 } : x)));
    advance();
  };

  const close = () => { tickTimers.current.forEach(window.clearTimeout); setSpinning(false); setPhase('idle'); };
  const again = () => { setPhase('setup'); };

  const setName = (i: number, v: string) => setNames(n => n.map((x, idx) => (idx === i ? v : x)));
  const addPlayer = () => { if (names.length < maxPlayers) { play('click'); setNames(n => [...n, '']); } };
  const removePlayer = (i: number) => { if (names.length > MIN_PLAYERS) { play('click'); setNames(n => n.filter((_, idx) => idx !== i)); } };

  const awards = useMemo(() => {
    const best = (score: (s: Stat) => number) => {
      const max = Math.max(...stats.map(score));
      if (max <= 0) return null;
      const idx = stats.map(score).findIndex(v => v === max);
      return { name: players[idx], value: max };
    };
    return [
      { key: 'champ', label: 'Champion', note: 'most points', Icon: Trophy, win: best(s => s.points), unit: 'pts' },
      { key: 'brave', label: 'Bravest', note: 'most dares done', Icon: Lightning, win: best(s => s.dares), unit: 'dares' },
      { key: 'open', label: 'Open Book', note: 'most truths told', Icon: ChatCircleDots, win: best(s => s.truths), unit: 'truths' },
      { key: 'chick', label: 'Chicken', note: 'most skips', Icon: SkipForward, win: best(s => s.skipped), unit: 'skips' },
    ].filter(a => a.win);
  }, [stats, players]);

  const seg = players.length ? 360 / players.length : 360;
  const st = stats[current];
  const isDare = card?.kind === 'dare';
  const accent = card?.kind === 'truth'
    ? 'bg-gradient-to-br from-[#F0CE7A]/20 to-gold/10 border-gold/40'
    : card?.kind === 'dare'
      ? 'bg-gradient-to-br from-secondary/30 to-primary/20 border-primary/50'
      : 'bg-gradient-to-br from-fuchsia-500/20 to-primary/20 border-fuchsia-300/40';
  const badge = card?.kind === 'truth'
    ? 'bg-gradient-to-br from-[#F0CE7A] to-gold text-dark'
    : 'bg-gradient-to-br from-secondary to-primary text-white';

  const scoreboard = (
    <ul className={`${glass} divide-y divide-white/10 text-left`}>
      {players.map((p, i) => (
        <li key={p} className={`flex items-center justify-between gap-3 px-3.5 py-2 text-sm ${phase === 'pick' && i === current ? 'text-white font-semibold' : 'text-cream/65'}`}>
          <span className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: HUES[i % HUES.length] }} aria-hidden="true" />
            <span className="truncate">{p}</span>
            {stats[i]?.streak >= 2 && <span className="inline-flex items-center gap-0.5 text-[11px] text-[#F0CE7A]"><Fire size={12} weight="fill" />{stats[i].streak}</span>}
          </span>
          <span className="tabular-nums">{stats[i]?.points ?? 0}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className={className}>
      <GameTile
        onClick={() => setPhase('setup')}
        compact={compact}
        thumb={thumb}
        row={row}
        Icon={Sparkle}
        accent="primary"
        title="Truth or Dare"
        subtitle="Spin, flip, if you dare"
        chip="Group game"
      />

      <Modal isOpen={phase !== 'idle'} onClose={close} ariaLabel="Truth or Dare group game" size="sm" flush fullScreen>
        <div onPointerDownCapture={onPressCapture} className="[-webkit-tap-highlight-color:transparent] touch-manipulation relative overflow-hidden bg-gradient-to-b from-dark via-footer to-[#1B130E] text-cream px-4 pt-[max(4rem,calc(env(safe-area-inset-top)+3.5rem))] pb-[max(1.5rem,env(safe-area-inset-bottom))] min-h-[100dvh] flex justify-center items-center md:py-10">
          <div className="relative w-full max-w-md flex flex-col">
            <span className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-72 rounded-full bg-primary/35 blur-3xl pointer-events-none" aria-hidden="true" />
            <span className="absolute -top-10 -right-16 w-56 h-56 rounded-full bg-gold/20 blur-3xl pointer-events-none" aria-hidden="true" />

            {phase === 'setup' && (
              <div className="relative text-center pt-3 md:pt-0">
                <motion.div
                  className="w-20 h-20 mx-auto mb-4 rounded-[28px] bg-gradient-to-br from-secondary to-primary text-white flex items-center justify-center shadow-[0_14px_36px_rgba(168,90,42,0.5)]"
                  animate={reduce ? undefined : { y: [0, -6, 0], rotate: [-3, 3, -3] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  aria-hidden="true"
                >
                  <Sparkle size={46} weight="duotone" />
                </motion.div>
                <span className="inline-block text-[10px] font-bold uppercase tracking-[0.2em] text-[#F0CE7A] bg-gold/15 border border-gold/30 rounded-full px-3 py-1 mb-2">Group game · {MIN_PLAYERS} to {maxPlayers} players</span>
                <h2 className="font-display text-4xl font-extrabold text-white leading-tight">Truth or Dare</h2>
                <p className="text-sm text-cream/60 mt-1 mb-4 px-4">Spin to pick who is next. Flip a mystery card. Earn points, build streaks, and watch the heat rise.</p>

                <div className={`${glass} text-left p-3 mb-3`}>
                  <p className={`${eyebrow} mb-2`}>Players</p>
                  <ul className="space-y-2">
                    {names.map((n, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: HUES[i % HUES.length] }} aria-hidden="true" />
                        <input
                          type="text"
                          value={n}
                          maxLength={18}
                          aria-label={`Player ${i + 1} name`}
                          placeholder={`Player ${i + 1}`}
                          enterKeyHint="next"
                          onChange={e => setName(i, e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter' && i === names.length - 1) addPlayer(); }}
                          className="min-w-0 flex-1 rounded-xl bg-white/[0.07] border border-white/15 focus:border-[#F0CE7A]/70 focus:bg-white/10 px-3 py-2.5 text-[15px] font-semibold text-white placeholder:text-cream/30 outline-none transition-colors"
                        />
                        {names.length > MIN_PLAYERS && (
                          <button type="button" onClick={() => removePlayer(i)} aria-label={`Remove player ${i + 1}`} className={iconBtn}><X size={16} /></button>
                        )}
                      </li>
                    ))}
                  </ul>
                  {names.length < maxPlayers && (
                    <button type="button" onClick={addPlayer} className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-[#F0CE7A] hover:text-white transition-colors">
                      <Plus size={14} weight="bold" /> Add player
                    </button>
                  )}
                </div>

                <div className={`${glass} text-left p-3 mb-3`}>
                  <p className={`${eyebrow} mb-2`}>How brave are we?</p>
                  <div role="radiogroup" aria-label="Heat level" className="grid grid-cols-2 gap-2">
                    {([{ id: 'heatup', label: 'Heat up', blurb: 'Gets bolder each round' }, ...TOD_LEVELS] as { id: LevelChoice; label: string; blurb: string }[]).map(l => (
                      <button
                        key={l.id}
                        type="button"
                        role="radio"
                        aria-checked={levelChoice === l.id}
                        onClick={() => { play('click'); setLevelChoice(l.id); }}
                        className={`rounded-xl px-2 py-2.5 text-center border transition active:scale-95 ${levelChoice === l.id ? 'bg-gradient-to-b from-primary-light to-primary border-transparent text-white shadow-[0_6px_16px_rgba(168,90,42,0.45)]' : 'bg-white/[0.07] border-white/15 text-cream/75 hover:bg-white/10'}`}
                      >
                        <span className="block font-display text-sm font-extrabold leading-tight">{l.label}{l.id === 'heatup' && ' (best)'}</span>
                        <span className="block text-[10px] leading-tight mt-0.5 opacity-75">{l.blurb}</span>
                      </button>
                    ))}
                  </div>

                  <p className={`${eyebrow} mt-3 mb-2`}>Who goes next?</p>
                  <div role="radiogroup" aria-label="Turn order" className="grid grid-cols-2 gap-2">
                    {[{ v: true, label: 'Spin the bottle', Icon: Shuffle }, { v: false, label: 'In order', Icon: ListNumbers }].map(o => (
                      <button
                        key={o.label}
                        type="button"
                        role="radio"
                        aria-checked={spinMode === o.v}
                        onClick={() => { play('click'); setSpinMode(o.v); }}
                        className={`rounded-xl px-2 py-2.5 text-sm font-semibold inline-flex items-center justify-center gap-1.5 border transition active:scale-95 ${spinMode === o.v ? 'bg-gradient-to-b from-primary-light to-primary border-transparent text-white shadow-[0_6px_16px_rgba(168,90,42,0.45)]' : 'bg-white/[0.07] border-white/15 text-cream/75 hover:bg-white/10'}`}
                      >
                        <o.Icon size={16} weight="duotone" /> {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button type="button" onClick={start} disabled={!canStart} className={`${primaryBtn} disabled:opacity-50 disabled:pointer-events-none`}>
                  <Play size={18} weight="fill" /> {canStart ? 'Start the game' : `Add at least ${MIN_PLAYERS} names`}
                </button>
                <p className="mt-3 text-[11px] text-cream/40 px-4">Everyone gets {SKIPS_PER_PLAYER} skips. Play kind: nobody has to do anything that feels unsafe or uncomfortable.</p>
                <button type="button" onClick={toggleMute} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-cream/50 hover:text-cream transition-colors">
                  {muted ? <SpeakerSlash size={14} /> : <SpeakerHigh size={14} />} Sound {muted ? 'off' : 'on'}
                </button>
              </div>
            )}

            {phase === 'spin' && (
              <div className="relative text-center">
                <p className={eyebrow}>Round {round} · <HeatDots level={level} /></p>
                <h2 className="font-display text-3xl font-extrabold text-white mt-1 mb-4">Who's next?</h2>

                <div className="relative mx-auto w-[18rem] h-[18rem] max-w-full">
                  <span className="absolute inset-2 rounded-full border border-white/10 bg-white/[0.04]" aria-hidden="true" />
                  {players.map((p, i) => {
                    const a = (i * seg * Math.PI) / 180;
                    const R = 7.1; // rem
                    const d = Math.min(2.75, ((2 * Math.PI * R) / players.length) * 0.9); // rem; shrinks for big groups
                    return (
                      <span
                        key={p}
                        className="absolute left-1/2 top-1/2 rounded-full flex items-center justify-center font-display font-extrabold text-dark shadow-[0_6px_14px_rgba(0,0,0,0.35)]"
                        style={{ background: HUES[i % HUES.length], width: `${d}rem`, height: `${d}rem`, marginLeft: `${-d / 2}rem`, marginTop: `${-d / 2}rem`, fontSize: `${Math.max(0.6, d * 0.4)}rem`, transform: `translate(${Math.sin(a) * R}rem, ${-Math.cos(a) * R}rem)` }}
                        aria-hidden="true"
                      >
                        {p.charAt(0).toUpperCase()}
                      </span>
                    );
                  })}
                  <motion.div
                    className="absolute inset-0"
                    animate={{ rotate: rot }}
                    transition={reduce ? { duration: 0 } : { duration: SPIN_MS / 1000, ease: [0.17, 0.67, 0.21, 1] }}
                    aria-hidden="true"
                  >
                    <span className="absolute left-1/2 top-[22%] -translate-x-1/2 w-3 h-[28%] rounded-full bg-gradient-to-t from-gold/20 to-[#F0CE7A]" />
                    <ArrowUp size={30} weight="fill" className="absolute left-1/2 top-[14%] -translate-x-1/2 text-[#F0CE7A] drop-shadow-[0_0_10px_rgba(240,206,122,0.8)]" />
                  </motion.div>
                  <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-gradient-to-br from-secondary to-primary border-2 border-white/30 flex items-center justify-center text-white shadow-lg" aria-hidden="true">
                    <Sparkle size={26} weight="fill" />
                  </span>
                </div>

                <p className="mt-4 h-6 text-sm text-cream/70" aria-live="polite">
                  {spinning ? 'Spinning…' : stats[current]?.turns ? `${players[current]} just went. Spin again!` : 'Tap spin and let fate decide.'}
                </p>
                <button type="button" onClick={spin} disabled={spinning} className={`${primaryBtn} mt-3 disabled:opacity-60`}>
                  <Shuffle size={18} weight="bold" /> {spinning ? 'Spinning…' : 'Spin the bottle'}
                </button>
                <div className="mt-4">{scoreboard}</div>
                <button type="button" onClick={() => { play('click'); setPhase('summary'); }} disabled={spinning} className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-cream/50 hover:text-cream transition-colors">
                  <Flag size={14} /> End game
                </button>
              </div>
            )}

            {phase === 'pick' && (
              <div className="relative text-center">
                <p className={eyebrow}>Round {round} · <HeatDots level={level} /></p>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${current}-${turnCount}`}
                    initial={reduce ? false : { opacity: 0, y: 16, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={reduce ? undefined : { opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                    className="mt-3 mb-5"
                  >
                    <span className="block text-sm text-cream/60">It's your turn,</span>
                    <h2 className={`font-display text-5xl font-extrabold leading-tight break-words ${GOLD_GRAD_TEXT}`}>{players[current]}</h2>
                    <p className="mt-2 text-sm text-cream/60">
                      {st?.streak >= 2 ? `${st.streak} in a row! Keep it going.` : `Pass the phone to ${players[current]}, then choose.`}
                    </p>
                  </motion.div>
                </AnimatePresence>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <button type="button" onClick={() => choose('truth')} className="rounded-3xl bg-gradient-to-br from-[#F0CE7A] to-gold text-dark py-7 shadow-[0_12px_28px_rgba(200,150,42,0.4)] active:scale-95 transition touch-manipulation select-none">
                    <ChatCircleDots size={36} weight="duotone" className="mx-auto" aria-hidden="true" />
                    <span className="block font-display text-2xl font-extrabold mt-1">Truth</span>
                  </button>
                  <button type="button" onClick={() => choose('dare')} className="rounded-3xl bg-gradient-to-br from-secondary to-primary text-white py-7 shadow-[0_12px_28px_rgba(168,90,42,0.5)] active:scale-95 transition touch-manipulation select-none">
                    <Lightning size={36} weight="duotone" className="mx-auto" aria-hidden="true" />
                    <span className="block font-display text-2xl font-extrabold mt-1">Dare</span>
                  </button>
                </div>
                <button type="button" onClick={() => choose('random')} className={ghostBtn}>
                  <Question size={18} weight="duotone" /> Surprise me <span className="text-[11px] font-medium opacity-60">(may be a twist)</span>
                </button>

                <div className="mt-4">{scoreboard}</div>
                <div className="mt-4 flex items-center justify-between">
                  <button type="button" onClick={() => { play('click'); setPhase('summary'); }} className="inline-flex items-center gap-1.5 text-xs font-semibold text-cream/50 hover:text-cream transition-colors">
                    <Flag size={14} /> End game
                  </button>
                  <button type="button" onClick={toggleMute} className="inline-flex items-center gap-1.5 text-xs font-semibold text-cream/50 hover:text-cream transition-colors">
                    {muted ? <SpeakerSlash size={14} /> : <SpeakerHigh size={14} />} Sound {muted ? 'off' : 'on'}
                  </button>
                </div>
              </div>
            )}

            {phase === 'card' && card && (
              <div className="relative text-center">
                {gain?.bonus && !reduce && <Confetti />}
                <div className="flex items-center justify-between mb-3">
                  <p className={eyebrow}>{players[current]}</p>
                  <p className={`${eyebrow} inline-flex items-center gap-2`}>{card.kind === 'twist' ? 'Twist' : card.title} <HeatDots level={card.level} /> · +{card.points}</p>
                </div>

                <div className="[perspective:1000px]">
                  <AnimatePresence mode="wait" initial={false}>
                    {!revealed ? (
                      <motion.button
                        key="back"
                        type="button"
                        onClick={reveal}
                        initial={reduce ? false : { rotateY: -90, opacity: 0 }}
                        animate={{ rotateY: 0, opacity: 1 }}
                        exit={reduce ? undefined : { rotateY: 90, opacity: 0 }}
                        transition={{ duration: 0.22 }}
                        className="relative w-full min-h-[18rem] rounded-3xl border border-gold/40 bg-gradient-to-br from-dark via-footer to-primary/40 flex flex-col items-center justify-center overflow-hidden shadow-[0_16px_40px_rgba(0,0,0,0.45)] active:scale-[0.98] transition-transform"
                        aria-label="Tap to reveal your card"
                      >
                        <span className="absolute inset-3 rounded-2xl border border-white/10" aria-hidden="true" />
                        <motion.span
                          animate={reduce ? undefined : { scale: [1, 1.12, 1], rotate: [0, 8, -8, 0] }}
                          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                          className="w-20 h-20 rounded-[26px] bg-gradient-to-br from-secondary to-primary text-white flex items-center justify-center shadow-[0_12px_30px_rgba(168,90,42,0.55)]"
                          aria-hidden="true"
                        >
                          <Question size={44} weight="bold" />
                        </motion.span>
                        <span className="mt-5 font-display text-2xl font-extrabold text-white">Tap to reveal</span>
                        <span className="mt-1 text-xs text-cream/50">{card.kind === 'twist' ? 'Something is different this time...' : 'No peeking, group!'}</span>
                      </motion.button>
                    ) : (
                      <motion.div
                        key="front"
                        initial={reduce ? false : { rotateY: -90, opacity: 0 }}
                        animate={{ rotateY: 0, opacity: 1 }}
                        transition={{ duration: 0.28, ease: 'easeOut' }}
                        className={`rounded-3xl p-6 min-h-[18rem] flex flex-col items-center justify-center border ${accent}`}
                      >
                        <span className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3 ${badge}`} aria-hidden="true">
                          {card.kind === 'truth' ? <ChatCircleDots size={30} weight="duotone" /> : card.kind === 'dare' ? <Lightning size={30} weight="duotone" /> : <Sparkle size={30} weight="duotone" />}
                        </span>
                        {card.kind === 'twist'
                          ? <h2 className="font-display text-sm font-bold uppercase tracking-[0.18em] text-fuchsia-200 mb-2">Twist · {card.title}</h2>
                          : <h2 className="sr-only">{card.title}</h2>}
                        <p className="font-display text-2xl sm:text-[26px] font-bold leading-snug text-white" aria-live="polite">{card.text}</p>

                        {isDare && (
                          <div className="mt-4 h-14 flex items-center justify-center">
                            {dareLeft === null ? (
                              <button type="button" onClick={startDareTimer} className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full bg-white/10 border border-white/15 px-3.5 py-2 text-cream/80 hover:text-white hover:bg-white/15 transition">
                                <Timer size={15} weight="duotone" /> Start {DARE_SECONDS}s timer
                              </button>
                            ) : (
                              <TimerRing secondsLeft={dareLeft} progress={1 - dareLeft / DARE_SECONDS} />
                            )}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="mt-4 space-y-2.5 min-h-[7.5rem]">
                  {revealed && !gain && (
                    <>
                      <button type="button" onClick={done} className={primaryBtn}><Check size={18} weight="bold" /> Done</button>
                      <button type="button" onClick={skip} disabled={(st?.skipsLeft ?? 0) <= 0} className={ghostBtn}>
                        <SkipForward size={18} weight="fill" /> {(st?.skipsLeft ?? 0) > 0 ? `Skip (${st.skipsLeft} left, breaks streak)` : 'No skips left'}
                      </button>
                    </>
                  )}
                  {gain && (
                    <motion.p
                      initial={reduce ? false : { opacity: 0, scale: 0.7, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                      className={`font-display text-4xl font-extrabold pt-2 ${GOLD_GRAD_TEXT}`}
                      aria-live="polite"
                    >
                      +{gain.pts} {gain.bonus && <span className="text-base align-middle text-[#F0CE7A]">streak bonus!</span>}
                    </motion.p>
                  )}
                </div>
              </div>
            )}

            {phase === 'summary' && (
              <div className="relative text-center pt-3">
                {!reduce && awards.length > 0 && <Confetti />}
                <h2 className={`font-display text-4xl font-extrabold ${GOLD_GRAD_TEXT}`}>Good game!</h2>
                <p className="text-sm text-cream/60 mt-1 mb-4">{awards.length ? 'Here are the awards.' : 'No turns played yet.'}</p>
                {awards.length > 0 && (
                  <ul className="grid grid-cols-2 gap-2.5 mb-4">
                    {awards.map(a => (
                      <li key={a.key} className={`${glass} p-3 text-center`}>
                        <span className="w-9 h-9 mx-auto mb-1.5 rounded-xl bg-gradient-to-br from-[#F0CE7A] to-gold text-dark flex items-center justify-center" aria-hidden="true"><a.Icon size={20} weight="duotone" /></span>
                        <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-cream/50">{a.label}</span>
                        <span className="block font-display text-lg font-extrabold text-white truncate">{a.win?.name}</span>
                        <span className="block text-[11px] text-cream/50">{a.win?.value} {a.unit}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mb-4">{scoreboard}</div>
                <div className="space-y-2.5">
                  <button type="button" onClick={again} className={primaryBtn}><ArrowCounterClockwise size={18} weight="bold" /> New game</button>
                  {players.length > 0 && <button type="button" onClick={() => { play('click'); setPhase(spinMode ? 'spin' : 'pick'); }} className={ghostBtn}>Keep playing</button>}
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
