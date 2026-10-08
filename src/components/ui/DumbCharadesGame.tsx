import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  FilmSlate, Play, Plus, X, Check, SkipForward, Eye, Lightbulb, ArrowCounterClockwise, Trophy,
  SpeakerHigh, SpeakerSlash, DeviceMobile,
} from '@phosphor-icons/react';
import Modal from './Modal';
import { useSynth } from './gameAudio';
import { GameTile, TimerRing, Confetti } from './gameParts';
import { GOLD_GRAD_TEXT, primaryBtn, ghostBtn, iconBtn, glass, eyebrow, cleanName } from './gameUi';
import {
  CATEGORY_LABELS, categoryOptions, moviesFor, type CharadesCategory, type TamilMovie,
} from './charadesTamilMovies';

// "Dumb Charades": Tamil movies edition. Teams take turns on one phone. The
// actor sees the movie title and acts it out without speaking while their team
// guesses before the timer ends: "Got it" scores a point, "Pass" moves on.
// The pool can be every film, or narrowed by decade, hero, heroine, director
// or comedian (see charadesTamilMovies.ts). Front-end only: nothing is stored
// except the shared sound setting.

const MUTE_KEY = 'ulaa:packbag:muted'; // one sound setting for all the games
const MIN_TEAMS = 2;
const MAX_TEAMS = 4;
const TIMES = [60, 90, 120] as const;
const ROUNDS = [2, 3, 5] as const;
const CATEGORIES: CharadesCategory[] = ['all', 'decade', 'hero', 'heroine', 'director', 'comedian'];
const MIN_POOL = 5;

type Phase = 'idle' | 'setup' | 'handoff' | 'acting' | 'turnEnd' | 'final';
interface Result { movie: TamilMovie; got: boolean }

interface Props {
  tripId: string;
  tripSlug: string;
  tripTitle: string;
  className?: string;
  compact?: boolean;
  thumb?: boolean;
}

