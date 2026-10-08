import { useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Sparkle, Plus, X, Play, Check, SkipForward, ArrowCounterClockwise, SpeakerHigh, SpeakerSlash,
  ChatCircleDots, Lightning, Flag,
} from '@phosphor-icons/react';
import Modal from './Modal';
import { useSynth } from './gameAudio';
import { GameTile } from './gameParts';
import { GOLD_GRAD_TEXT, primaryBtn, ghostBtn, iconBtn, glass, eyebrow, cleanName } from './gameUi';
import { TOD_LEVELS, TOD_PROMPTS, type TodKind, type TodLevel } from './truthOrDareData';

// "Truth or Dare": pass-and-play on one phone. Add the players, pick how
// brave the group is feeling, then take turns: the phone names whose turn it
// is, that player picks Truth or Dare (or lets fate decide), reads the card
// aloud, and taps Done. Each player gets a couple of skips per game. Prompts
// are shuffled per game and never repeat until a list runs out.
// Front-end only: nothing is stored except the shared sound setting.

const MUTE_KEY = 'ulaa:packbag:muted'; // one sound setting for all the games
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 10;
const SKIPS_PER_PLAYER = 2;

interface Stat { done: number; skipped: number; skipsLeft: number }
type Phase = 'idle' | 'setup' | 'pick' | 'card' | 'summary';

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

