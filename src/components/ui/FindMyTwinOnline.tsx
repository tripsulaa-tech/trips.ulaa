import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Play, ArrowLeft, ArrowCounterClockwise, ShareNetwork, SpeakerHigh, SpeakerSlash, Trophy, X,
  Sparkle, Crown, CheckCircle, Copy, LockSimple, LockSimpleOpen, WifiSlash, Hash, Users, Question,
  ChatCircleDots, MagnifyingGlass, HandWaving, Heart, LockKey,
} from '@phosphor-icons/react';
import { SITE_HOST, SITE_ORIGIN } from '../../constants/site';
import { getWhatsAppLink } from '../../utils/utils-index';
import { WhatsAppIcon } from '../icons/WhatsAppIcon';
import { buildScoreCard } from './packBagScoreCard';
import { useSynth } from './gameAudio';
import { Confetti, CountUp } from './gameParts';
import {
  GOLD_GRAD_TEXT, primaryBtn, ghostBtn, iconBtn, glass, eyebrow, shareCardImage, cleanName,
  loadPlayerName, savePlayerName, MAX_NAME,
} from './gameUi';
import { QUESTIONS, getMaxRounds, MIN_PLAYERS, promptFor, encodeAnswers, matchTitle } from './findMyTwinEngine';
import {
  twin, TwinError, twinJoinLink, normalizeTwinCode, loadTwinSession, saveTwinSession, clearTwinSession,
} from './findMyTwinApi';
import type { TwinEdge, TwinPhase } from './findMyTwinApi';
import { useTwinRoom } from './useTwinRoom';
import { useTwinPromptsSync } from './useGameContentSync';

// "Find My Twin" online: every player uses their own phone. The matching and
// the secrets live in Supabase (see add_find_my_twin.sql); this file is only the
// screens. Everyone answers quick travel questions, the database secretly scores
// every pair, then each phone says "You + Ulaa, 92% match. Find Ulaa!".
// Once two twins find each other a conversation prompt unlocks; when every
// pair has talked, the next round unlocks with a new twin and a new prompt.

const MUTE_KEY = 'ulaa:packbag:muted'; // one sound setting for all the games

const inputCls = 'w-full rounded-xl bg-white/[0.07] border border-white/15 focus:border-[#F0CE7A]/70 focus:bg-white/10 px-3 py-2.5 text-[15px] font-semibold text-white placeholder:text-cream/30 outline-none transition-colors';

interface Audio {
  play: ReturnType<typeof useSynth>['play'];
  ensure: () => void;
  muted: boolean;
  toggleMute: () => void;
}

interface FindMyTwinOnlineProps {
  tripTitle: string;
  /** A code from a join link: opens the "Join" form with it filled in. */
  initialCode?: string;
  /** Leaves the online screens (back to the game's start screen). */
  onExit: () => void;
}

// ───────────────────────────── Entry: host or join ─────────────────────────────