function shuffled<T>(list: T[]): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const Chip = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    type="button"
    role="radio"
    aria-checked={active}
    onClick={onClick}
    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold border transition active:scale-95 ${active ? 'bg-gradient-to-b from-primary-light to-primary border-transparent text-white shadow-[0_4px_12px_rgba(168,90,42,0.45)]' : 'bg-white/[0.07] border-white/15 text-cream/75 hover:bg-white/10'}`}
  >
    {children}
  </button>
);

export default function DumbCharadesGame({ className = '', compact = false, thumb = false }: Props) {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>('idle');
  const [teamNames, setTeamNames] = useState<string[]>(['', '']);
  const [seconds, setSeconds] = useState<number>(90);
  const [rounds, setRounds] = useState<number>(3);
  const [category, setCategory] = useState<CharadesCategory>('all');
  const [value, setValue] = useState<string | null>(null);

  const [teams, setTeams] = useState<string[]>([]);
  const [scores, setScores] = useState<number[]>([]);
  const [turn, setTurn] = useState(0);
  const [movie, setMovie] = useState<TamilMovie | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [hint, setHint] = useState(false);
  const [left, setLeft] = useState(0);
  const [muted, setMuted] = useState<boolean>(() => {
    try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
  });
  const mutedRef = useRef(muted);
  const { ensure, play, onPressCapture } = useSynth(mutedRef);

  const deck = useRef<TamilMovie[]>([]);
  const poolRef = useRef<TamilMovie[]>([]);
  const endAt = useRef(0);
  const lastTick = useRef(-1);

  const toggleMute = () => {
    const next = !muted;
    mutedRef.current = next;
    setMuted(next);
    try { localStorage.setItem(MUTE_KEY, next ? '1' : '0'); } catch { /* not remembered */ }
  };

  const options = useMemo(() => categoryOptions(category), [category]);
  const pool = useMemo(() => moviesFor(category, value), [category, value]);
  const poolOk = pool.length >= MIN_POOL && (category === 'all' || value !== null);

  const chosenTeams = useMemo(() => {
    const seen = new Map<string, number>();
    return teamNames.map((n, i) => cleanName(n) || `Team ${i + 1}`).map(n => {
      const k = n.toLowerCase();
      const c = (seen.get(k) ?? 0) + 1;
      seen.set(k, c);
      return c > 1 ? `${n} ${c}` : n;
    });
  }, [teamNames]);

  const nextMovie = (): TamilMovie => {
    if (deck.current.length === 0) deck.current = shuffled(poolRef.current);
    return deck.current.pop() as TamilMovie;
  };

  const pickCategory = (c: CharadesCategory) => { play('click'); setCategory(c); setValue(null); };

  const start = () => {
    if (!poolOk) return;
    ensure();
    play('go');
    poolRef.current = pool;
    deck.current = shuffled(pool);
    setTeams(chosenTeams);
    setScores(chosenTeams.map(() => 0));
    setTurn(0);
    setPhase('handoff');
  };

  const team = turn % Math.max(teams.length, 1);
  const round = Math.floor(turn / Math.max(teams.length, 1)) + 1;

  const begin = () => {
    play('go');
    setResults([]);
    setHint(false);
    setMovie(nextMovie());
    endAt.current = Date.now() + seconds * 1000;
    lastTick.current = -1;
    setLeft(seconds);
    setPhase('acting');
  };

  // Countdown from a fixed end time, so a throttled background tab can't stretch a turn.
  useEffect(() => {
    if (phase !== 'acting') return;
    const id = window.setInterval(() => {
      const s = Math.max(0, Math.ceil((endAt.current - Date.now()) / 1000));
      setLeft(s);
      if (s <= 5 && s > 0 && s !== lastTick.current) { lastTick.current = s; play('tick'); }
      if (s === 0) {
        window.clearInterval(id);
        play('end');
        setPhase('turnEnd');
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [phase, play]);

  const answer = (got: boolean) => {
    if (!movie) return;
    play(got ? 'good' : 'miss');
    setResults(r => [...r, { movie, got }]);
    if (got) setScores(s => s.map((x, i) => (i === team ? x + 1 : x)));
    setHint(false);
    setMovie(nextMovie());
  };

  const afterTurn = () => {
    if (turn + 1 >= rounds * teams.length) { play('win'); setPhase('final'); return; }
    setTurn(t => t + 1);
    setPhase('handoff');
  };

  const close = () => setPhase('idle');

  const setTeamName = (i: number, v: string) => setTeamNames(n => n.map((x, idx) => (idx === i ? v : x)));
  const addTeam = () => { if (teamNames.length < MAX_TEAMS) { play('click'); setTeamNames(n => [...n, '']); } };
  const removeTeam = (i: number) => { if (teamNames.length > MIN_TEAMS) { play('click'); setTeamNames(n => n.filter((_, idx) => idx !== i)); } };

  const gotThisTurn = results.filter(r => r.got).length;
  const topScore = Math.max(0, ...scores);
  const winners = scores.map((s, i) => (s === topScore ? teams[i] : null)).filter(Boolean) as string[];
  const hintText = movie
    ? [movie.year, movie.heroes[0], movie.director].filter(Boolean).join(' · ')
    : '';

  return (
    <div className={className}>
      <GameTile
        onClick={() => setPhase('setup')}
        compact={compact}
        thumb={thumb}
        Icon={FilmSlate}
        accent="gold"
        title="Dumb Charades"
        subtitle="Tamil movies edition"
        chip="New · Group game"
      />

      <Modal isOpen={phase !== 'idle'} onClose={close} ariaLabel="Dumb Charades Tamil movies group game" size="sm" flush fullScreen>
        <div onPointerDownCapture={onPressCapture} className="[-webkit-tap-highlight-color:transparent] touch-manipulation relative overflow-hidden bg-gradient-to-b from-dark via-footer to-[#1B130E] text-cream px-4 pt-[max(4rem,calc(env(safe-area-inset-top)+3.5rem))] pb-[max(1.5rem,env(safe-area-inset-bottom))] min-h-[100dvh] flex justify-center items-center md:py-10">
          <div className="relative w-full max-w-md flex flex-col">
            <span className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-72 rounded-full bg-primary/35 blur-3xl pointer-events-none" aria-hidden="true" />
            <span className="absolute -top-10 -right-16 w-56 h-56 rounded-full bg-gold/20 blur-3xl pointer-events-none" aria-hidden="true" />

            {phase === 'setup' && (
              <div className="relative text-center pt-3 md:pt-0">
                <motion.div
                  className="w-20 h-20 mx-auto mb-4 rounded-[28px] bg-gradient-to-br from-[#F0CE7A] to-gold text-dark flex items-center justify-center shadow-[0_14px_36px_rgba(200,150,42,0.45)]"
                  animate={reduce ? undefined : { y: [0, -6, 0], rotate: [-3, 3, -3] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  aria-hidden="true"
                >
                  <FilmSlate size={46} weight="duotone" />
                </motion.div>
                <span className="inline-block text-[10px] font-bold uppercase tracking-[0.2em] text-[#F0CE7A] bg-gold/15 border border-gold/30 rounded-full px-3 py-1 mb-2">Teams · {MIN_TEAMS} to {MAX_TEAMS}</span>
                <h2 className="font-display text-4xl font-extrabold text-white leading-tight">Dumb Charades</h2>
                <p className="text-sm text-cream/60 mt-1 mb-4 px-4">Act out Tamil movies without a word. Your team guesses before the clock runs out.</p>

                <div className={`${glass} text-left p-3 mb-3`}>
                  <p className={`${eyebrow} mb-2`}>Teams</p>
                  <ul className="space-y-2">
                    {teamNames.map((n, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={n}
                          maxLength={18}
                          aria-label={`Team ${i + 1} name`}
                          placeholder={`Team ${i + 1}`}
                          onChange={e => setTeamName(i, e.target.value)}
                          className="min-w-0 flex-1 rounded-xl bg-white/[0.07] border border-white/15 focus:border-[#F0CE7A]/70 focus:bg-white/10 px-3 py-2.5 text-[15px] font-semibold text-white placeholder:text-cream/30 outline-none transition-colors"
                        />
                        {teamNames.length > MIN_TEAMS && (
                          <button type="button" onClick={() => removeTeam(i)} aria-label={`Remove team ${i + 1}`} className={iconBtn}><X size={16} /></button>
                        )}
                      </li>
                    ))}
                  </ul>
                  {teamNames.length < MAX_TEAMS && (
                    <button type="button" onClick={addTeam} className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-[#F0CE7A] hover:text-white transition-colors">
                      <Plus size={14} weight="bold" /> Add team
                    </button>
                  )}
                </div>

                <div className={`${glass} text-left p-3 mb-3`}>
                  <p className={`${eyebrow} mb-2`}>Pick movies by</p>
                  <div role="radiogroup" aria-label="Movie category" className="flex flex-wrap gap-1.5">
                    {CATEGORIES.map(c => <Chip key={c} active={category === c} onClick={() => pickCategory(c)}>{CATEGORY_LABELS[c]}</Chip>)}
                  </div>
                  {category !== 'all' && (
                    <div role="radiogroup" aria-label={CATEGORY_LABELS[category]} className="mt-3 flex flex-wrap gap-1.5 max-h-44 overflow-y-auto pr-1">
                      {options.map(o => (
                        <Chip key={o.value} active={value === o.value} onClick={() => { play('click'); setValue(o.value); }}>
                          {o.value} <span className="opacity-60">· {o.count}</span>
                        </Chip>
                      ))}
                    </div>
                  )}
                  <p className="mt-2.5 text-[11px] text-cream/50">
                    {category !== 'all' && !value ? `Choose a ${CATEGORY_LABELS[category].toLowerCase()} to continue.` : `${pool.length} movies in this pack.`}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className={`${glass} p-3 text-left`}>
                    <p className={`${eyebrow} mb-2`}>Time per turn</p>
                    <div role="radiogroup" aria-label="Time per turn" className="flex gap-1.5">
                      {TIMES.map(t => <Chip key={t} active={seconds === t} onClick={() => { play('click'); setSeconds(t); }}>{t}s</Chip>)}
                    </div>
                  </div>
                  <div className={`${glass} p-3 text-left`}>
                    <p className={`${eyebrow} mb-2`}>Rounds</p>
                    <div role="radiogroup" aria-label="Rounds" className="flex gap-1.5">
                      {ROUNDS.map(r => <Chip key={r} active={rounds === r} onClick={() => { play('click'); setRounds(r); }}>{r}</Chip>)}
                    </div>
                  </div>
                </div>

                <button type="button" onClick={start} disabled={!poolOk} className={`${primaryBtn} disabled:opacity-50 disabled:pointer-events-none`}>
                  <Play size={18} weight="fill" /> Start the game
                </button>
                <p className="mt-3 text-[11px] text-cream/40 px-4">No talking, no pointing at objects. Tap your arm for the number of words, or act out each word one by one.</p>
                <button type="button" onClick={toggleMute} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-cream/50 hover:text-cream transition-colors">
                  {muted ? <SpeakerSlash size={14} /> : <SpeakerHigh size={14} />} Sound {muted ? 'off' : 'on'}
                </button>
              </div>
            )}

            {phase === 'handoff' && (
              <div className="relative text-center">
                <p className={eyebrow}>Round {round} of {rounds}</p>
                <div className="mt-3 mb-6">
                  <span className="block text-sm text-cream/60">Up next</span>
                  <h2 className={`font-display text-5xl font-extrabold leading-tight break-words ${GOLD_GRAD_TEXT}`}>{teams[team]}</h2>
                </div>
                <ul className={`${glass} divide-y divide-white/10 mb-5 text-left`}>
                  {teams.map((t, i) => (
                    <li key={t} className={`flex items-center justify-between px-3.5 py-2.5 text-sm ${i === team ? 'text-white font-semibold' : 'text-cream/60'}`}>
                      <span className="truncate">{t}</span>
                      <span className="tabular-nums">{scores[i]}</span>
                    </li>
                  ))}
                </ul>
                <p className="mb-4 text-sm text-cream/60 flex items-center justify-center gap-2">
                  <DeviceMobile size={18} weight="duotone" className="text-[#F0CE7A]" aria-hidden="true" />
                  Pass the phone to one actor. Guessers, look away!
                </p>
                <button type="button" onClick={begin} className={primaryBtn}><Eye size={18} weight="bold" /> I'm the actor, start the {seconds}s clock</button>
                <button type="button" onClick={() => { play('click'); setPhase('final'); }} className="mt-4 text-xs font-semibold text-cream/50 hover:text-cream transition-colors">End game</button>
              </div>
            )}

            {phase === 'acting' && movie && (
              <div className="relative text-center">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-left min-w-0">
                    <p className={eyebrow}>Acting</p>
                    <p className="font-display text-lg font-extrabold text-white truncate">{teams[team]}</p>
                  </div>
                  <div className="text-right">
                    <p className={eyebrow}>This turn</p>
                    <p className="font-display text-lg font-extrabold text-[#F0CE7A] tabular-nums">{gotThisTurn}</p>
                  </div>
                  <TimerRing secondsLeft={left} progress={1 - left / seconds} />
                </div>

                <motion.div
                  key={movie.id}
                  initial={reduce ? false : { opacity: 0, y: 16, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.25 }}
                  className="rounded-3xl p-6 min-h-[14rem] flex flex-col items-center justify-center border bg-gradient-to-br from-[#F0CE7A]/20 to-gold/10 border-gold/40 mb-4"
                >
                  <FilmSlate size={34} weight="duotone" className="text-[#F0CE7A] mb-3" aria-hidden="true" />
                  <h2 className="font-display text-4xl font-extrabold leading-tight text-white break-words" aria-live="polite">{movie.title}</h2>
                  {hint
                    ? <p className="mt-3 text-sm text-[#F0CE7A]">{hintText}</p>
                    : <button type="button" onClick={() => { play('click'); setHint(true); }} className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-cream/60 hover:text-white transition-colors"><Lightbulb size={14} weight="duotone" /> Show hint for your team</button>}
                </motion.div>

                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => answer(false)} className={ghostBtn}><SkipForward size={18} weight="fill" /> Pass</button>
                  <button type="button" onClick={() => answer(true)} className={primaryBtn}><Check size={18} weight="bold" /> Got it</button>
                </div>
              </div>
            )}

            {phase === 'turnEnd' && (
              <div className="relative text-center">
                <h2 className={`font-display text-4xl font-extrabold ${GOLD_GRAD_TEXT}`}>Time's up!</h2>
                <p className="text-sm text-cream/60 mt-1 mb-4">{teams[team]} got <strong className="text-white">{gotThisTurn}</strong> {gotThisTurn === 1 ? 'movie' : 'movies'}.</p>
                {results.length > 0 && (
                  <ul className={`${glass} divide-y divide-white/10 text-left mb-4 max-h-60 overflow-y-auto`}>
                    {results.map((r, i) => (
                      <li key={i} className="flex items-center gap-3 px-3.5 py-2.5 text-sm">
                        <span className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center ${r.got ? 'bg-emerald-500/25 text-emerald-300' : 'bg-white/10 text-cream/50'}`}>
                          {r.got ? <Check size={14} weight="bold" /> : <X size={14} weight="bold" />}
                        </span>
                        <span className={r.got ? 'text-white font-semibold' : 'text-cream/60'}>{r.movie.title}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <button type="button" onClick={afterTurn} className={primaryBtn}>
                  {turn + 1 >= rounds * teams.length ? 'See the results' : 'Next team'}
                </button>
              </div>
            )}

            {phase === 'final' && (
              <div className="relative text-center pt-3">
                {topScore > 0 && !reduce && <Confetti />}
                <span className="w-16 h-16 mx-auto mb-3 rounded-[22px] bg-gradient-to-br from-[#F0CE7A] to-gold text-dark flex items-center justify-center shadow-[0_14px_36px_rgba(200,150,42,0.45)]" aria-hidden="true">
                  <Trophy size={34} weight="duotone" />
                </span>
                <h2 className={`font-display text-4xl font-extrabold leading-tight ${GOLD_GRAD_TEXT}`}>
                  {topScore === 0 ? 'Good game!' : winners.length > 1 ? "It's a tie!" : `${winners[0]} wins!`}
                </h2>
                <p className="text-sm text-cream/60 mt-1 mb-4">Final scores</p>
                <ul className={`${glass} divide-y divide-white/10 text-left mb-4`}>
                  {teams.map((t, i) => (
                    <li key={t} className="flex items-center justify-between gap-3 px-3.5 py-3">
                      <span className="font-semibold text-white truncate">{t}</span>
                      <span className="font-display text-xl font-extrabold text-[#F0CE7A] tabular-nums">{scores[i]}</span>
                    </li>
                  ))}
                </ul>
                <div className="space-y-2.5">
                  <button type="button" onClick={() => { play('click'); setPhase('setup'); }} className={primaryBtn}><ArrowCounterClockwise size={18} weight="bold" /> Play again</button>
                  <button type="button" onClick={close} className={ghostBtn}>Close</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
