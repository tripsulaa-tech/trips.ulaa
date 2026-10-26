import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Play, ArrowRight, ArrowCounterClockwise, ShareNetwork, SpeakerHigh, SpeakerSlash, Vibrate, Trophy, Plus, Minus, X,
  Ticket, Airplane, Eye, EyeSlash, Crown, Skull, CheckCircle, XCircle, MagicWand,
  Gift, Question, Copy, LockSimple, LockSimpleOpen, WifiSlash, DeviceMobile, Hash, UsersThree, ChatCircleDots,
  CaretRight, Check, ArrowLeft,
} from '@phosphor-icons/react';
import { SITE_HOST } from '../../constants/site';
import SpecialList from './YaaruAvanSpecialList';
import YaaruAvanRules from './YaaruAvanRules';
import { getWhatsAppLink } from '../../utils/utils-index';
import { WhatsAppIcon } from '../icons/WhatsAppIcon';
import { buildScoreCard } from './packBagScoreCard';
import { useSynth } from './gameAudio';
import { haptic, hapticsEnabled, setHapticsEnabled } from './haptics';
import { Confetti } from './gameParts';
import {
  GOLD_GRAD_TEXT, primaryBtn as basePrimaryBtn, ghostBtn as baseGhostBtn, iconBtn as baseIconBtn, glass as baseGlass, eyebrow, shareCardImage, cleanName,
  loadPlayerName, savePlayerName, MAX_NAME,
} from './gameUi';
import { LEVELS, CATEGORY_LABEL } from './yaaruAvanWords';
import type { Category, Level } from './yaaruAvanWords';
import {
  MIN_PLAYERS, MAX_PLAYERS, POINTS, maxPickpockets, rolesValid, recommendedRoles, clampRoles, computeAwards,
  drawDare,
} from './yaaruAvanEngine';
import type { PlayerStats, Role } from './yaaruAvanEngine';
import {
  online, OnlineError, joinLink, normalizeCode, loadOnlineSession, saveOnlineSession, clearOnlineSession,
} from './yaaruAvanRoomApi';
import type { OnlinePhase } from './yaaruAvanRoomApi';
import { describeSpecial, specialDisplayName, SPECIALS, maxSpecials, roleLocked } from './yaaruAvanSpecials';
import type { SpecialId } from './yaaruAvanSpecials';
import { useOnlineRoom } from './useOnlineRoom';
import { useYaaruAvanContentSync } from './useGameContentSync';

// Same corner radius as the buttons on the admin pages (rounded-md). Local to this game, so other games keep theirs.
const primaryBtn = basePrimaryBtn.replace('rounded-2xl', 'rounded-md');
const ghostBtn = baseGhostBtn.replace('rounded-2xl', 'rounded-md');
const glass = baseGlass.replace('rounded-2xl', 'rounded-lg');
const iconBtn = baseIconBtn.replace('rounded-full', 'rounded-md');

// "Yaaru Avan?" online: every player uses their own phone. The rules and secrets
// live in Supabase (see add_yaaru_avan_online.sql); this file is only the screens.
// The group talks it out aloud (in person or on a call). The phone handles the
// secret word, private voting and the scores.

const MUTE_KEY = 'ulaa:packbag:muted'; // one sound setting for all the games

const ROLE_LABEL: Record<Role, string> = { tourist: 'Tourist', stranger: 'Stranger', pickpocket: 'Pickpocket' };
const ROLE_TONE: Record<Role, string> = {
  tourist: 'from-emerald-300 to-emerald-500 text-emerald-950',
  stranger: 'from-gold-300 to-gold text-dark',
  pickpocket: 'from-rose-300 to-rose-500 text-rose-950',
};

const inputCls = 'w-full rounded-lg bg-white/[0.07] border border-white/15 focus:border-gold-300/70 focus:bg-white/10 px-3 py-2.5 text-[15px] font-semibold text-white placeholder:text-cream/55 outline-none transition-colors';
const stepBtn = 'w-9 h-9 rounded-md bg-white/10 border border-white/15 text-cream flex items-center justify-center hover:bg-white/15 active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition';

interface Audio {
  play: ReturnType<typeof useSynth>['play'];
  ensure: () => void;
  muted: boolean;
  toggleMute: () => void;
  hapticsOn: boolean;
  toggleHaptics: () => void;
}

interface YaaruAvanOnlineProps {
  tripTitle: string;
  /** A code from a join link: opens the "Join" form with it filled in. */
  initialCode?: string;
  /** Leaves the online screens (back to the game's start screen). */
  onExit: () => void;
}

// ───────────────────────────── Entry: host or join ─────────────────────────────