export default function FindMyTwinOnline({ tripTitle, initialCode, onExit }: FindMyTwinOnlineProps) {
  useTwinPromptsSync();
  const [muted, setMuted] = useState<boolean>(() => {
    try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
  });
  const mutedRef = useRef(muted);
  const { ensure, play } = useSynth(mutedRef);
  const toggleMute = () => {
    const next = !muted;
    mutedRef.current = next;
    setMuted(next);
    try { localStorage.setItem(MUTE_KEY, next ? '1' : '0'); } catch { /* not remembered */ }
  };
  const audio: Audio = { play, ensure, muted, toggleMute };

  // Resume the saved room (unless a join link points somewhere else).
  const wanted = initialCode ? normalizeTwinCode(initialCode) : '';
  const [code, setCode] = useState<string | null>(() => {
    const saved = loadTwinSession();
    return saved && (!wanted || saved.code === wanted) ? saved.code : null;
  });
  const [view, setView] = useState<'menu' | 'host' | 'join'>(wanted && !code ? 'join' : 'menu');
  const [name, setName] = useState(loadPlayerName);
  const [joinCode, setJoinCode] = useState(wanted);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const enter = async (kind: 'host' | 'join') => {
    const clean = cleanName(name);
    if (!clean) { setError('Please type your name.'); return; }
    if (kind === 'join' && normalizeTwinCode(joinCode).length !== 4) { setError('Room codes have 4 letters or numbers.'); return; }
    ensure();
    setBusy(true);
    setError('');
    try {
      savePlayerName(clean);
      const res = kind === 'host'
        ? await twin.create(clean, tripTitle)
        : await twin.join(normalizeTwinCode(joinCode), clean);
      saveTwinSession(res.code);
      play('good');
      setCode(res.code);
    } catch (e) {
      setError(e instanceof TwinError ? e.message : 'Could not connect. Check your internet and try again.');
    } finally {
      setBusy(false);
    }
  };

  const leftRoom = () => { clearTwinSession(); setCode(null); setView('menu'); setJoinCode(''); };

  if (code) return <Room code={code} audio={audio} onLeft={leftRoom} onExit={onExit} />;

  return (
    <div className="relative text-center pt-3">
      <div className="w-16 h-16 mx-auto mb-3 rounded-[22px] bg-gradient-to-br from-[#F0CE7A] to-gold text-dark flex items-center justify-center shadow-[0_14px_36px_rgba(200,150,42,0.45)]" aria-hidden="true">
        <Users size={36} weight="duotone" />
      </div>
      <h2 className="font-display text-3xl font-extrabold text-white leading-tight">Find My Twin</h2>

      {view === 'menu' && (
        <>
          <p className="text-sm text-cream/60 mt-1 mb-4 px-4">Everyone uses their own phone and sits in the same room. Answer {QUESTIONS.length} quick travel questions, then go and find your travel twin.</p>
          <div className="space-y-2.5">
            <button type="button" onClick={() => { ensure(); setView('host'); }} className={primaryBtn}><Crown size={18} weight="fill" /> Host a room</button>
            <button type="button" onClick={() => { ensure(); setView('join'); }} className={ghostBtn}><Hash size={18} weight="bold" /> Join with a code</button>
          </div>
          <button type="button" onClick={onExit} className="mt-4 text-xs font-semibold text-cream/50 hover:text-cream transition-colors">Back</button>
        </>
      )}

      {view !== 'menu' && (
        <div className="text-left mt-3">
          {view === 'join' && (
            <>
              <label className={`${eyebrow} block mb-1.5`} htmlFor="twin-code">Room code</label>
              <input
                id="twin-code"
                value={joinCode}
                onChange={e => setJoinCode(normalizeTwinCode(e.target.value))}
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                maxLength={4}
                placeholder="KBR7"
                className={`${inputCls} text-center font-display text-3xl tracking-[0.35em] uppercase mb-3`}
              />
            </>
          )}
          <label className={`${eyebrow} block mb-1.5`} htmlFor="twin-name">Your name</label>
          <input
            id="twin-name"
            value={name}
            onChange={e => setName(e.target.value.slice(0, MAX_NAME))}
            onKeyDown={e => { if (e.key === 'Enter' && !busy) void enter(view); }}
            maxLength={MAX_NAME}
            autoComplete="given-name"
            placeholder="e.g. Ulaa"
            className={`${inputCls} mb-1`}
          />
          <p className="text-[11px] text-cream/40 mb-3">Use the name your friends know you by. They will be looking for it!</p>
          {error && <p role="alert" className="text-xs font-semibold text-rose-300 mb-2">{error}</p>}
          <button type="button" disabled={busy} onClick={() => void enter(view)} className={`${primaryBtn} disabled:opacity-60`}>
            {busy ? 'Connecting…' : view === 'host' ? <><Crown size={18} weight="fill" /> Create room</> : <><Play size={18} weight="fill" /> Join the game</>}
          </button>
          <button type="button" onClick={() => { setView('menu'); setError(''); }} className="mt-3 w-full text-xs font-semibold text-cream/50 hover:text-cream transition-colors">Back</button>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────── Small pieces ─────────────────────────────

/** Big match ring: "92%" counting up inside a gold arc. */
function MatchRing({ score, reduce, size = 'lg' }: { score: number; reduce: boolean; size?: 'lg' | 'sm' }) {
  const R = 74;
  const C = 2 * Math.PI * R;
  const frac = Math.max(0.04, Math.min(1, score / 100));
  const dim = size === 'lg' ? 'w-44 h-44' : 'w-16 h-16';
  return (
    <div className={`relative ${dim} mx-auto`}>
      {size === 'lg' && <span className="absolute inset-4 rounded-full bg-primary/35 blur-2xl" aria-hidden="true" />}
      <svg viewBox="0 0 190 190" className="relative w-full h-full -rotate-90" aria-hidden="true">
        <defs>
          <linearGradient id={`twin-grad-${size}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#D98A3A" />
            <stop offset="0.5" stopColor="#F0CE7A" />
            <stop offset="1" stopColor="#C8962A" />
          </linearGradient>
        </defs>
        <circle cx="95" cy="95" r={R} fill="rgba(250,247,242,0.04)" stroke="rgba(250,247,242,0.1)" strokeWidth="13" />
        <motion.circle
          cx="95" cy="95" r={R} fill="none" strokeWidth="13" strokeLinecap="round"
          stroke={`url(#twin-grad-${size})`} strokeDasharray={C}
          initial={{ strokeDashoffset: reduce ? C * (1 - frac) : C }}
          animate={{ strokeDashoffset: C * (1 - frac) }}
          transition={{ duration: reduce ? 0 : 1.2, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" aria-label={`${score} percent match`}>
        {size === 'lg' ? (
          <>
            <span className={`font-display text-5xl font-extrabold leading-none tabular-nums ${GOLD_GRAD_TEXT}`}><CountUp to={score} reduce={reduce} />%</span>
            <span className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-cream/60">Match</span>
          </>
        ) : (
          <span className={`font-display text-lg font-extrabold leading-none tabular-nums ${GOLD_GRAD_TEXT}`}>{score}%</span>
        )}
      </div>
    </div>
  );
}

function PlayerChips({ players, hostId, meId, canKick, onKick }: {
  players: Array<{ id: string; name: string; answered: boolean; away: boolean }>;
  hostId: string | null;
  meId: string;
  canKick: boolean;
  onKick: (id: string) => void;
}) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Players in the room">
      {players.map(p => (
        <li
          key={p.id}
          className={`inline-flex items-center gap-1 rounded-full pl-2.5 ${canKick && p.id !== meId ? 'pr-1' : 'pr-2.5'} py-1 text-[11px] font-bold border ${p.answered ? 'bg-emerald-400/15 border-emerald-300/40 text-emerald-200' : 'bg-white/[0.06] border-white/15 text-cream/60'} ${p.away ? 'opacity-50' : ''}`}
        >
          {p.id === hostId && <Crown size={11} weight="fill" className="text-[#F0CE7A]" aria-label="Host" />}
          {p.answered && <CheckCircle size={11} weight="fill" aria-label="Answered" />}
          <span className="max-w-[7rem] truncate">{p.name}{p.id === meId ? ' (you)' : ''}</span>
          {canKick && p.id !== meId && (
            <button type="button" onClick={() => onKick(p.id)} aria-label={`Remove ${p.name}`} className="w-5 h-5 rounded-full flex items-center justify-center text-cream/50 hover:text-white hover:bg-white/15 transition-colors">
              <X size={11} weight="bold" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

// ───────────────────────────── The questions ─────────────────────────────

function Quiz({ onSubmit, busy, play }: { onSubmit: (answers: string) => void; busy: boolean; play: Audio['play'] }) {
  const reduce = useReducedMotion();
  const [picks, setPicks] = useState<Array<0 | 1 | null>>(() => QUESTIONS.map(() => null));
  const [idx, setIdx] = useState(0);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const reviewing = idx >= QUESTIONS.length;
  const q = QUESTIONS[Math.min(idx, QUESTIONS.length - 1)];

  const choose = (v: 0 | 1) => {
    if (timer.current) window.clearTimeout(timer.current);
    setPicks(p => p.map((x, i) => (i === idx ? v : x)));
    play('flip');
    timer.current = window.setTimeout(() => setIdx(i => i + 1), reduce ? 0 : 260);
  };

  const finish = () => {
    if (picks.some(p => p === null)) return;
    onSubmit(encodeAnswers(picks as Array<0 | 1>));
  };

  return (
    <div className="text-center">
      <p className={eyebrow}>{reviewing ? 'All done' : `Question ${idx + 1} of ${QUESTIONS.length}`}</p>
      <div className="flex flex-wrap justify-center gap-1.5 mt-2 mb-4" aria-hidden="true">
        {QUESTIONS.map((_, i) => (
          <span key={i} className={`h-1.5 rounded-full transition-all ${QUESTIONS.length > 10 ? (i < idx ? 'w-4 bg-[#F0CE7A]' : i === idx ? 'w-6 bg-white' : 'w-4 bg-white/15') : (i < idx ? 'w-6 bg-[#F0CE7A]' : i === idx ? 'w-8 bg-white' : 'w-6 bg-white/15')}`} />
        ))}
      </div>

      <AnimatePresence mode="wait">
        {!reviewing ? (
          <motion.div
            key={q.id}
            initial={reduce ? false : { opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? undefined : { opacity: 0, x: -24 }}
            transition={{ duration: 0.18 }}
          >
            <h2 className="font-display text-3xl font-extrabold text-white leading-tight mb-4">
              {q.left.label} <span className="text-cream/40 text-2xl">or</span> {q.right.label}?
            </h2>
            <div className="grid gap-3">
              {([q.left, q.right] as const).map((o, i) => {
                const on = picks[idx] === i;
                return (
                  <button
                    key={o.label}
                    type="button"
                    aria-pressed={on}
                    onClick={() => choose(i as 0 | 1)}
                    className={`touch-manipulation rounded-3xl border px-4 py-5 flex items-center gap-4 text-left transition active:scale-[0.97] ${on ? 'bg-gradient-to-br from-primary-light to-primary border-transparent text-white shadow-[0_10px_26px_rgba(168,90,42,0.5)]' : 'bg-white/[0.06] border-white/10 text-cream hover:bg-white/10'}`}
                  >
                    <span className={`w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center border ${on ? 'bg-white/20 border-white/30 text-white' : 'bg-gradient-to-br from-[#F0CE7A] to-gold border-white/25 text-dark shadow-[0_6px_16px_rgba(200,150,42,0.4)]'}`} aria-hidden="true"><o.Icon size={30} weight="duotone" /></span>
                    <span className="font-display text-2xl font-extrabold leading-tight">{o.label}</span>
                  </button>
                );
              })}
            </div>
            {idx > 0 && (
              <button type="button" onClick={() => setIdx(i => i - 1)} className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-cream/50 hover:text-cream transition-colors">
                <ArrowLeft size={12} weight="bold" /> Previous question
              </button>
            )}
          </motion.div>
        ) : (
          <motion.div key="review" initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <h2 className="font-display text-3xl font-extrabold text-white leading-tight mb-1">Your travel style</h2>
            <p className="text-sm text-cream/60 mb-4">Lock it in and ULAA will quietly work out who your twin is.</p>
            <ul className="flex flex-wrap justify-center gap-2 mb-5">
              {QUESTIONS.map((qq, i) => {
                const o = picks[i] === 1 ? qq.right : qq.left;
                return (
                  <li key={qq.id}>
                    <button type="button" onClick={() => setIdx(i)} className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.07] border border-white/15 px-3 py-1.5 text-sm font-bold text-white hover:bg-white/15 transition-colors" aria-label={`${o.label}. Change answer`}>
                      <o.Icon size={16} weight="duotone" className="text-[#F0CE7A]" aria-hidden="true" /> {o.label}
                    </button>
                  </li>
                );
              })}
            </ul>
            <button type="button" disabled={busy} onClick={finish} className={`${primaryBtn} disabled:opacity-60`}>
              <LockKey size={18} weight="fill" /> {busy ? 'Locking in…' : 'Lock in my answers'}
            </button>
            <button type="button" onClick={() => setIdx(0)} className="mt-3 text-xs font-semibold text-cream/50 hover:text-cream transition-colors">Change an answer</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ───────────────────────────── One twin card (the hunt) ─────────────────────────────

function TwinCard({ edge, round, reduce, busy, onFound, onDone }: {
  edge: TwinEdge; round: number; reduce: boolean; busy: boolean; onFound: () => void; onDone: () => void;
}) {
  const bothFound = edge.me_found && edge.partner_found;
  const bothDone = edge.me_done && edge.partner_done;
  const first = edge.partner_name;

  if (bothDone) {
    return (
      <div className={`${glass} flex items-center gap-3 px-3 py-3 text-left`}>
        <div className="w-14 shrink-0"><MatchRing score={edge.score} reduce={reduce} size="sm" /></div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300"><CheckCircle size={11} weight="fill" className="inline -mt-0.5 mr-1" />Connected</p>
          <p className="font-display text-lg font-extrabold text-white leading-tight truncate">You + {first}</p>
        </div>
        <Heart size={22} weight="fill" className="text-[#F0CE7A] shrink-0" aria-hidden="true" />
      </div>
    );
  }

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, scale: 0.94, y: 14 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 220, damping: 20 }}
      className="rounded-3xl bg-gradient-to-b from-white/[0.09] to-white/[0.03] border border-gold/30 px-4 py-5 text-center shadow-[0_18px_40px_rgba(0,0,0,0.35)]"
    >
      {!bothFound && (
        <>
          <span className="inline-block text-[10px] font-bold uppercase tracking-[0.2em] text-[#F0CE7A] bg-gold/15 border border-gold/30 rounded-full px-3 py-1 mb-2">👯 Your travel twin</span>
          <h3 className="font-display text-3xl font-extrabold text-white leading-tight">You + <span className={GOLD_GRAD_TEXT}>{first}</span></h3>
          <div className="my-3"><MatchRing score={edge.score} reduce={reduce} /></div>
          <p className="font-display text-xl font-extrabold text-white">{edge.score}% Match <span aria-hidden="true">💗</span></p>
          <p className="text-xs text-cream/55 mb-4">{matchTitle(edge.score)}</p>

          <motion.div
            animate={reduce ? undefined : { scale: [1, 1.04, 1] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
            className="rounded-2xl bg-gradient-to-br from-primary/45 to-secondary/25 border border-gold/35 px-4 py-3 mb-4"
          >
            <p className="inline-flex items-center gap-1.5 font-display text-2xl font-extrabold text-white">
              <MagnifyingGlass size={22} weight="bold" className="text-[#F0CE7A]" aria-hidden="true" /> Find {first}!
            </p>
            <p className="text-xs text-cream/70 mt-0.5">Look around the room. They are looking for you too.</p>
          </motion.div>

          {!edge.me_found ? (
            <button type="button" disabled={busy} onClick={onFound} className={`${primaryBtn} disabled:opacity-60`}>
              <HandWaving size={18} weight="fill" /> I found {first}!
            </button>
          ) : (
            <p className="text-sm font-bold text-cream/70" role="status">
              <CheckCircle size={16} weight="fill" className="inline -mt-0.5 mr-1 text-emerald-300" />
              Waiting for {first} to tap "I found you" too…
            </p>
          )}
        </>
      )}

      {bothFound && (
        <>
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="w-16"><MatchRing score={edge.score} reduce={reduce} size="sm" /></div>
            <h3 className="font-display text-2xl font-extrabold text-white leading-tight text-left">You + <span className={GOLD_GRAD_TEXT}>{first}</span></h3>
          </div>
          <p className="text-sm font-bold text-emerald-300 mb-3"><CheckCircle size={16} weight="fill" className="inline -mt-0.5 mr-1" />You found each other!</p>

          <div className="rounded-2xl bg-gradient-to-br from-primary/45 to-secondary/25 border border-gold/35 px-4 py-4 mb-4 text-left">
            <p className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#F0CE7A]"><ChatCircleDots size={13} weight="fill" /> Ask each other</p>
            <p className="font-display text-xl font-extrabold text-white leading-snug mt-1">“{promptFor(round)}”</p>
          </div>

          {!edge.me_done ? (
            <button type="button" disabled={busy} onClick={onDone} className={`${primaryBtn} disabled:opacity-60`}>
              <CheckCircle size={18} weight="fill" /> We talked
            </button>
          ) : (
            <p className="text-sm font-bold text-cream/70" role="status">Waiting for {first} to finish the chat…</p>
          )}
          <p className="text-[11px] text-cream/40 mt-2">Both of you answer, then tap. It unlocks the next round for everyone.</p>
        </>
      )}
    </motion.div>
  );
}

// ───────────────────────────── The room ─────────────────────────────

function Room({ code, audio, onLeft, onExit }: { code: string; audio: Audio; onLeft: () => void; onExit: () => void }) {
  const reduce = !!useReducedMotion();
  const { play, ensure, muted, toggleMute } = audio;
  const { state, gone, offline, refresh } = useTwinRoom(code);

  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const cardBlobRef = useRef<Blob | null>(null);

  const room = state?.room ?? null;
  const me = state?.me ?? null;
  const players = useMemo(() => state?.players ?? [], [state]);
  const edges = useMemo(() => state?.edges ?? [], [state]);
  const meP = me ? players.find(p => p.id === me.id) : undefined;
  const isHost = !!room && !!me && room.host_id === me.id;
  const hostName = room?.host_id ? players.find(p => p.id === room.host_id)?.name ?? 'the host' : 'the host';
  const phase: TwinPhase | null = room?.phase ?? null;
  const history = useMemo(() => state?.history ?? [], [state]);

  const flash = useCallback((msg: string) => {
    setNotice(msg);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(''), 4000);
  }, []);
  useEffect(() => () => { if (noticeTimer.current) window.clearTimeout(noticeTimer.current); }, []);

  /** Runs one action, then refreshes. Blocks double taps and shows friendly errors. */
  const act = useCallback(async (fn: () => Promise<unknown>) => {
    if (busy) return;
    ensure();
    setBusy(true);
    try { await fn(); await refresh(); }
    catch (e) { flash(e instanceof TwinError ? e.message : 'Something went wrong. Please try again.'); await refresh(); }
    finally { setBusy(false); }
  }, [busy, ensure, refresh, flash]);

  // ── Sounds when the phase / round changes ──
  const roundNo = room?.round_no ?? 0;
  const prevKey = useRef<string | null>(null);
  useEffect(() => {
    if (!phase) return;
    const key = `${phase}-${roundNo}`;
    const was = prevKey.current;
    prevKey.current = key;
    if (!was || was === key) return;
    if (phase === 'hunt') play('go');
    else if (phase === 'roundEnd') play('gold');
    else if (phase === 'final') play('win');
  }, [phase, roundNo, play]);

  // A little chime when a twin taps "found" or "we talked".
  const progressKey = edges.map(e => `${+e.partner_found}${+e.partner_done}`).join('|');
  const prevProgress = useRef<string | null>(null);
  useEffect(() => {
    const was = prevProgress.current;
    prevProgress.current = progressKey;
    if (was !== null && was !== progressKey) play('good');
  }, [progressKey, play]);

  // ── Connections + the share card (built when the game ends) ──
  const best = useMemo(() => history.reduce<{ score: number; partner_name: string } | null>(
    (b, h) => (!b || h.score > b.score ? { score: h.score, partner_name: h.partner_name } : b), null), [history]);
  const myName = meP?.name ?? '';

  useEffect(() => {
    if (phase !== 'final' || !best) return;
    let cancelled = false;
    void buildScoreCard({
      score: best.score,
      stars: best.score >= 90 ? 3 : best.score >= 75 ? 2 : 1,
      title: `Travel twin: ${best.partner_name}`,
      tripTitle: room?.trip_title ?? 'Ulaa',
      host: SITE_HOST,
      best: best.score,
      isNewBest: false,
      eyebrow: 'FIND MY TWIN  ·  TRAVEL MATCH',
      unit: 'BEST MATCH',
      ringMax: 100,
      playerName: myName,
      tiles: [
        { v: String(history.length), l: 'CONNECTIONS' },
        { v: `${best.score}%`, l: 'BEST MATCH' },
        { v: String(roundNo), l: 'ROUNDS' },
      ],
    }).then(blob => {
      if (cancelled || !blob) return;
      cardBlobRef.current = blob;
      setPreviewUrl(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob); });
    });
    return () => { cancelled = true; };
  }, [phase, best, history.length, roundNo, myName, room?.trip_title]);
  useEffect(() => () => { setPreviewUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; }); }, []);

  const leave = async () => {
    if (phase && phase !== 'lobby' && !window.confirm('Leave this game? Your twin will be left waiting.')) return;
    try { if (phase === 'lobby') await twin.leave(code); } catch { /* leaving anyway */ }
    onLeft();
  };

  // ── Problems: room ended, or still loading ──
  if (gone) {
    return (
      <div className="relative text-center pt-8">
        <div className="w-16 h-16 mx-auto mb-3 rounded-[22px] bg-white/10 border border-white/15 text-cream/70 flex items-center justify-center" aria-hidden="true"><Question size={34} weight="bold" /></div>
        <h2 className="font-display text-2xl font-extrabold text-white">This room has ended</h2>
        <p className="text-sm text-cream/60 mt-1 mb-5 px-4">Rooms close a few hours after they open, or when the host removes you.</p>
        <button type="button" onClick={onLeft} className={primaryBtn}>Start or join another</button>
        <button type="button" onClick={onExit} className="mt-3 text-xs font-semibold text-cream/50 hover:text-cream transition-colors">Back</button>
      </div>
    );
  }
  if (!state || !room || !me) {
    return (
      <div className="relative text-center pt-16 pb-10" role="status">
        <p className="text-sm text-cream/60">{offline ? 'Cannot reach the game. Retrying…' : 'Joining room…'}</p>
        {offline && <button type="button" onClick={onLeft} className="mt-4 text-xs font-semibold text-cream/50 hover:text-cream transition-colors">Leave</button>}
      </div>
    );
  }

  // ── Derived for rendering ──
  const link = twinJoinLink(room.code);
  const shareText = `Find your travel twin with me on Ulaa! Room code ${room.code}. Tap to join: ${link}`;
  const answeredCount = players.filter(p => p.answered).length;
  const allAnswered = players.length >= MIN_PLAYERS && answeredCount === players.length;
  const progress = state.progress;
  const maxRounds = getMaxRounds();
  const isLast = room.round_no >= maxRounds;

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(shareText); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }
    catch { flash('Could not copy. Share the code instead.'); }
  };

  const hostBanner = !isHost && state.host_away && (
    <div className="rounded-2xl bg-rose-400/10 border border-rose-300/30 px-3 py-2.5 mb-3 text-left">
      <p className="text-xs text-rose-100"><WifiSlash size={13} weight="bold" className="inline -mt-0.5 mr-1" />{hostName} seems to be away.</p>
      <button type="button" onClick={() => void act(() => twin.claimHost(room.code))} className="mt-1.5 text-xs font-bold text-[#F0CE7A] hover:text-white transition-colors">Take over as host</button>
    </div>
  );

  const waiting = (text: string) => (
    <p className="text-center text-xs font-semibold text-cream/50 py-2" role="status">{text}</p>
  );

  // ───────────────────────────── Render ─────────────────────────────
  return (
    <div className="relative">
      {/* Top bar */}
      <div className="flex items-center gap-2 pr-12 mb-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/15 px-2.5 py-1 text-[11px] font-bold text-cream/80">
          <Hash size={12} weight="bold" /> <span className="font-display tracking-[0.2em] text-[#F0CE7A]">{room.code}</span>
        </span>
        {offline && <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-300"><WifiSlash size={13} weight="bold" /> Reconnecting…</span>}
        <span className="flex-1" />
        <button type="button" onClick={toggleMute} className={`${iconBtn} !w-8 !h-8`} aria-label={muted ? 'Turn sound on' : 'Turn sound off'}>
          {muted ? <SpeakerSlash size={14} /> : <SpeakerHigh size={14} />}
        </button>
      </div>

      {notice && <p role="alert" className="rounded-xl bg-rose-400/15 border border-rose-300/30 text-rose-100 text-xs font-semibold px-3 py-2 mb-3">{notice}</p>}
      {hostBanner}

      {/* ── Lobby: questions, then waiting ── */}
      {phase === 'lobby' && !meP?.answered && (
        <Quiz busy={busy} play={play} onSubmit={answers => void act(() => twin.submitAnswers(room.code, answers))} />
      )}

      {phase === 'lobby' && meP?.answered && (
        <div>
          <div className="text-center mb-3">
            <div className="w-14 h-14 mx-auto mb-2 rounded-[20px] bg-gradient-to-br from-emerald-300 to-emerald-500 text-emerald-950 flex items-center justify-center shadow-[0_10px_26px_rgba(16,185,129,0.35)]" aria-hidden="true">
              <LockKey size={30} weight="fill" />
            </div>
            <h2 className="font-display text-2xl font-extrabold text-white leading-tight">Answers locked in</h2>
            <p className="text-xs text-cream/60 mt-0.5">ULAA is keeping them secret. Wait for everyone, then the twins are revealed.</p>
          </div>

          <div className={`${glass} text-center py-4 mb-3`}>
            <p className={eyebrow}>Room code</p>
            <p className={`font-display text-5xl font-extrabold tracking-[0.3em] pl-[0.3em] leading-tight ${GOLD_GRAD_TEXT}`} aria-label={`Room code ${room.code.split('').join(' ')}`}>{room.code}</p>
            <p className="text-[11px] text-cream/50 mt-1">Friends open the link, or tap Join with code.</p>
            <div className="grid grid-cols-2 gap-2 mt-3 px-3">
              <a href={getWhatsAppLink('', shareText)} target="_blank" rel="noopener noreferrer" className={`${primaryBtn} !py-2.5 !text-sm`}>
                <WhatsAppIcon size={16} /> WhatsApp
              </a>
              <button type="button" onClick={() => void copyLink()} className={`${ghostBtn} !py-2.5 !text-sm`}>
                {copied ? <><CheckCircle size={16} weight="fill" /> Copied</> : <><Copy size={16} weight="bold" /> Copy link</>}
              </button>
            </div>
          </div>

          <div className={`${glass} px-3 py-3 mb-3`}>
            <div className="flex items-center justify-between mb-2">
              <p className={eyebrow}>In the room · {answeredCount}/{players.length} answered</p>
              {isHost && (
                <button type="button" onClick={() => void act(() => twin.setLocked(room.code, !room.locked))} className="inline-flex items-center gap-1 text-[11px] font-bold text-cream/60 hover:text-white transition-colors" aria-pressed={room.locked}>
                  {room.locked ? <><LockSimple size={12} weight="fill" /> Locked</> : <><LockSimpleOpen size={12} weight="bold" /> Lock room</>}
                </button>
              )}
            </div>
            <PlayerChips players={players} hostId={room.host_id} meId={me.id} canKick={isHost} onKick={id => void act(() => twin.kick(room.code, id))} />
          </div>

          {isHost ? (
            <>
              <button
                type="button"
                disabled={!allAnswered || busy}
                onClick={() => void act(() => twin.start(room.code))}
                className={`${primaryBtn} disabled:opacity-40 disabled:pointer-events-none`}
              >
                <Sparkle size={18} weight="fill" /> Reveal the twins
              </button>
              {!allAnswered && waiting(players.length < MIN_PLAYERS ? 'Waiting for at least one more player…' : `Waiting for ${players.length - answeredCount} more to answer…`)}
            </>
          ) : waiting(`Waiting for ${hostName} to reveal the twins…`)}

          <div className="flex items-center justify-between mt-2">
            <button type="button" onClick={() => void act(() => twin.retake(room.code))} className="text-xs font-semibold text-cream/50 hover:text-cream transition-colors">Change my answers</button>
            <button type="button" onClick={() => void leave()} className="text-xs font-semibold text-cream/50 hover:text-cream transition-colors">Leave room</button>
          </div>
        </div>
      )}

      {phase === 'lobby' && !meP?.answered && (
        <button type="button" onClick={() => void leave()} className="mt-5 w-full text-xs font-semibold text-cream/50 hover:text-cream transition-colors">Leave room</button>
      )}

      {/* ── The hunt ── */}
      {phase === 'hunt' && (
        <div>
          <div className="flex items-end justify-between mb-3">
            <div>
              <p className={eyebrow}>Round {room.round_no} of {maxRounds}</p>
              <h2 className="font-display text-2xl font-extrabold text-white leading-tight">{edges.length > 0 ? 'Go find your twin' : 'Sit tight'}</h2>
            </div>
            <span className="inline-flex items-center rounded-full bg-white/10 border border-white/15 px-2.5 py-1 text-[11px] font-bold text-cream/80 tabular-nums">
              {progress.done}/{progress.total} connected
            </span>
          </div>

          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mb-4" aria-hidden="true">
            <div className="h-full rounded-full bg-gradient-to-r from-secondary to-[#F0CE7A] transition-all duration-500" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
          </div>

          {edges.length === 0 ? (
            <div className={`${glass} text-center px-4 py-6`}>
              <p className="font-display text-lg font-extrabold text-white">No new twin for you this round</p>
              <p className="text-xs text-cream/60 mt-1">You have met everyone who fits. Cheer on the others, the next round comes soon.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {edges.map(e => (
                <TwinCard
                  key={e.id}
                  edge={e}
                  round={room.round_no}
                  reduce={reduce}
                  busy={busy}
                  onFound={() => void act(() => twin.found(room.code, e.id))}
                  onDone={() => void act(() => twin.done(room.code, e.id))}
                />
              ))}
            </div>
          )}

          {isHost && progress.done < progress.total && (
            <button
              type="button"
              onClick={() => { if (window.confirm('Skip the pairs that are still looking for each other?')) void act(() => twin.skipPending(room.code)); }}
              className="mt-4 w-full text-xs font-semibold text-cream/50 hover:text-cream transition-colors"
            >
              Someone missing? Skip unfinished pairs
            </button>
          )}
          <button type="button" onClick={() => void leave()} className="mt-2 w-full text-xs font-semibold text-cream/40 hover:text-cream transition-colors">Leave game</button>
        </div>
      )}

      {/* ── Round complete ── */}
      {phase === 'roundEnd' && (
        <div className="relative text-center pt-2">
          {!reduce && <Confetti />}
          <span className="inline-block text-[10px] font-bold uppercase tracking-[0.2em] text-[#F0CE7A] bg-gold/15 border border-gold/30 rounded-full px-3 py-1 mb-2">Round {room.round_no} complete</span>
          <h2 className={`font-display text-3xl font-extrabold leading-tight ${GOLD_GRAD_TEXT}`}>Everyone found their twin!</h2>
          <p className="text-sm text-cream/60 mt-1 mb-4">{progress.total} new connection{progress.total === 1 ? '' : 's'} made in this room.</p>

          {edges.length > 0 && (
            <ul className={`${glass} text-left divide-y divide-white/10 mb-4`}>
              {edges.map(e => (
                <li key={e.id} className="flex items-center gap-3 px-3 py-2.5">
                  <Heart size={18} weight="fill" className="text-[#F0CE7A] shrink-0" aria-hidden="true" />
                  <span className="flex-1 min-w-0 text-sm font-bold text-white truncate">{e.partner_name}</span>
                  <span className="font-display text-lg font-extrabold text-[#F0CE7A] tabular-nums">{e.score}%</span>
                </li>
              ))}
            </ul>
          )}

          <div className="rounded-2xl bg-gradient-to-br from-primary/40 to-secondary/25 border border-gold/30 px-3.5 py-3 mb-4 text-left">
            <p className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#F0CE7A]"><LockSimpleOpen size={11} weight="fill" /> Unlocked</p>
            <p className="text-sm font-bold text-white mt-0.5">{isLast ? 'The wrap-up: your whole twin story.' : `Round ${room.round_no + 1}: a new twin and a new question.`}</p>
          </div>

          <button type="button" disabled={busy} onClick={() => void act(() => twin.nextRound(room.code, room.round_no))} className={`${primaryBtn} mb-2.5 disabled:opacity-60`}>
            <Play size={18} weight="fill" /> {isLast ? 'See the wrap-up' : `Unlock round ${room.round_no + 1}`}
          </button>
          {isHost && !isLast && (
            <button type="button" onClick={() => void act(() => twin.endGame(room.code))} className={ghostBtn}><Trophy size={16} weight="fill" /> End game here</button>
          )}
        </div>
      )}

      {/* ── Wrap-up ── */}
      {phase === 'final' && (
        <div className="relative text-center pt-1">
          {!reduce && <Confetti />}
          <span className="inline-block text-[10px] font-bold uppercase tracking-[0.2em] text-[#F0CE7A] bg-gold/15 border border-gold/30 rounded-full px-3 py-1 mb-2">{roundNo} round{roundNo === 1 ? '' : 's'} played</span>
          <div className="w-16 h-16 mx-auto mb-2 rounded-[22px] bg-gradient-to-br from-[#F0CE7A] to-gold text-dark flex items-center justify-center shadow-[0_12px_30px_rgba(200,150,42,0.45)]" aria-hidden="true">
            <Heart size={36} weight="fill" />
          </div>
          {best ? (
            <>
              <p className={eyebrow}>Your best twin</p>
              <p className={`font-display text-4xl font-extrabold leading-tight ${GOLD_GRAD_TEXT}`}>{best.partner_name}</p>
              <p className="text-sm text-cream/60 mb-3">{best.score}% match · {history.length} new connection{history.length === 1 ? '' : 's'}</p>
            </>
          ) : (
            <p className="font-display text-2xl font-extrabold text-white mb-3">Thanks for playing!</p>
          )}

          {history.length > 0 && (
            <ul className={`${glass} text-left divide-y divide-white/10 mb-3`}>
              {history.map((h, i) => (
                <li key={`${h.round}-${i}`} className="flex items-center gap-3 px-3 py-2">
                  <span className="w-12 shrink-0 text-[10px] font-bold uppercase tracking-wider text-cream/45">Round {h.round}</span>
                  <span className="flex-1 min-w-0 text-sm font-bold text-white truncate">{h.partner_name}</span>
                  <span className="font-display text-lg font-extrabold text-[#F0CE7A] tabular-nums">{h.score}%</span>
                </li>
              ))}
            </ul>
          )}

          {state.all_pairs.length > 0 && (
            <div className={`${glass} text-left px-3 py-3 mb-3`}>
              <p className={`${eyebrow} mb-1.5`}>Best matches in the room</p>
              <ol className="space-y-1">
                {state.all_pairs.slice(0, 5).map((p, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-cream/80">
                    <span className="flex-1 min-w-0 truncate"><strong className="text-white">{p.a_name}</strong> + <strong className="text-white">{p.b_name}</strong></span>
                    <span className="font-display font-extrabold text-[#F0CE7A] tabular-nums">{p.score}%</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {best && (
            <button
              type="button"
              onClick={async () => {
                setSharing(true);
                const text = `I matched ${best.score}% with ${best.partner_name} on Ulaa's Find My Twin! Try it: ${SITE_ORIGIN}/games`;
                await shareCardImage(cardBlobRef.current, { filename: 'ulaa-find-my-twin.png', title: 'Find My Twin', text, fallbackLink: getWhatsAppLink('', text) });
                setSharing(false);
              }}
              disabled={sharing}
              className={`${glass} group w-full flex items-center gap-3 p-2.5 text-left hover:bg-white/10 transition-colors disabled:opacity-70 mb-3`}
            >
              <span className="relative w-14 shrink-0 aspect-[4/5] rounded-lg overflow-hidden bg-white/10 border border-white/15">
                {previewUrl
                  ? <img src={previewUrl} alt="Your result card" className="absolute inset-0 w-full h-full object-cover" />
                  : <span className="absolute inset-0 animate-pulse bg-white/10" aria-hidden="true" />}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold text-white">{sharing ? 'Preparing…' : 'Share your twin card'}</span>
                <span className="block text-xs text-cream/55">Post it in the group chat.</span>
              </span>
              <span className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-b from-primary-light to-primary text-white flex items-center justify-center group-hover:scale-105 transition-transform" aria-hidden="true">
                <ShareNetwork size={18} weight="bold" />
              </span>
            </button>
          )}

          {isHost ? (
            <button type="button" onClick={() => void act(() => twin.toLobby(room.code))} className={`${primaryBtn} mb-2.5`}>
              <ArrowCounterClockwise size={18} weight="bold" /> Play again, same room
            </button>
          ) : waiting(`${hostName} can start another game.`)}
          <button type="button" onClick={onLeft} className={ghostBtn}>Leave room</button>
        </div>
      )}
    </div>
  );
}