export default function TruthOrDareGame({ className = '', compact = false, thumb = false }: Props) {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>('idle');
  const [names, setNames] = useState<string[]>(['', '']);
  const [level, setLevel] = useState<TodLevel>('chill');
  const [players, setPlayers] = useState<string[]>([]);
  const [stats, setStats] = useState<Stat[]>([]);
  const [turn, setTurn] = useState(0);
  const [kind, setKind] = useState<TodKind>('truth');
  const [prompt, setPrompt] = useState('');
  const [round, setRound] = useState(1);
  const [muted, setMuted] = useState<boolean>(() => {
    try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
  });
  const mutedRef = useRef(muted);
  const { ensure, play, onPressCapture } = useSynth(mutedRef);

  // Remaining shuffled prompts for the current game, per kind.
  const decks = useRef<Record<TodKind, string[]>>({ truth: [], dare: [] });

  const toggleMute = () => {
    const next = !muted;
    mutedRef.current = next;
    setMuted(next);
    try { localStorage.setItem(MUTE_KEY, next ? '1' : '0'); } catch { /* not remembered */ }
  };

  const filled = useMemo(() => names.map(cleanName).filter(Boolean), [names]);
  const canStart = filled.length >= MIN_PLAYERS;

  const draw = (k: TodKind): string => {
    if (decks.current[k].length === 0) decks.current[k] = shuffled(TOD_PROMPTS[k][level]);
    return decks.current[k].pop() ?? '';
  };

  const start = () => {
    if (!canStart) return;
    ensure();
    play('go');
    // Same name twice would make the scoreboard confusing: number duplicates.
    const seen = new Map<string, number>();
    const unique = filled.map(n => {
      const key = n.toLowerCase();
      const c = (seen.get(key) ?? 0) + 1;
      seen.set(key, c);
      return c > 1 ? `${n} ${c}` : n;
    });
    decks.current = { truth: shuffled(TOD_PROMPTS.truth[level]), dare: shuffled(TOD_PROMPTS.dare[level]) };
    setPlayers(unique);
    setStats(unique.map(() => ({ done: 0, skipped: 0, skipsLeft: SKIPS_PER_PLAYER })));
    setTurn(0);
    setRound(1);
    setPhase('pick');
  };

  const choose = (k: TodKind | 'random') => {
    const picked: TodKind = k === 'random' ? (Math.random() < 0.5 ? 'truth' : 'dare') : k;
    play('flip');
    setKind(picked);
    setPrompt(draw(picked));
    setPhase('card');
  };

  const nextTurn = () => {
    const n = (turn + 1) % players.length;
    if (n === 0) setRound(r => r + 1);
    setTurn(n);
    setPhase('pick');
  };

  const done = () => {
    play('good');
    setStats(s => s.map((x, i) => (i === turn ? { ...x, done: x.done + 1 } : x)));
    nextTurn();
  };

  const skip = () => {
    if (stats[turn]?.skipsLeft <= 0) return;
    play('miss');
    setStats(s => s.map((x, i) => (i === turn ? { ...x, skipped: x.skipped + 1, skipsLeft: x.skipsLeft - 1 } : x)));
    nextTurn();
  };

  const close = () => setPhase('idle');
  const again = () => { setPhase('setup'); };

  const setName = (i: number, v: string) => setNames(n => n.map((x, idx) => (idx === i ? v : x)));
  const addPlayer = () => { if (names.length < MAX_PLAYERS) { play('click'); setNames(n => [...n, '']); } };
  const removePlayer = (i: number) => { if (names.length > MIN_PLAYERS) { play('click'); setNames(n => n.filter((_, idx) => idx !== i)); } };

  const open = phase !== 'idle';
  const current = players[turn];
  const skipsLeft = stats[turn]?.skipsLeft ?? 0;

  return (
    <div className={className}>
      <GameTile
        onClick={() => { setPhase('setup'); }}
        compact={compact}
        thumb={thumb}
        Icon={Sparkle}
        accent="primary"
        title="Truth or Dare"
        subtitle="Pass the phone, if you dare"
        chip="New · Group game"
      />

      <Modal isOpen={open} onClose={close} ariaLabel="Truth or Dare group game" size="sm" flush fullScreen>
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
                <span className="inline-block text-[10px] font-bold uppercase tracking-[0.2em] text-[#F0CE7A] bg-gold/15 border border-gold/30 rounded-full px-3 py-1 mb-2">Group game · {MIN_PLAYERS} to {MAX_PLAYERS} players</span>
                <h2 className="font-display text-4xl font-extrabold text-white leading-tight">Truth or Dare</h2>
                <p className="text-sm text-cream/60 mt-1 mb-4 px-4">One phone, passed around. Pick truth or dare, read it out loud, and keep it fun.</p>

                <div className={`${glass} text-left p-3 mb-3`}>
                  <p className={`${eyebrow} mb-2`}>Players</p>
                  <ul className="space-y-2">
                    {names.map((n, i) => (
                      <li key={i} className="flex items-center gap-2">
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
                  {names.length < MAX_PLAYERS && (
                    <button type="button" onClick={addPlayer} className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-[#F0CE7A] hover:text-white transition-colors">
                      <Plus size={14} weight="bold" /> Add player
                    </button>
                  )}
                </div>

                <div className={`${glass} text-left p-3 mb-4`}>
                  <p className={`${eyebrow} mb-2`}>How brave are we?</p>
                  <div role="radiogroup" aria-label="Difficulty" className="grid grid-cols-3 gap-2">
                    {TOD_LEVELS.map(l => (
                      <button
                        key={l.id}
                        type="button"
                        role="radio"
                        aria-checked={level === l.id}
                        onClick={() => { play('click'); setLevel(l.id); }}
                        className={`rounded-xl px-2 py-2.5 text-center border transition active:scale-95 ${level === l.id ? 'bg-gradient-to-b from-primary-light to-primary border-transparent text-white shadow-[0_6px_16px_rgba(168,90,42,0.45)]' : 'bg-white/[0.07] border-white/15 text-cream/75 hover:bg-white/10'}`}
                      >
                        <span className="block font-display text-sm font-extrabold leading-tight">{l.label}</span>
                        <span className="block text-[10px] leading-tight mt-0.5 opacity-75">{l.blurb}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <button type="button" onClick={start} disabled={!canStart} className={`${primaryBtn} disabled:opacity-50 disabled:pointer-events-none`}>
                  <Play size={18} weight="fill" /> {canStart ? 'Start the game' : `Add at least ${MIN_PLAYERS} names`}
                </button>
                <p className="mt-3 text-[11px] text-cream/40 px-4">Everyone gets {SKIPS_PER_PLAYER} skips. Play kind: no one has to do anything that feels unsafe or uncomfortable.</p>
                <button type="button" onClick={toggleMute} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-cream/50 hover:text-cream transition-colors">
                  {muted ? <SpeakerSlash size={14} /> : <SpeakerHigh size={14} />} Sound {muted ? 'off' : 'on'}
                </button>
              </div>
            )}

            {phase === 'pick' && (
              <div className="relative text-center">
                <p className={eyebrow}>Round {round} · {TOD_LEVELS.find(l => l.id === level)?.label}</p>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${turn}-${round}`}
                    initial={reduce ? false : { opacity: 0, y: 16, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={reduce ? undefined : { opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="mt-3 mb-6"
                  >
                    <span className="block text-sm text-cream/60">It's your turn,</span>
                    <h2 className={`font-display text-5xl font-extrabold leading-tight break-words ${GOLD_GRAD_TEXT}`}>{current}</h2>
                    <p className="mt-2 text-sm text-cream/60">Pass the phone to {current}, then choose.</p>
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
                  <Sparkle size={18} weight="duotone" /> Surprise me
                </button>

                <div className="mt-5 flex items-center justify-between">
                  <button type="button" onClick={() => { play('click'); setPhase('summary'); }} className="inline-flex items-center gap-1.5 text-xs font-semibold text-cream/50 hover:text-cream transition-colors">
                    <Flag size={14} /> End game
                  </button>
                  <button type="button" onClick={toggleMute} className="inline-flex items-center gap-1.5 text-xs font-semibold text-cream/50 hover:text-cream transition-colors">
                    {muted ? <SpeakerSlash size={14} /> : <SpeakerHigh size={14} />} Sound {muted ? 'off' : 'on'}
                  </button>
                </div>
              </div>
            )}

            {phase === 'card' && (
              <div className="relative text-center">
                <p className={eyebrow}>{current} · {kind === 'truth' ? 'Truth' : 'Dare'}</p>
                <motion.div
                  key={prompt}
                  initial={reduce ? false : { opacity: 0, rotateX: -50, y: 20 }}
                  animate={{ opacity: 1, rotateX: 0, y: 0 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className={`mt-3 mb-6 rounded-3xl p-6 min-h-[16rem] flex flex-col items-center justify-center border ${kind === 'truth' ? 'bg-gradient-to-br from-[#F0CE7A]/20 to-gold/10 border-gold/40' : 'bg-gradient-to-br from-secondary/30 to-primary/20 border-primary/50'}`}
                >
                  <span className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ${kind === 'truth' ? 'bg-gradient-to-br from-[#F0CE7A] to-gold text-dark' : 'bg-gradient-to-br from-secondary to-primary text-white'}`} aria-hidden="true">
                    {kind === 'truth' ? <ChatCircleDots size={30} weight="duotone" /> : <Lightning size={30} weight="duotone" />}
                  </span>
                  <h2 className="sr-only">{kind === 'truth' ? 'Truth' : 'Dare'}</h2>
                  <p className="font-display text-2xl sm:text-[26px] font-bold leading-snug text-white" aria-live="polite">{prompt}</p>
                </motion.div>

                <div className="space-y-2.5">
                  <button type="button" onClick={done} className={primaryBtn}><Check size={18} weight="bold" /> Done</button>
                  <button type="button" onClick={skip} disabled={skipsLeft <= 0} className={ghostBtn}>
                    <SkipForward size={18} weight="fill" /> {skipsLeft > 0 ? `Skip (${skipsLeft} left)` : 'No skips left'}
                  </button>
                </div>
              </div>
            )}

            {phase === 'summary' && (
              <div className="relative text-center pt-3">
                <h2 className={`font-display text-4xl font-extrabold ${GOLD_GRAD_TEXT}`}>Good game!</h2>
                <p className="text-sm text-cream/60 mt-1 mb-4">{round > 1 || turn > 0 ? 'Here is how everyone did.' : 'No turns played yet.'}</p>
                <ul className={`${glass} divide-y divide-white/10 text-left mb-4`}>
                  {players.map((p, i) => (
                    <li key={p} className="flex items-center justify-between gap-3 px-3.5 py-3">
                      <span className="font-semibold text-white truncate">{p}</span>
                      <span className="shrink-0 text-xs text-cream/60">
                        <strong className="text-[#F0CE7A]">{stats[i]?.done ?? 0}</strong> done · {stats[i]?.skipped ?? 0} skipped
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="space-y-2.5">
                  <button type="button" onClick={again} className={primaryBtn}><ArrowCounterClockwise size={18} weight="bold" /> New game</button>
                  <button type="button" onClick={() => { play('click'); setPhase('pick'); }} className={ghostBtn}>Keep playing</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