export default function YaaruAvanOnline({ tripTitle, initialCode, onExit }: YaaruAvanOnlineProps) {
  useYaaruAvanContentSync();
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
  const [hapticsOn, setHapticsOn] = useState<boolean>(() => hapticsEnabled());
  const toggleHaptics = () => {
    const next = !hapticsOn;
    setHapticsEnabled(next);
    const effective = hapticsEnabled();
    setHapticsOn(effective);
    if (effective) haptic('success');
  };
  const audio: Audio = { play, ensure, muted, toggleMute, hapticsOn, toggleHaptics };

  // Resume the saved room (unless a join link points somewhere else).
  const wanted = initialCode ? normalizeCode(initialCode) : '';
  const [code, setCode] = useState<string | null>(() => {
    const saved = loadOnlineSession();
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
    if (kind === 'join' && normalizeCode(joinCode).length !== 4) { setError('Room codes have 4 letters or numbers.'); return; }
    ensure();
    setBusy(true);
    setError('');
    try {
      savePlayerName(clean);
      const res = kind === 'host'
        ? await online.create(clean, tripTitle)
        : await online.join(normalizeCode(joinCode), clean);
      saveOnlineSession(res.code);
      play('good');
      setCode(res.code);
    } catch (e) {
      setError(e instanceof OnlineError ? e.message : 'Could not connect. Check your internet and try again.');
    } finally {
      setBusy(false);
    }
  };

  const leftRoom = () => { clearOnlineSession(); setCode(null); setView('menu'); setJoinCode(''); };

  if (code) return <Room code={code} audio={audio} onLeft={leftRoom} onExit={onExit} />;

  return (
    <div className="relative text-center pt-3">
      <div className="w-16 h-16 mx-auto mb-3 rounded-[22px] bg-gradient-to-br from-secondary to-primary text-white flex items-center justify-center shadow-[0_14px_36px_rgba(168,90,42,0.5)]" aria-hidden="true">
        <DeviceMobile size={36} weight="duotone" />
      </div>
      <h2 className="font-display text-3xl font-extrabold text-white leading-tight">Play online</h2>

      {view === 'menu' && (
        <>
          <p className="text-sm text-cream/60 mt-1 mb-4 px-4">Everyone uses their own phone. Talk it out aloud, in person or on a call. Your word stays private on your screen.</p>
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
              <label className={`${eyebrow} block mb-1.5`} htmlFor="yaaru-avan-code">Room code</label>
              <input
                id="yaaru-avan-code"
                value={joinCode}
                onChange={e => setJoinCode(normalizeCode(e.target.value))}
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
          <label className={`${eyebrow} block mb-1.5`} htmlFor="yaaru-avan-name">Your name</label>
          <input
            id="yaaru-avan-name"
            value={name}
            onChange={e => setName(e.target.value.slice(0, MAX_NAME))}
            onKeyDown={e => { if (e.key === 'Enter' && !busy) void enter(view); }}
            maxLength={MAX_NAME}
            autoComplete="given-name"
            placeholder="e.g. Ulaa"
            className={`${inputCls} mb-3`}
          />
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

// ───────────────────────────── Small shared pieces ─────────────────────────────

function BoardingPass({ name, seat, word, tripTitle, holding, special }: {
  name: string; seat: string | null; word: string | null; tripTitle: string; holding: boolean;
  special?: { label: string; text: string } | null;
}) {
  return (
    <div className="mx-auto max-w-[19rem] select-none">
      <div className="rounded-lg bg-gradient-to-br from-[#FFF6DD] to-gold-300 text-dark shadow-[0_18px_40px_rgba(0,0,0,0.45)] overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <span className="font-display text-sm font-extrabold tracking-wider text-primary-dark">ULAA AIR</span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-dark/70">{tripTitle.length > 20 ? `${tripTitle.slice(0, 19)}…` : tripTitle}</span>
        </div>
        <div className="px-4 pb-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-dark/70">Passenger</p>
          <p className="font-display text-xl font-extrabold leading-tight">{name}</p>
        </div>
        <div className="relative border-t-2 border-dashed border-dark/25 px-4 py-4 bg-white/40 text-center min-h-[7.5rem] flex flex-col items-center justify-center">
          <span className="absolute -left-3 -top-3 w-6 h-6 rounded-full bg-footer" aria-hidden="true" />
          <span className="absolute -right-3 -top-3 w-6 h-6 rounded-full bg-footer" aria-hidden="true" />
          <AnimatePresence mode="wait">
            {holding ? (
              <motion.div key="word" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-dark/70">Your destination</p>
                {word
                  ? <p className="font-display text-3xl font-extrabold text-primary-dark leading-tight break-words">{word}</p>
                  : <>
                      <p className="font-display text-3xl font-extrabold text-rose-700 leading-tight">No destination</p>
                      <p className="text-sm font-bold text-dark/70 mt-1">Blend in.</p>
                    </>}
                {special && (
                  <div className="mt-3 pt-3 border-t border-dark/15">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-dark/70">Special role</p>
                    <p className="font-display text-lg font-extrabold text-primary-dark leading-tight">{special.label}</p>
                    <p className="text-xs font-semibold text-dark/70 leading-snug mt-0.5">{special.text}</p>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div key="hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-1 text-dark/70">
                <EyeSlash size={28} weight="duotone" />
                <p className="text-sm font-bold">Hidden</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="flex items-center justify-between px-4 py-2.5 bg-dark/90 text-cream">
          <span className="text-[10px] font-bold uppercase tracking-widest text-cream/60">Seat</span>
          <span className="font-display text-lg font-extrabold text-gold-300 tabular-nums">{seat ?? '-'}</span>
        </div>
      </div>
    </div>
  );
}

function HoldButton({ holding, onChange, label = 'Hold to reveal', className = '' }: {
  holding: boolean; onChange: (v: boolean) => void; label?: string; className?: string;
}) {
  return (
    <button
      type="button"
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); onChange(true); }}
      onPointerUp={() => onChange(false)}
      onPointerCancel={() => onChange(false)}
      onContextMenu={e => e.preventDefault()}
      onKeyDown={e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) onChange(true); }}
      onKeyUp={e => { if (e.key === ' ' || e.key === 'Enter') onChange(false); }}
      className={`${ghostBtn} touch-none select-none ${holding ? '!bg-white/25' : ''} ${className}`}
    >
      <Eye size={18} weight="duotone" /> {holding ? 'Release to hide' : label}
    </button>
  );
}

function Toggle({ on, onChange, title, desc, disabled }: {
  on: boolean; onChange: (v: boolean) => void; title: string; desc: string; disabled?: boolean;
}) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left disabled:opacity-70">
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold text-white leading-tight">{title}</span>
        <span className="block text-[11px] text-cream/50">{desc}</span>
      </span>
      <span className={`relative w-10 h-6 rounded-full transition-colors ${on ? 'bg-primary' : 'bg-white/15'}`} aria-hidden="true">
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${on ? 'left-[1.15rem]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

// ───────────────────────────── Special roles picker ─────────────────────────────

const ALL_SPECIAL_IDS: readonly SpecialId[] = SPECIALS.map(d => d.id);


/** The ids the host has ticked: none while the switch is off, all when no list was saved. */
const pickedSpecials = (room: { specials: boolean; special_ids: SpecialId[] | null }): SpecialId[] =>
  !room.specials ? [] : room.special_ids ? ALL_SPECIAL_IDS.filter(id => room.special_ids!.includes(id)) : [...ALL_SPECIAL_IDS];

function SpecialPicker({ initial, players, strangers, busy, onSave, onCancel }: {
  initial: SpecialId[]; players: number; strangers: number; busy: boolean;
  onSave: (ids: SpecialId[]) => void; onCancel: () => void;
}) {
  const [draft, setDraft] = useState<SpecialId[]>(initial);
  const on = new Set(draft);
  const toggle = (id: SpecialId) => setDraft(ALL_SPECIAL_IDS.filter(x => (x === id ? !on.has(x) : on.has(x))));
  const slots = maxSpecials(players);
  const readyCount = draft.filter(id => !roleLocked(id, players, strangers)).length;

  return (
    <div className="text-left">
      <button type="button" onClick={onCancel} className="inline-flex items-center gap-1 text-xs font-semibold text-cream/60 hover:text-white mb-2 transition-colors">
        <ArrowLeft size={14} weight="bold" /> Back
      </button>
      <h3 className="font-display text-2xl font-extrabold text-white leading-tight">Special roles</h3>
      <p className="text-xs text-cream/60 mt-1 mb-3">
        Tick the ones you want in play. Each round, up to one special per 3 players is dealt from your ticked list
        {players >= 3 ? ` (${slots} with ${players} players)` : ''}. Duelists and Lovers use two players.
      </p>

      <SpecialList on={on} onToggle={toggle} onSetAll={ids => setDraft(ALL_SPECIAL_IDS.filter(x => ids.includes(x)))} players={players} strangers={strangers} />

      <button type="button" disabled={busy} onClick={() => onSave(draft)} className={`${primaryBtn} disabled:opacity-60`}>
        <Check size={18} weight="bold" /> {readyCount === 0 ? 'Done (no special roles)' : `Done (${readyCount} ticked)`}
      </button>
    </div>
  );
}

// ───────────────────────────── The room ─────────────────────────────

/** The Pickpocket's typed guess: one box per word of the Tourists' word (1 word = 1 box, 2 words = 2 boxes). */
function WordBoxes({ count, busy, onSend }: { count: number; busy: boolean; onSend: (text: string) => void }) {
  const n = Math.max(1, Math.min(count || 1, 6));
  const [vals, setVals] = useState<string[]>(() => Array(n).fill(''));
  const filled = vals.every(v => v.trim().length > 0);
  const send = () => { if (filled && !busy) onSend(vals.map(v => v.trim()).join(' ').slice(0, 40)); };
  return (
    <form onSubmit={e => { e.preventDefault(); send(); }}>
      <div className="space-y-2 mb-3">
        {vals.map((v, i) => (
          <input key={i} value={v} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={30}
            onChange={e => setVals(prev => prev.map((x, k) => (k === i ? e.target.value : x)))}
            placeholder={n > 1 ? `Word ${i + 1}` : 'Type your guess'} aria-label={n > 1 ? `Word ${i + 1} of ${n}` : 'Your guess'}
            className={`${inputCls} text-center`} />
        ))}
      </div>
      <button type="submit" disabled={!filled || busy} className={`${primaryBtn} disabled:opacity-40 disabled:pointer-events-none`}>Send my guess</button>
    </form>
  );
}

function Room({ code, audio, onLeft, onExit }: { code: string; audio: Audio; onLeft: () => void; onExit: () => void }) {
  const reduce = useReducedMotion();
  const { play, ensure, muted, toggleMute, hapticsOn, toggleHaptics } = audio;
  const { state, problem, offline, refresh } = useOnlineRoom(code);

  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [holding, setHolding] = useState(false);
  const [seenRound, setSeenRound] = useState(0);
  const [pick, setPick] = useState<{ key: string; id: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [pickingSpecials, setPickingSpecials] = useState(false);
  // The Sniper's shot: whether the target list is open, and who is lined up (nothing fires until "Fire").
  const [sniperOpen, setSniperOpen] = useState(false);
  const [sniperPick, setSniperPick] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [sittingOut, setSittingOut] = useState<{ name: string; points: number }[]>([]);
  const noticeTimer = useRef<number | null>(null);

  const room = state?.room ?? null;
  const me = state?.me ?? null;
  const players = useMemo(() => state?.players ?? [], [state]);
  const byId = useMemo(() => new Map(players.map(p => [p.id, p])), [players]);
  const meP = me ? byId.get(me.id) : undefined;
  const isHost = !!room && !!me && room.host_id === me.id;
  const hostName = room?.host_id ? byId.get(room.host_id)?.name ?? 'the host' : 'the host';
  const phase: OnlinePhase | null = room?.phase ?? null;

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
    catch (e) { flash(e instanceof OnlineError ? e.message : 'Something went wrong. Please try again.'); }
    finally { setBusy(false); }
  }, [busy, ensure, refresh, flash]);

  // ── Players removed earlier in this game (they keep their points and can rejoin by name) ──
  const playerCount = players.length;
  useEffect(() => {
    if (phase !== 'lobby') return;
    let cancelled = false;
    online.benched(code).then(list => { if (!cancelled) setSittingOut(Array.isArray(list) ? list : []); }).catch(() => { if (!cancelled) setSittingOut([]); });
    return () => { cancelled = true; };
  }, [phase, code, playerCount]);

  // ── Sounds when the phase changes ──
  const prevPhase = useRef<OnlinePhase | null>(null);
  const outcome = room?.outcome ?? null;
  useEffect(() => {
    if (!phase) return;
    const was = prevPhase.current;
    prevPhase.current = phase;
    if (!was || was === phase) return;
    if (phase === 'describe') play('go');
    else if (phase === 'vote' || phase === 'tiebreak') play('flip');
    else if (phase === 'offboard') play('power');
    else if (phase === 'guess') play('bad');
    else if (phase === 'revenger') play('power');
    else if (phase === 'roundEnd') play(outcome === 'tourists' ? 'win' : 'gold');
    else if (phase === 'final') play('win');
    haptic(phase === 'offboard' ? 'end' : 'tick');
  }, [phase, outcome, play]);

  // ── After the offboard reveal, any phone nudges the game on (first one wins) ──
  useEffect(() => {
    if (phase !== 'offboard') return;
    const call = () => { void online.afterReveal(code).then(refresh).catch(() => undefined); };
    let repeat: number | undefined;
    const first = window.setTimeout(() => { call(); repeat = window.setInterval(() => { if (document.visibilityState === 'visible') call(); }, 5000); }, 4300);
    return () => { window.clearTimeout(first); if (repeat) window.clearInterval(repeat); };
  }, [phase, code, refresh]);

  // Any phone may expire a missed decision or advance the public return reveal.
  useEffect(() => {
    if (phase !== 'retrieve' && phase !== 'retrieved') return;
    const call = () => { void online.advanceRetrieval(code).then(refresh).catch(() => undefined); };
    call();
    const timer = window.setInterval(call, 2000);
    return () => window.clearInterval(timer);
  }, [phase, code, refresh]);

  // ── Things that need the word and role ──
  const seen = !!room && seenRound === room.round_no;
  const names = useMemo(() => players.map(p => p.name), [players]);

  const stats = useMemo(() => {
    const out: Record<string, PlayerStats> = {};
    players.forEach(p => {
      out[p.name] = { points: p.points, survivedAsStranger: p.survived, correctVotes: p.correct_votes, wrongVotes: p.wrong_votes, pickpocketWins: p.pickpocket_wins };
    });
    return out;
  }, [players]);
  const ranking = useMemo(() => [...players].sort((a, b) => b.points - a.points), [players]);
  const awards = useMemo(() => computeAwards(names, stats), [names, stats]);

  // ── Leaving ──
  const leave = async () => {
    if (phase && phase !== 'lobby' && !window.confirm('Leave this game? You will not be able to rejoin your seat.')) return;
    try { if (phase === 'lobby') await online.leave(code); } catch { /* leaving anyway */ }
    onLeft();
  };

  // ── Problems: room ended, or still loading ──
  if (problem === 'gone') {
    return (
      <div className="relative text-center pt-8">
        <div className="w-16 h-16 mx-auto mb-3 rounded-[22px] bg-white/10 border border-white/15 text-cream/70 flex items-center justify-center" aria-hidden="true"><Question size={34} weight="bold" /></div>
        <h2 className="font-display text-2xl font-extrabold text-white">This room has ended</h2>
        <p className="text-sm text-cream/60 mt-1 mb-5 px-4">Rooms close a few hours after they open. If the host removed you, join again with the same name to get your points back.</p>
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
  const link = joinLink(room.code);
  const shareText = `Join my Yaaru Avan? game on Ulaa! Room code ${room.code}. Tap to join: ${link}`;
  const n = players.length;
  const sRaw = state.counts?.strangers ?? 1;
  const lRaw = state.counts?.pickpockets ?? 0;
  const eff = n >= MIN_PLAYERS ? clampRoles(n, sRaw, lRaw) : { strangers: sRaw, pickpockets: lRaw };
  const validRoles = n >= MIN_PLAYERS && rolesValid(n, eff.strangers, eff.pickpockets);
  const tourists = n - eff.strangers - eff.pickpockets;

  const saveSettings = (patch: Partial<{ strangers: number; pickpockets: number; level: Level; hideCounts: boolean; dares: boolean; specials: boolean; specialIds: SpecialId[] | null }>) =>
    act(() => online.setSettings(room.code, {
      strangers: eff.strangers, pickpockets: eff.pickpockets, level: room.level, hideCounts: room.hide_counts,
      dares: room.dares, specials: room.specials, specialIds: room.special_ids ?? null, ...patch,
    }));

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(`${shareText}`); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }
    catch { flash('Could not copy. Share the code instead.'); }
  };

  const nextDare = (): string | null => (room.dares ? drawDare() : null);

  const roleName = (r?: Role | null) => (r ? ROLE_LABEL[r] : '');
  const alivePlayers = players.filter(p => p.alive);
  const countLine = room.hide_counts || !state.counts
    ? `${alivePlayers.length} travellers aboard. Roles are secret.`
    : `${state.counts.tourists} Tourists, ${state.counts.strangers} Stranger${state.counts.strangers === 1 ? '' : 's'}${state.counts.pickpockets ? `, ${state.counts.pickpockets} Pickpocket${state.counts.pickpockets === 1 ? '' : 's'}` : ''}`;

  const voteKey = `${room.round_no}-${room.stop_no}-${room.last_result?.tie ? 't' : 'n'}${room.last_result?.saved ? `s${room.last_result.saved}` : ''}`;
  const pickId = pick?.key === voteKey ? pick.id : null;
  const out = room.out_player ? byId.get(room.out_player) : undefined;
  const iAmOut = !!out && out.id === me.id;
  const summary = room.round_summary;
  const mySpecial = me.special
    ? { label: `${specialDisplayName(me.special, me.dip)}${me.partner ? ` · with ${me.partner}` : ''}`, text: describeSpecial({ special: me.special, partner: me.partner ?? undefined }) ?? '' }
    : null;
  const voters = players.filter(p => p.voter);
  const publicRoles = players.filter(p => p.public_special);
  // The Goddess of Justice is announced to everyone once the words are dealt; every other role is secret.
  const goddessLine = (p: { name: string; alive: boolean }) =>
    `⚖️ ${p.name} is the Goddess of Justice. ${p.alive ? 'She' : 'She is out, but she still'} decides any tied vote.`;
  const outSpecial = room.last_result?.special ? specialDisplayName(room.last_result.special, !!room.last_result.dip) : null;
  const revengeBy = room.last_result?.revenge_by ? byId.get(room.last_result.revenge_by)?.name : undefined;
  const loverName = room.last_result?.lover ? byId.get(room.last_result.lover)?.name : undefined;
  const bounceFromName = room.last_result?.bounce_from ? byId.get(room.last_result.bounce_from)?.name : undefined;
  // The Sniper is named to everyone at the offboarding, like the one-phone game.
  const sniperName = room.last_result?.sniper ? byId.get(room.last_result.sniper)?.name : undefined;
  const sniperTargetName = room.last_result?.sniper_target ? byId.get(room.last_result.sniper_target)?.name : undefined;
  const sniperLine = sniperName && sniperTargetName
    ? (room.last_result?.sniper_hit
        ? `${sniperName} took the shot at ${sniperTargetName} and hit.`
        : `${sniperName} shot ${sniperTargetName}, a Tourist. The shot backfired and ${sniperName} goes offboard instead.`)
    : null;
  const goddessId = room.last_result?.tiebreak ? room.last_result.leader : undefined;
  const goddess = goddessId ? byId.get(goddessId) : undefined;
  const hostPick = !!room.last_result?.host_pick;
  // Boomerang: the votes against them moved onto the voters, who are now tied.
  const boomerangName = room.last_result?.saved ? (room.last_result.name ?? 'Someone') : null;
  const bounceNames = (room.last_result?.bounce_names ?? []).join(' and ');
  const boomerangBanner = boomerangName && (
    <div className="rounded-lg bg-gradient-to-br from-primary/40 to-secondary/25 border border-gold/30 px-3.5 py-2.5 mb-3 text-left">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gold-300">The Boomerang</p>
      <p className="text-sm font-bold text-white">
        {boomerangName} stays aboard. The votes bounced back onto {bounceNames || 'the voters'}{bounceNames ? `, so ${bounceNames} are now tied.` : '. Vote again.'}
      </p>
    </div>
  );
  const tiedPlayers = (room.last_result?.tied ?? []).map(id => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
  const order = room.describe_order ?? [];
  // A tie with no Goddess: the tied players describe once more, then the others vote again among them.
  const tieRedo = !!room.last_result?.redo;
  const tieNames = (room.last_result?.names ?? []).join(' and ');
  const iAmTied = tieRedo && !!room.bounce?.includes(me.id);
  const speakerId = order[room.describe_pos];
  const speaker = speakerId ? byId.get(speakerId) : undefined;
  const myTurn = speakerId === me.id;
  const lastSpeaker = room.describe_pos + 1 >= order.length;
  // Only a Pickpocket guesses, and always the Tourists' word (also when she left with her Lover).
  const guessWordOwner = "Tourists'";

  const hostBanner = !isHost && state.host_away && (
    <div className="rounded-lg bg-rose-400/10 border border-rose-300/30 px-3 py-2.5 mb-3 text-left">
      <p className="text-xs text-rose-100"><WifiSlash size={13} weight="bold" className="inline -mt-0.5 mr-1" />{hostName} seems to be away, so the game is paused.</p>
      <button type="button" onClick={() => void act(() => online.claimHost(room.code))} className="mt-1.5 text-xs font-bold text-gold-300 hover:text-white transition-colors">Take over as host</button>
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
        <span className="inline-flex items-center gap-1.5 rounded-md bg-white/10 border border-white/15 px-2.5 py-1 text-[11px] font-bold text-cream/80">
          <Hash size={12} weight="bold" /> <span className="font-display tracking-[0.2em] text-gold-300">{room.code}</span>
        </span>
        {offline && <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-300"><WifiSlash size={13} weight="bold" /> Reconnecting…</span>}
        <span className="flex-1" />
        <button type="button" onClick={toggleMute} className={`${iconBtn} !w-8 !h-8`} aria-label={muted ? 'Turn sound on' : 'Turn sound off'}>
          {muted ? <SpeakerSlash size={14} /> : <SpeakerHigh size={14} />}
        </button>
        <button type="button" onClick={toggleHaptics} className={`${iconBtn} !w-8 !h-8`} aria-pressed={hapticsOn} aria-label={hapticsOn ? 'Turn haptics off' : 'Turn haptics on'}>
          <Vibrate size={14} weight={hapticsOn ? 'fill' : 'regular'} />
        </button>
      </div>

      {notice && <p role="alert" className="rounded-lg bg-rose-400/15 border border-rose-300/30 text-rose-100 text-xs font-semibold px-3 py-2 mb-3">{notice}</p>}
      {hostBanner}

      {/* ── Lobby: special roles picker (host) ── */}
      {phase === 'lobby' && isHost && pickingSpecials && (
        <SpecialPicker
          initial={pickedSpecials(room)}
          players={n}
          strangers={eff.strangers}
          busy={busy}
          onCancel={() => setPickingSpecials(false)}
          onSave={ids => {
            void saveSettings(ids.length === 0
              ? { specials: false, specialIds: [] }
              : { specials: true, specialIds: ids.length === ALL_SPECIAL_IDS.length ? null : ids }
            ).then(() => setPickingSpecials(false));
          }}
        />
      )}

      {/* ── Lobby ── */}
      {phase === 'lobby' && showRules && <YaaruAvanRules onBack={() => setShowRules(false)} />}

      {phase === 'lobby' && !showRules && !(isHost && pickingSpecials) && (
        <div>
          <div className={`${glass} text-center py-4 mb-3`}>
            <p className={eyebrow}>Room code</p>
            <p className={`font-display text-5xl font-extrabold tracking-[0.3em] pl-[0.3em] leading-tight ${GOLD_GRAD_TEXT}`} aria-label={`Room code ${room.code.split('').join(' ')}`}>{room.code}</p>
            <p className="text-[11px] text-cream/50 mt-1">Friends open the link, or tap Join with code.</p>
            <div className="grid grid-cols-2 gap-2 mt-3 px-3">
              <a href={getWhatsAppLink('', shareText)} target="_blank" rel="noopener noreferrer" className={`${primaryBtn} !py-2.5 !text-sm`}>
                <WhatsAppIcon size={16} /> WhatsApp
              </a>
              <button type="button" onClick={() => void copyLink()} className={`${ghostBtn} !py-2.5 !text-sm`}>
                <Copy size={16} weight="bold" /> {copied ? 'Copied' : 'Copy link'}
              </button>
            </div>
          </div>

          <button type="button" onClick={() => setShowRules(true)} className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-cream/60 hover:text-cream transition-colors">
            <Question size={14} /> How to play
          </button>

          <div className="flex items-center justify-between mb-1.5">
            <p className={eyebrow}>Travellers</p>
            <span className="text-xs text-cream/50 tabular-nums">{n} of {MIN_PLAYERS}–{MAX_PLAYERS}</span>
          </div>
          <ul className={`${glass} divide-y divide-white/10 mb-3`}>
            {players.map(p => (
              <li key={p.id} className="flex items-center gap-2.5 px-3 py-2">
                <span className={`w-2 h-2 rounded-full shrink-0 ${p.away ? 'bg-cream/25' : 'bg-emerald-400'}`} aria-hidden="true" />
                <span className="flex-1 min-w-0 text-sm font-bold text-white truncate">{p.name}{p.id === me.id && <span className="ml-1.5 text-[10px] font-semibold text-cream/55">you</span>}</span>
                {p.id === room.host_id && <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-gold-300"><Crown size={12} weight="fill" /> Host</span>}
                {isHost && p.id !== me.id && (
                  <button type="button" onClick={() => void act(() => online.kick(room.code, p.id))} className="w-7 h-7 rounded-md text-cream/40 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors" aria-label={`Remove ${p.name}`} title={room.round_no > 0 ? 'Remove (keeps their points)' : 'Remove'}>
                    <X size={13} weight="bold" />
                  </button>
                )}
              </li>
            ))}
          </ul>

          {sittingOut.length > 0 && (
            <div className={`${glass} px-3 py-2.5 mb-3`}>
              <p className={eyebrow}>Sitting out</p>
              <ul className="mt-1 space-y-0.5">
                {sittingOut.map(s => (
                  <li key={s.name} className="flex items-center justify-between gap-2 text-sm text-cream/70">
                    <span className="min-w-0 truncate font-semibold">{s.name}</span>
                    <span className="tabular-nums text-xs text-cream/50">{s.points} pt{s.points === 1 ? '' : 's'}</span>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-cream/50 mt-1.5">They keep their points. They can join again with the same name{isHost ? ' (unlock the room if it is locked)' : ''}.</p>
            </div>
          )}
          {isHost && room.round_no > 0 && sittingOut.length === 0 && (
            <p className="text-[11px] text-cream/50 mb-3">Removing someone keeps their points. They can join again later with the same name.</p>
          )}

          {isHost ? (
            <>
              <button type="button" onClick={() => void act(() => online.setLocked(room.code, !room.locked))} className={`${ghostBtn} !py-2.5 !text-sm mb-4`} aria-pressed={room.locked}>
                {room.locked ? <><LockSimple size={16} weight="fill" /> Room locked. Tap to unlock</> : <><LockSimpleOpen size={16} weight="bold" /> Lock the room when everyone is in</>}
              </button>

              <div className="flex items-center justify-between mb-2">
                <h3 className="font-display text-lg font-extrabold text-white">Pick the roles</h3>
                <button type="button" disabled={n < MIN_PLAYERS} onClick={() => { const r = recommendedRoles(n); void saveSettings({ strangers: r.strangers, pickpockets: r.pickpockets }); }} className="inline-flex items-center gap-1 rounded-md bg-gold/15 border border-gold/30 text-gold-300 text-[11px] font-bold px-2.5 py-1 hover:bg-gold/25 disabled:opacity-40 transition-colors">
                  <MagicWand size={12} weight="fill" /> Recommended
                </button>
              </div>
              <div className={`${glass} divide-y divide-white/10 mb-2`}>
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <span className="w-8 h-8 rounded-lg bg-emerald-400/20 text-emerald-300 flex items-center justify-center"><Eye size={16} weight="duotone" /></span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white leading-tight">Tourists</p>
                    <p className="text-[11px] text-cream/50">Same word. Always the majority.</p>
                  </div>
                  <span className="font-display text-xl font-extrabold text-white tabular-nums w-8 text-center">{n >= MIN_PLAYERS ? tourists : '-'}</span>
                </div>
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <span className="w-8 h-8 rounded-lg bg-gold/20 text-gold-300 flex items-center justify-center"><Ticket size={16} weight="duotone" /></span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white leading-tight">Strangers</p>
                    <p className="text-[11px] text-cream/50">A similar but different word.</p>
                  </div>
                  <button type="button" className={stepBtn} aria-label="Fewer Strangers" disabled={busy || n < MIN_PLAYERS || eff.strangers <= (eff.pickpockets > 0 ? 0 : 1)} onClick={() => void saveSettings({ strangers: eff.strangers - 1 })}><Minus size={14} weight="bold" /></button>
                  <span className="font-display text-xl font-extrabold text-white tabular-nums w-6 text-center">{eff.strangers}</span>
                  <button type="button" className={stepBtn} aria-label="More Strangers" disabled={busy || n < MIN_PLAYERS || !rolesValid(n, eff.strangers + 1, eff.pickpockets)} onClick={() => void saveSettings({ strangers: eff.strangers + 1 })}><Plus size={14} weight="bold" /></button>
                </div>
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <span className="w-8 h-8 rounded-lg bg-rose-400/20 text-rose-300 flex items-center justify-center"><Question size={16} weight="duotone" /></span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white leading-tight">Pickpocket</p>
                    <p className="text-[11px] text-cream/50">No word at all. Blends in.</p>
                  </div>
                  <button type="button" className={stepBtn} aria-label="Fewer Pickpockets" disabled={busy || n < MIN_PLAYERS || eff.pickpockets <= (eff.strangers > 0 ? 0 : 1)} onClick={() => void saveSettings({ pickpockets: eff.pickpockets - 1 })}><Minus size={14} weight="bold" /></button>
                  <span className="font-display text-xl font-extrabold text-white tabular-nums w-6 text-center">{eff.pickpockets}</span>
                  <button type="button" className={stepBtn} aria-label="More Pickpockets" disabled={busy || n < MIN_PLAYERS || eff.pickpockets >= maxPickpockets(n) || !rolesValid(n, eff.strangers, eff.pickpockets + 1)} onClick={() => void saveSettings({ pickpockets: eff.pickpockets + 1 })}><Plus size={14} weight="bold" /></button>
                </div>
              </div>
              {n < MIN_PLAYERS && <p className="text-xs text-gold-300 mb-2">Waiting for at least {MIN_PLAYERS} travellers.</p>}

              <h3 className="font-display text-lg font-extrabold text-white mt-4 mb-2">How tricky?</h3>
              <div className="grid grid-cols-3 gap-1.5 mb-1" role="radiogroup" aria-label="Difficulty">
                {LEVELS.map(l => (
                  <button key={l.id} type="button" role="radio" aria-checked={room.level === l.id} disabled={busy} onClick={() => void saveSettings({ level: l.id })}
                    className={`rounded-md border py-2 text-sm font-bold transition-colors ${room.level === l.id ? 'bg-gradient-to-b from-primary-light to-primary border-transparent text-white' : 'bg-white/[0.06] border-white/10 text-cream/70 hover:bg-white/10'}`}>{l.label}</button>
                ))}
              </div>
              <p className="text-[11px] text-cream/50 mb-4">{LEVELS.find(l => l.id === room.level)?.hint}.</p>

              <div className={`${glass} divide-y divide-white/10 mb-4`}>
                <Toggle on={room.hide_counts} onChange={v => void saveSettings({ hideCounts: v })} disabled={busy} title="Hide the counts" desc="Only you can see the role split. Nobody else knows if a Pickpocket exists." />
                <Toggle on={room.dares} onChange={v => void saveSettings({ dares: v })} disabled={busy} title="Trip dares" desc="The losing side gets a silly dare." />
                <Toggle on={!!room.pickpocket_can_start} onChange={v => void act(() => online.setPickpocketFirst(room.code, v))} disabled={busy} title="Pickpocket can speak first" desc="On: a Pickpocket may randomly open the description round. Off: a Pickpocket never speaks first." />
                <button type="button" onClick={() => { ensure(); setPickingSpecials(true); }} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/[0.04] transition-colors">
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-bold text-white leading-tight">Special roles</span>
                    <span className="block text-[11px] text-cream/50">
                      {pickedSpecials(room).length === 0
                        ? 'Off. Tap to choose which ones.'
                        : pickedSpecials(room).length === ALL_SPECIAL_IDS.length
                          ? `All ${ALL_SPECIAL_IDS.length} on. Tap to choose.`
                          : `${pickedSpecials(room).length} of ${ALL_SPECIAL_IDS.length} on. Tap to choose.`}
                    </span>
                  </span>
                  <CaretRight size={16} weight="bold" className="text-cream/40" aria-hidden="true" />
                </button>
              </div>

              <button type="button" disabled={busy || !validRoles} onClick={() => { void act(() => online.startRound(room.code, nextDare(), false)); }} className={`${primaryBtn} disabled:opacity-50 disabled:pointer-events-none`}>
                <Play size={18} weight="fill" /> Deal boarding passes
              </button>
            </>
          ) : (
            <div className={`${glass} px-3 py-3 mb-3 text-sm text-cream/70`}>
              <p className="font-bold text-white mb-1">Game settings</p>
              <p>{LEVELS.find(l => l.id === room.level)?.label} words{room.hide_counts ? ', hidden role counts' : state.counts ? `, ${state.counts.tourists} Tourists, ${state.counts.strangers} Stranger${state.counts.strangers === 1 ? '' : 's'}${state.counts.pickpockets ? `, ${state.counts.pickpockets} Pickpocket` : ''}` : ''}.</p>
              {room.specials && <p className="text-xs text-cream/50 mt-1">Special roles: {pickedSpecials(room).map(id => specialDisplayName(id)).join(', ')}.</p>}
              {room.locked && <p className="text-xs text-cream/50 mt-1"><LockSimple size={12} weight="fill" className="inline -mt-0.5" /> The host locked the room.</p>}
            </div>
          )}
          {!isHost && waiting(`Waiting for ${hostName} to start…`)}
          <button type="button" onClick={() => void leave()} className="mt-2 w-full text-xs font-semibold text-cream/50 hover:text-cream transition-colors">Leave room</button>
        </div>
      )}

      {/* ── Boarding passes ── */}
      {phase === 'deal' && (
        <div className="text-center">
          <p className={eyebrow}>Round {room.round_no} · Boarding passes</p>
          <h2 className="font-display text-2xl font-extrabold text-white leading-tight mb-3">Check your pass</h2>
          <BoardingPass name={meP?.name ?? ''} seat={meP?.seat ?? null} word={me.word} tripTitle={room.trip_title} holding={holding} special={mySpecial} />
          <HoldButton
            holding={holding}
            onChange={v => { setHolding(v); if (v) { setSeenRound(room.round_no); play('flip'); } }}
            className="mt-5"
          />
          {!meP?.ready ? (
            <button type="button" disabled={!seen || holding || busy} onClick={() => void act(() => online.ready(room.code))} className={`${primaryBtn} mt-3 disabled:opacity-40 disabled:pointer-events-none`}>
              Hidden. I am ready <ArrowRight size={16} weight="bold" />
            </button>
          ) : (
            <p className="mt-3 text-sm font-bold text-emerald-300"><CheckCircle size={16} weight="fill" className="inline -mt-0.5 mr-1" />You are ready</p>
          )}
          <p className="mt-2 text-[11px] text-cream/55">Only you can see this. Look away from other screens.</p>

          <ul className="flex flex-wrap justify-center gap-1.5 mt-4" aria-label="Who is ready">
            {players.map(p => (
              <li key={p.id} className={`rounded-md px-2.5 py-1 text-[11px] font-bold border ${p.ready ? 'bg-emerald-400/15 border-emerald-300/40 text-emerald-200' : 'bg-white/[0.06] border-white/15 text-cream/60'}`}>
                {p.ready && <CheckCircle size={11} weight="fill" className="inline -mt-0.5 mr-1" />}{p.name}
              </li>
            ))}
          </ul>
          {publicRoles.map(p => (
            <p key={p.id} className="text-xs text-gold-300 leading-snug mt-3">{goddessLine(p)}</p>
          ))}
          {isHost
            ? <button type="button" disabled={busy} onClick={() => void act(() => online.beginVote(room.code))} className={`${players.every(p => p.ready) ? primaryBtn : ghostBtn} mt-4`}>
                {players.every(p => p.ready) ? 'Everyone has boarded. Start the round' : `Start anyway (${players.filter(p => p.ready).length} of ${n} ready)`} <ArrowRight size={16} weight="bold" />
              </button>
            : <div className="mt-3">{waiting(players.every(p => p.ready) ? `Waiting for ${hostName} to start…` : 'Waiting for everyone to get ready…')}</div>}
        </div>
      )}

      {/* ── Description round ── */}
      {phase === 'describe' && (
          <div className="text-center">
            <div className="mb-3 text-left">
              <p className={eyebrow}>Round {room.round_no} · Stop {room.stop_no}</p>
              <h2 className="font-display text-2xl font-extrabold text-white leading-tight">Describe your word</h2>
              <p className="text-xs text-cream/60">Say one word or a short phrase about your word, aloud. Be truthful, but do not give it away.</p>
              <p className="text-xs text-cream/70 leading-snug mt-1">{countLine}</p>
            </div>
            {tieRedo && (
              <div className="rounded-lg bg-gradient-to-br from-primary/40 to-secondary/25 border border-gold/30 px-3.5 py-2.5 mb-3 text-left">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gold-300">Tie-break</p>
                <p className="text-sm font-bold text-white">{boomerangName ? `The Boomerang's votes bounced back onto ${tieNames}, so they are tied.` : `${tieNames} got the same number of votes.`} {iAmTied ? 'You each' : 'They each'} describe once more, then the other players vote again.</p>
              </div>
            )}
            {speaker && (
              <motion.div key={room.describe_pos} initial={reduce ? false : { scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="rounded-lg bg-gradient-to-br from-[#FFF6DD] to-gold-300 text-dark px-5 py-5 shadow-[0_18px_40px_rgba(0,0,0,0.4)]">
                <span className="mx-auto w-11 h-11 rounded-lg bg-dark/90 text-gold-300 flex items-center justify-center mb-2" aria-hidden="true"><ChatCircleDots size={24} weight="duotone" /></span>
                <p className="text-[10px] font-bold uppercase tracking-widest text-dark/70">{room.describe_pos === 0 ? 'Starts' : `Speaker ${room.describe_pos + 1} of ${order.length}`}</p>
                <p className="font-display text-3xl font-extrabold leading-tight break-words">{myTurn ? 'You' : speaker.name}</p>
                <p className="text-xs font-bold text-dark/70 mt-1">Seat {speaker.seat}</p>
              </motion.div>
            )}
            <ol className="flex flex-wrap justify-center gap-1.5 mt-4" aria-label="Speaking order">
              {order.map((id, k) => (
                <li key={id} className={`rounded-md px-2.5 py-1 text-[11px] font-bold border ${k === room.describe_pos ? 'bg-gold/25 border-gold/60 text-gold-300' : k < room.describe_pos ? 'bg-emerald-400/15 border-emerald-300/40 text-emerald-200' : 'bg-white/[0.06] border-white/15 text-cream/60'}`}>
                  {k < room.describe_pos && <CheckCircle size={11} weight="fill" className="inline -mt-0.5 mr-1" />}{byId.get(id)?.name ?? '...'}
                </li>
              ))}
            </ol>
            {publicRoles.map(p => (
              <p key={p.id} className="text-xs text-gold-300 leading-snug mt-2">
                {goddessLine(p)}
              </p>
            ))}
            {meP?.alive && me.role !== null && (
              <div className="mt-4">
                <HoldButton holding={holding} onChange={v => { setHolding(v); if (v) play('flip'); }} label="Hold to peek at my word" className="!py-2.5 !text-sm" />
                <AnimatePresence>
                  {holding && (
                    <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-2 text-center font-display text-2xl font-extrabold text-gold-300">
                      {me.word ?? 'No destination. Blend in.'}
                      {mySpecial && <span className="block mt-1 text-xs font-semibold text-cream/70 font-sans">{mySpecial.label}: {mySpecial.text}</span>}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            )}
            {(myTurn || isHost) ? (
              <button type="button" disabled={busy} onClick={() => void act(() => online.describeDone(room.code, room.describe_pos))} className={`${primaryBtn} mt-4 disabled:opacity-50`}>
                {myTurn ? (lastSpeaker ? 'Done. Start the discussion' : 'Done. Next speaker') : (lastSpeaker ? 'Host: start the discussion' : 'Host: next speaker')} <ArrowRight size={16} weight="bold" />
              </button>
            ) : <div className="mt-4">{waiting(`Waiting for ${speaker?.name ?? 'the speaker'} to finish…`)}</div>}
            {isHost && !myTurn && (
              <button type="button" disabled={busy} onClick={() => void act(() => online.beginVote(room.code))} className="mt-3 text-xs font-semibold text-cream/50 hover:text-cream transition-colors">Skip to the discussion and vote</button>
            )}
          </div>
      )}

      {/* ── Vote ── */}
      {phase === 'vote' && (
        <div>
          <div className="mb-3">
            <p className={eyebrow}>Round {room.round_no} · Stop {room.stop_no}</p>
            <h2 className="font-display text-2xl font-extrabold text-white leading-tight">Who goes offboard?</h2>
            <p className="text-xs text-cream/60">Discuss who is bluffing. Votes are private and revealed together.</p>
            <p className="text-xs text-cream/70 leading-snug mt-1">{countLine}</p>
            {publicRoles.map(p => (
              <p key={p.id} className="text-xs text-gold-300 leading-snug mt-1">
                {goddessLine(p)}
              </p>
            ))}
          </div>

          {meP?.alive && me.role !== null && (
            <div className="mb-3">
              <HoldButton holding={holding} onChange={v => { setHolding(v); if (v) play('flip'); }} label="Hold to peek at my word" className="!py-2.5 !text-sm" />
              <AnimatePresence>
                {holding && (
                  <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-2 text-center font-display text-2xl font-extrabold text-gold-300">
                    {me.word ?? 'No destination. Blend in.'}
                    {mySpecial && <span className="block mt-1 text-xs font-semibold text-cream/70 font-sans">{mySpecial.label}: {mySpecial.text}</span>}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          )}

          {boomerangBanner}

          {room.last_result?.tie && (
            <div className="rounded-lg bg-gradient-to-br from-primary/40 to-secondary/25 border border-gold/30 px-3.5 py-2.5 mb-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gold-300">It was a tie</p>
              <p className="text-sm font-bold text-white">
                {tieRedo
                  ? `${tieNames} described once more. The other players vote again, and only ${tieNames} can be voted out.`
                  : `${(room.last_result.names ?? []).join(' and ')} got the same number of votes. Talk again, then vote again.`}
              </p>
            </div>
          )}

          {me.can_snipe && (
            <div className="mb-3">
              {!sniperOpen ? (
                <button type="button" onClick={() => { setSniperOpen(true); setSniperPick(null); play('flip'); }}
                  className="text-xs font-bold text-gold-300 underline underline-offset-2">
                  🎯 Take my Sniper shot
                </button>
              ) : (
                <div className={`${glass} px-3 py-3`}>
                  <p className={eyebrow}>The Sniper</p>
                  <p className="text-xs text-cream/70 leading-snug mt-1 mb-3">
                    One shot this round, no majority needed. A Stranger or Pickpocket goes offboard at once. If you hit a Tourist, the shot backfires and you go offboard instead.
                  </p>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {alivePlayers.filter(p => p.id !== me.id).map(p => (
                      <button key={p.id} type="button" aria-pressed={sniperPick === p.id} onClick={() => { setSniperPick(p.id); play('flip'); }}
                        className={`rounded-lg border px-3 py-3 text-left transition ${sniperPick === p.id ? 'bg-gradient-to-br from-red-400 to-rose-600 border-transparent text-white' : 'bg-white/[0.06] border-white/10 text-cream hover:bg-white/10'}`}>
                        <span className="block font-display text-base font-extrabold leading-tight truncate">{p.name}</span>
                        <span className="block text-[10px] uppercase tracking-wider opacity-60">Seat {p.seat}</span>
                      </button>
                    ))}
                  </div>
                  <button type="button" disabled={!sniperPick || busy} className={`${primaryBtn} mb-2 disabled:opacity-40 disabled:pointer-events-none`}
                    onClick={() => { const target = sniperPick; if (!target) return; setSniperOpen(false); setSniperPick(null); void act(() => online.snipe(room.code, target)); }}>
                    {sniperPick ? `Fire at ${byId.get(sniperPick)?.name ?? ''}` : 'Pick a target'}
                  </button>
                  <button type="button" onClick={() => { setSniperOpen(false); setSniperPick(null); }} className={ghostBtn}>Not now</button>
                </div>
              )}
            </div>
          )}

          {me.can_vote ? (
            <>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {alivePlayers.filter(p => p.id !== me.id && (!room.bounce || room.bounce.includes(p.id))).map(p => (
                  <button key={p.id} type="button" aria-pressed={pickId === p.id} onClick={() => { setPick({ key: voteKey, id: p.id }); play('flip'); }}
                    className={`rounded-lg border px-3 py-3 text-left transition ${pickId === p.id ? 'bg-gradient-to-br from-primary-light to-primary border-transparent text-white shadow-[0_8px_20px_rgba(168,90,42,0.5)]' : 'bg-white/[0.06] border-white/10 text-cream hover:bg-white/10'}`}>
                    <span className="block font-display text-base font-extrabold leading-tight truncate">{p.name}</span>
                    <span className="block text-[10px] uppercase tracking-wider opacity-60">Seat {p.seat}</span>
                  </button>
                ))}
              </div>
              <button type="button" disabled={!pickId || busy} onClick={() => { if (pickId) void act(() => online.vote(room.code, pickId)); }} className={`${primaryBtn} disabled:opacity-40 disabled:pointer-events-none`}>
                <Airplane size={18} weight="fill" /> {meP?.voted ? 'Change my vote' : pickId ? `Lock vote for ${byId.get(pickId)?.name ?? ''}` : 'Pick someone'}
              </button>
              {meP?.voted && <p className="mt-2 text-center text-xs font-bold text-emerald-300"><CheckCircle size={14} weight="fill" className="inline -mt-0.5 mr-1" />Your vote is in</p>}
            </>
          ) : waiting(iAmTied && meP?.alive ? 'You were tied, so the other players decide this vote. Watch them choose.' : 'You are offboard, so you cannot vote. Watch the others decide.')}
          {me.can_vote && !meP?.alive && <p className="-mt-2 mb-3 text-center text-[11px] text-cream/50">You are offboard, but as the Ghost your vote still counts.</p>}

          <p className={`${eyebrow} mt-4 mb-1.5`}>{voters.filter(p => p.voted).length} of {voters.length} voted</p>
          <ul className="flex flex-wrap gap-1.5">
            {voters.map(p => (
              <li key={p.id} className={`rounded-md px-2.5 py-1 text-[11px] font-bold border ${p.voted ? 'bg-emerald-400/15 border-emerald-300/40 text-emerald-200' : 'bg-white/[0.06] border-white/15 text-cream/60'}`}>
                {p.voted && <CheckCircle size={11} weight="fill" className="inline -mt-0.5 mr-1" />}{p.name}
              </li>
            ))}
          </ul>
          {isHost && voters.some(p => p.voted) && (
            <button type="button" disabled={busy} onClick={() => void act(() => online.resolveNow(room.code))} className={`${ghostBtn} mt-4`}>Reveal now with the votes so far</button>
          )}
        </div>
      )}

      {/* ── Tied vote: the Goddess of Justice decides ── */}
      {phase === 'tiebreak' && (
        <div>
          <div className="mb-3">
            <p className={eyebrow}>It was a tie</p>
            <h2 className="font-display text-2xl font-extrabold text-white leading-tight">
              {hostPick
                ? (goddessId === me.id ? 'Still tied. You decide' : `Still tied. ${goddess?.name ?? 'The host'} decides`)
                : (goddessId === me.id ? 'Goddess of Justice, you decide' : `${goddess?.name ?? 'The Goddess of Justice'} decides`)}
            </h2>
            {boomerangBanner}
            <p className="text-xs text-cream/60">
              {hostPick
                ? `${tiedPlayers.map(p => p.name).join(' and ')} are still tied after describing once more. The host picks who goes offboard.`
                : `${tiedPlayers.map(p => p.name).join(' and ')} got the same number of votes. The Goddess of Justice picks who goes offboard, even if she is already out.`}
            </p>
          </div>
          {(goddessId === me.id || (isHost && !!goddess?.away)) ? (
            <div className="grid grid-cols-2 gap-2">
              {tiedPlayers.map(p => (
                <button key={p.id} type="button" disabled={busy} onClick={() => void act(() => online.tiebreak(room.code, p.id))}
                  className="rounded-lg border px-3 py-3 text-left transition bg-white/[0.06] border-white/10 text-cream hover:bg-white/10 active:scale-[0.98] disabled:opacity-50">
                  <span className="block font-display text-base font-extrabold leading-tight truncate">{p.name}</span>
                  <span className="block text-[10px] uppercase tracking-wider opacity-60">Seat {p.seat}</span>
                </button>
              ))}
            </div>
          ) : waiting(`Waiting for ${goddess?.name ?? (hostPick ? 'the host' : 'the Goddess of Justice')} to choose…`)}
        </div>
      )}

      {/* ── Offboard reveal ── */}
      {phase === 'retrieve' && out && (
        <div className="text-center pt-6">
          <p className={eyebrow}>Private role check</p>
          {me.can_retrieve ? <>
            <h2 className="font-display text-2xl font-extrabold text-white mt-2">Bring {out.name} back?</h2>
            <p className="text-sm text-cream/65 my-4">You are the Retriever. You have 30 seconds to use your one return this round. Skipping or timing out keeps it for a later vote.</p>
            <button type="button" disabled={busy} className={`${primaryBtn} mb-3 disabled:opacity-60`}
              onClick={() => void act(() => online.retrieve(code, true, room.round_no, room.stop_no, out.id))}>Retrieve {out.name}</button>
            <button type="button" disabled={busy} className={`${ghostBtn} disabled:opacity-60`}
              onClick={() => void act(() => online.retrieve(code, false, room.round_no, room.stop_no, out.id))}>Skip this vote</button>
          </> : waiting('A private role decision is in progress. The game will continue shortly.')}
        </div>
      )}
      {phase === 'retrieved' && out && (
        <div className="text-center pt-6">
          <p className={eyebrow}>The Retriever</p>
          <h2 className="font-display text-3xl font-extrabold text-white mt-2">{iAmOut ? 'You are' : `${out.name} is`} back!</h2>
          <p className="text-sm text-cream/65 my-4">Same word, back in the vote.</p>
          <p className="text-sm font-bold text-gold-300 mb-4">{room.last_result?.retriever ?? 'Someone'} was the Retriever. The power is now used.</p>
          {waiting('Continuing…')}
        </div>
      )}

      {phase === 'offboard' && out && room.last_result?.role && (
        <div className="text-center pt-4 min-h-[22rem]">
          <p className={eyebrow}>Offboarding</p>
          <p className="font-display text-3xl font-extrabold text-white mt-1">{iAmOut ? 'You' : out.name}</p>
          <div className="relative h-24 mt-4 overflow-hidden" aria-hidden="true">
            <motion.div className="absolute top-1/2 -translate-y-1/2 text-gold-300" initial={{ x: reduce ? 120 : -80, rotate: -10 }} animate={{ x: reduce ? 120 : 360, rotate: -10 }} transition={{ duration: reduce ? 0 : 1.6, ease: 'easeIn' }}>
              <Airplane size={52} weight="fill" />
            </motion.div>
          </div>
          <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: reduce ? 0 : 1, type: 'spring', stiffness: 240, damping: 14 }}
            className={`inline-block rounded-lg bg-gradient-to-br ${ROLE_TONE[room.last_result.role]} px-6 py-3 shadow-[0_12px_30px_rgba(0,0,0,0.4)]`}>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-70">Was a</p>
            <p className="font-display text-3xl font-extrabold leading-tight">{roleName(room.last_result.role)}</p>
            {outSpecial && <p className="text-xs font-bold mt-1 opacity-80">and {outSpecial}</p>}
          </motion.div>
          {room.last_result.special === 'retriever' && <p className="mt-3 text-sm font-bold text-gold-300">The Retriever’s power is lost.</p>}
          {revengeBy && <p className="mt-3 text-xs font-bold text-gold-300">Revenger! {revengeBy} took them down.</p>}
          {sniperLine && <p className="mt-3 text-sm font-bold text-gold-300">{sniperLine}</p>}
          {bounceFromName && <p className="mt-3 text-xs font-bold text-gold-300">Boomerang! {bounceFromName}'s votes bounced back onto them.</p>}
          {loverName && <p className="mt-3 text-sm font-bold text-gold-300">{loverName} was in love with {out.name} and leaves too.</p>}

          {room.last_result.votes.length > 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduce ? 0 : 1.4 }} className="mt-5 text-left">
              <p className={`${eyebrow} mb-1.5 text-center`}>Who voted for whom</p>
              <ul className={`${glass} divide-y divide-white/10`}>
                {room.last_result.votes.map((v, i) => (
                  <li key={i} className="flex items-center gap-2 px-3 py-1.5 text-[13px]">
                    <span className="flex-1 min-w-0 font-bold text-white truncate">{v.from}</span>
                    <ArrowRight size={12} weight="bold" className="text-cream/40 shrink-0" />
                    <span className="flex-1 min-w-0 text-right font-bold text-gold-300 truncate">{v.to}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}
        </div>
      )}

      {/* ── Last chance: the Pickpocket ── */}
      {phase === 'guess' && out && (
        <div className="text-center pt-3">
          <motion.div initial={reduce ? false : { scale: 0.5, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 240, damping: 12 }}
            className="w-20 h-20 mx-auto mb-4 rounded-[28px] bg-gradient-to-br from-rose-300 to-rose-500 text-rose-950 flex items-center justify-center shadow-[0_14px_36px_rgba(244,63,94,0.4)]" aria-hidden="true">
            <Question size={46} weight="bold" />
          </motion.div>
          <span className="inline-block text-[10px] font-bold uppercase tracking-[0.2em] text-rose-200 bg-rose-400/15 border border-rose-300/30 rounded-md px-3 py-1 mb-2">Last chance</span>
          <h2 className="font-display text-3xl font-extrabold text-white leading-tight">
            {iAmOut ? 'You were the Pickpocket' : `${out.name} was the Pickpocket`}
          </h2>

          {iAmOut ? (
            room.guess_text ? (
              <>
                <p className="text-sm text-cream/65 mt-2 px-4">You guessed</p>
                <p className={`font-display text-3xl font-extrabold ${GOLD_GRAD_TEXT}`}>{room.guess_text}</p>
                {waiting('Waiting for the group to judge…')}
              </>
            ) : (
              <>
                <p className="text-sm text-cream/65 mt-2 mb-4 px-4">Guess the {guessWordOwner} word. One box per word. One shot.</p>
                <WordBoxes count={room.guess_words ?? 1} busy={busy} onSend={text => void act(() => online.submitGuess(room.code, text))} />
              </>
            )
          ) : room.guess_text ? (
            <>
              <p className="text-sm text-cream/65 mt-2 px-4">{out.name} guessed</p>
              <p className={`font-display text-3xl font-extrabold ${GOLD_GRAD_TEXT}`}>{room.guess_text}</p>
              {room.guess_match && <p className="text-xs font-bold text-emerald-300 mt-1">That is an exact match with the {guessWordOwner} word.</p>}
              <p className="text-xs text-cream/55 my-3 px-4">Close enough counts. Spelling does not matter.</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" disabled={busy} onClick={() => void act(() => online.judgeGuess(room.code, false))} className={`${ghostBtn} !py-4`}><XCircle size={20} weight="fill" className="text-rose-300" /> Wrong</button>
                <button type="button" disabled={busy} onClick={() => void act(() => online.judgeGuess(room.code, true))} className={`${primaryBtn} !py-4`}><CheckCircle size={20} weight="fill" /> Correct</button>
              </div>
            </>
          ) : waiting(`Waiting for ${out.name} to type their guess…`)}
        </div>
      )}

      {/* ── Revenge: the player who just left takes one more ── */}
      {phase === 'revenger' && out && (
        <div>
          <div className="mb-3">
            <p className={eyebrow}>The Revenger</p>
            <h2 className="font-display text-2xl font-extrabold text-white leading-tight">{iAmOut ? 'Take someone with you' : `${out.name} takes someone with them`}</h2>
            <p className="text-xs text-cream/60">{iAmOut ? 'Pick one player to go offboard too.' : 'They are choosing now.'}</p>
          </div>
          {(iAmOut || (isHost && out.away)) ? (
            <div className="grid grid-cols-2 gap-2">
              {alivePlayers.map(p => (
                <button key={p.id} type="button" disabled={busy} onClick={() => void act(() => online.revenge(room.code, p.id))}
                  className="rounded-lg border px-3 py-3 text-left transition bg-white/[0.06] border-white/10 text-cream hover:bg-white/10 active:scale-[0.98] disabled:opacity-50">
                  <span className="block font-display text-base font-extrabold leading-tight truncate">{p.name}</span>
                  <span className="block text-[10px] uppercase tracking-wider opacity-60">Seat {p.seat}</span>
                </button>
              ))}
            </div>
          ) : waiting(`Waiting for ${out.name} to choose…`)}
        </div>
      )}

      {/* ── Round end ── */}
      {phase === 'roundEnd' && summary && (
        <div className="text-center pt-1">
          {!reduce && <Confetti />}
          <span className="inline-block text-[10px] font-bold uppercase tracking-[0.2em] text-gold-300 bg-gold/15 border border-gold/30 rounded-md px-3 py-1 mb-2">Round {room.round_no} over</span>
          <h2 className={`font-display text-3xl font-extrabold leading-tight ${GOLD_GRAD_TEXT}`}>
            {summary.outcome === 'tourists' ? 'Tourists win!' : summary.outcome === 'strangers' ? 'The Strangers got away!' : 'The Pickpocket stole it!'}
          </h2>
          <p className="text-sm text-cream/60 mt-1 mb-3">
            {summary.outcome === 'tourists' ? 'Every Stranger and Pickpocket was caught.' : summary.outcome === 'strangers' ? 'Only one Tourist was left.' : 'One lucky guess flipped the whole round.'}
          </p>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className={`${glass} py-2.5`}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-cream/50">Tourists had</p>
              <p className="font-display text-lg font-extrabold text-white leading-tight px-2">{summary.tourist_word}</p>
            </div>
            <div className={`${glass} py-2.5`}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-cream/50">Strangers had</p>
              <p className="font-display text-lg font-extrabold text-gold-300 leading-tight px-2">{summary.stranger_word}</p>
            </div>
          </div>
          <p className="text-[11px] text-cream/55 mb-3">{CATEGORY_LABEL[summary.category as Category] ?? summary.category}</p>

          <ul className={`${glass} text-left divide-y divide-white/10 mb-3`}>
            {[...summary.players].sort((x, y) => y.gained - x.gained).map(s => (
              <li key={s.id} className="flex items-center gap-2.5 px-3 py-2">
                <span className={`w-6 h-6 shrink-0 rounded-md bg-gradient-to-br ${ROLE_TONE[s.role]} flex items-center justify-center`} aria-hidden="true">
                  {s.role === 'tourist' ? <Eye size={13} weight="bold" /> : s.role === 'stranger' ? <Ticket size={13} weight="bold" /> : <Skull size={13} weight="bold" />}
                </span>
                <span className="flex-1 min-w-0 text-sm font-bold text-white truncate">{byId.get(s.id)?.name ?? '...'}{s.id === me.id && <span className="ml-1.5 text-[10px] font-semibold text-cream/55">you</span>}</span>
                <span className="text-[11px] text-cream/50">{ROLE_LABEL[s.role]}{s.special ? ` · ${specialDisplayName(s.special, !!s.dip)}` : ''}</span>
                <span className={`w-9 text-right font-display font-extrabold tabular-nums ${s.gained > 0 ? 'text-emerald-300' : 'text-cream/50'}`}>+{s.gained}</span>
              </li>
            ))}
          </ul>

          {room.dare && (
            <div className="rounded-lg bg-gradient-to-br from-primary/40 to-secondary/25 border border-gold/30 px-3.5 py-3 mb-3 text-left">
              <p className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.18em] text-gold-300"><Gift size={11} weight="fill" /> Trip dare for the {summary.outcome === 'tourists' ? 'Strangers' : 'Tourists'}</p>
              <p className="text-sm font-bold text-white mt-0.5">{room.dare}</p>
            </div>
          )}

          <p className="text-[11px] text-cream/55 mb-3">Points: Tourists +{POINTS.touristWin}, a winning Stranger +{POINTS.strangerSurvive}, a winning Pickpocket +{POINTS.pickpocketSurvive} (lasting to the end or guessing the Tourists' word).{summary.players.some(p => p.special) ? ' Special-role bonuses are added on top.' : ''}</p>

          {isHost ? (
            <>
              <button type="button" disabled={busy} onClick={() => { void act(() => online.startRound(room.code, nextDare(), false)); }} className={`${primaryBtn} mb-2.5`}><Play size={18} weight="fill" /> Play next round</button>
              <button type="button" disabled={busy} onClick={() => void act(() => online.endGame(room.code))} className={ghostBtn}><Trophy size={16} weight="fill" /> End game and see awards</button>
              <button type="button" disabled={busy} onClick={() => void act(() => online.toLobby(room.code))} className="mt-3 text-xs font-semibold text-cream/50 hover:text-cream transition-colors">Change players or roles</button>
            </>
          ) : waiting(`Waiting for ${hostName} to start the next round…`)}
        </div>
      )}

      {/* ── Final scoreboard ── */}
      {phase === 'final' && (
        <div className="text-center pt-1">
          {!reduce && <Confetti />}
          <span className="inline-block text-[10px] font-bold uppercase tracking-[0.2em] text-gold-300 bg-gold/15 border border-gold/30 rounded-md px-3 py-1 mb-2">{room.round_no} round{room.round_no === 1 ? '' : 's'} played</span>
          <div className="w-16 h-16 mx-auto mb-2 rounded-[22px] bg-gradient-to-br from-gold-300 to-gold text-dark flex items-center justify-center shadow-[0_12px_30px_rgba(200,150,42,0.45)]" aria-hidden="true"><Crown size={36} weight="fill" /></div>
          <p className={eyebrow}>Champion</p>
          <p className={`font-display text-4xl font-extrabold leading-tight ${GOLD_GRAD_TEXT}`}>{ranking[0]?.name}</p>
          <p className="text-sm text-cream/60 mb-3">{ranking[0]?.points ?? 0} point{ranking[0]?.points === 1 ? '' : 's'}</p>

          <ol className={`${glass} text-left divide-y divide-white/10 mb-3`}>
            {ranking.map((p, i) => (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                <span className="w-5 text-center font-display font-extrabold text-cream/50 tabular-nums">{i + 1}</span>
                <span className="flex-1 min-w-0 text-sm font-bold text-white truncate">{p.name}</span>
                <span className="font-display text-lg font-extrabold text-gold-300 tabular-nums">{p.points}</span>
              </li>
            ))}
          </ol>

          {awards.length > 0 && (
            <div className="grid grid-cols-2 gap-2 mb-3">
              {awards.map(aw => (
                <div key={aw.id} className={`${glass} px-2.5 py-2.5`}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gold-300">{aw.title}</p>
                  <p className="font-display text-base font-extrabold text-white leading-tight truncate">{aw.winner}</p>
                  <p className="text-[10px] text-cream/50 leading-snug">{aw.blurb}</p>
                </div>
              ))}
            </div>
          )}

          <button type="button" disabled={sharing} className={`${ghostBtn} mb-2.5`} onClick={() => {
            const top = ranking[0];
            const bluffer = awards.find(a => a.id === 'bluffer');
            const short = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
            setSharing(true);
            void (async () => {
              let blob: Blob | null;
              try {
                blob = await buildScoreCard({
                  score: top?.points ?? 0, stars: Math.min(3, room.round_no),
                  title: top ? `${short(top.name, 14)} takes the trip` : 'Yaaru Avan?',
                  tripTitle: room.trip_title, host: SITE_HOST, best: top?.points ?? 0, isNewBest: false,
                  eyebrow: 'YAARU AVAN?  ·  GROUP GAME', unit: 'TOP SCORE', ringMax: Math.max(12, room.round_no * 4),
                  playerName: top?.name,
                  tiles: [
                    { v: String(room.round_no), l: 'ROUNDS' },
                    { v: String(n), l: 'TRAVELLERS' },
                    { v: bluffer ? short(bluffer.winner.split(' & ')[0], 8) : '-', l: 'BEST BLUFFER' },
                  ],
                });
              } catch { blob = null; }
              const text = `${top?.name ?? 'We'} won our game of Yaaru Avan? on Ulaa after ${room.round_no} round${room.round_no === 1 ? '' : 's'}! Play with your travel gang: ${link}`;
              await shareCardImage(blob, { filename: 'ulaa-yaaru-avan.png', title: 'Yaaru Avan?', text, fallbackLink: getWhatsAppLink('', text) });
              setSharing(false);
            })();
          }}>
            <ShareNetwork size={16} weight="bold" /> {sharing ? 'Preparing…' : 'Share the result card'}
          </button>

          {isHost ? (
            <>
              <button type="button" disabled={busy} onClick={() => { void act(() => online.startRound(room.code, nextDare(), true)); }} className={`${primaryBtn} mb-2.5`}><ArrowCounterClockwise size={18} weight="bold" /> Play again, same group</button>
              <button type="button" disabled={busy} onClick={() => void act(() => online.toLobby(room.code))} className={ghostBtn}><UsersThree size={16} weight="bold" /> Back to the lobby</button>
            </>
          ) : waiting(`Waiting for ${hostName} to pick what is next…`)}
        </div>
      )}

      {phase !== 'lobby' && (
        <button type="button" onClick={() => void leave()} className="mt-4 w-full text-[11px] font-semibold text-cream/55 hover:text-cream transition-colors">Leave game</button>
      )}
    </div>
  );
}
