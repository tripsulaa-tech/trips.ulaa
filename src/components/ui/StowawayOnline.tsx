import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Play, ArrowRight, ArrowCounterClockwise, ShareNetwork, SpeakerHigh, SpeakerSlash, Trophy, Plus, Minus, X,
  Ticket, Airplane, Eye, EyeSlash, Sparkle, Lightning, Crown, Skull, CheckCircle, XCircle, MagicWand,
  Gift, Question, Copy, LockSimple, LockSimpleOpen, WifiSlash, DeviceMobile, Hash, UsersThree,
} from '@phosphor-icons/react';
import { SITE_HOST } from '../../constants/site';
import { getWhatsAppLink } from '../../utils/utils-index';
import { WhatsAppIcon } from '../icons/WhatsAppIcon';
import { buildScoreCard } from './packBagScoreCard';
import { useSynth } from './gameAudio';
import { Confetti, TimerRing } from './gameParts';
import {
  GOLD_GRAD_TEXT, primaryBtn, ghostBtn, iconBtn, glass, eyebrow, shareCardImage, cleanName,
  loadPlayerName, savePlayerName, MAX_NAME,
} from './gameUi';
import { LEVELS, CATEGORY_LABEL, CHALLENGES } from './stowawayWords';
import type { Category, Level } from './stowawayWords';
import {
  MIN_PLAYERS, MAX_PLAYERS, POINTS, maxLost, rolesValid, recommendedRoles, clampRoles, computeAwards,
  drawChallenge, drawDare,
} from './stowawayEngine';
import type { PlayerStats, Role } from './stowawayEngine';
import {
  online, OnlineError, joinLink, normalizeCode, loadOnlineSession, saveOnlineSession, clearOnlineSession,
} from './stowawayRoomApi';
import type { OnlinePhase } from './stowawayRoomApi';
import { useOnlineRoom } from './useOnlineRoom';
import { useStowawayContentSync } from './useGameContentSync';

// "Stowaway" online: every player uses their own phone. The rules and secrets
// live in Supabase (see add_stowaway_online.sql); this file is only the screens.
// Clues are spoken aloud (in person or on a call). The phone handles the secret
// word, the shared timer, private voting and the scores.

const MUTE_KEY = 'ulaa:packbag:muted'; // one sound setting for all the games
const SPEAK_SECONDS = 15;

const ROLE_LABEL: Record<Role, string> = { explorer: 'Explorer', stowaway: 'Stowaway', lost: 'Lost Soul' };
const ROLE_TONE: Record<Role, string> = {
  explorer: 'from-emerald-300 to-emerald-500 text-emerald-950',
  stowaway: 'from-[#F0CE7A] to-gold text-dark',
  lost: 'from-rose-300 to-rose-500 text-rose-950',
};

const inputCls = 'w-full rounded-xl bg-white/[0.07] border border-white/15 focus:border-[#F0CE7A]/70 focus:bg-white/10 px-3 py-2.5 text-[15px] font-semibold text-white placeholder:text-cream/30 outline-none transition-colors';
const stepBtn = 'w-9 h-9 rounded-full bg-white/10 border border-white/15 text-cream flex items-center justify-center hover:bg-white/15 active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition';

interface Audio {
  play: ReturnType<typeof useSynth>['play'];
  ensure: () => void;
  muted: boolean;
  toggleMute: () => void;
}

interface StowawayOnlineProps {
  tripTitle: string;
  /** A code from a join link: opens the "Join" form with it filled in. */
  initialCode?: string;
  /** Leaves the online screens (back to the game's start screen). */
  onExit: () => void;
}

// ───────────────────────────── Entry: host or join ─────────────────────────────

export default function StowawayOnline({ tripTitle, initialCode, onExit }: StowawayOnlineProps) {
  useStowawayContentSync();
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
          <p className="text-sm text-cream/60 mt-1 mb-4 px-4">Everyone uses their own phone. Clues are spoken aloud, in person or on a call. Your word stays private on your screen.</p>
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
              <label className={`${eyebrow} block mb-1.5`} htmlFor="stowaway-code">Room code</label>
              <input
                id="stowaway-code"
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
          <label className={`${eyebrow} block mb-1.5`} htmlFor="stowaway-name">Your name</label>
          <input
            id="stowaway-name"
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

function BoardingPass({ name, seat, word, tripTitle, holding }: {
  name: string; seat: string | null; word: string | null; tripTitle: string; holding: boolean;
}) {
  return (
    <div className="mx-auto max-w-[19rem] select-none">
      <div className="rounded-3xl bg-gradient-to-br from-[#FFF6DD] to-[#F0CE7A] text-dark shadow-[0_18px_40px_rgba(0,0,0,0.45)] overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <span className="font-display text-sm font-extrabold tracking-wider text-primary-dark">ULAA AIR</span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-dark/60">{tripTitle.length > 20 ? `${tripTitle.slice(0, 19)}…` : tripTitle}</span>
        </div>
        <div className="px-4 pb-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-dark/50">Passenger</p>
          <p className="font-display text-xl font-extrabold leading-tight">{name}</p>
        </div>
        <div className="relative border-t-2 border-dashed border-dark/25 px-4 py-4 bg-white/40 text-center min-h-[7.5rem] flex flex-col items-center justify-center">
          <span className="absolute -left-3 -top-3 w-6 h-6 rounded-full bg-footer" aria-hidden="true" />
          <span className="absolute -right-3 -top-3 w-6 h-6 rounded-full bg-footer" aria-hidden="true" />
          <AnimatePresence mode="wait">
            {holding ? (
              <motion.div key="word" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-dark/50">Your destination</p>
                {word
                  ? <p className="font-display text-3xl font-extrabold text-primary-dark leading-tight break-words">{word}</p>
                  : <>
                      <p className="font-display text-3xl font-extrabold text-rose-700 leading-tight">No destination</p>
                      <p className="text-sm font-bold text-dark/70 mt-1">Blend in.</p>
                    </>}
              </motion.div>
            ) : (
              <motion.div key="hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-1 text-dark/60">
                <EyeSlash size={28} weight="duotone" />
                <p className="text-sm font-bold">Hidden</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="flex items-center justify-between px-4 py-2.5 bg-dark/90 text-cream">
          <span className="text-[10px] font-bold uppercase tracking-widest text-cream/60">Seat</span>
          <span className="font-display text-lg font-extrabold text-[#F0CE7A] tabular-nums">{seat ?? '-'}</span>
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

// ───────────────────────────── The room ─────────────────────────────

function Room({ code, audio, onLeft, onExit }: { code: string; audio: Audio; onLeft: () => void; onExit: () => void }) {
  const reduce = useReducedMotion();
  const { play, ensure, muted, toggleMute } = audio;
  const { state, problem, offline, refresh, serverNow } = useOnlineRoom(code);

  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [holding, setHolding] = useState(false);
  const [seenRound, setSeenRound] = useState(0);
  const [pick, setPick] = useState<{ key: string; id: string } | null>(null);
  const [guessDraft, setGuessDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [nowMs, setNowMs] = useState(0);
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

  // ── Sounds when the phase changes ──
  const prevPhase = useRef<OnlinePhase | null>(null);
  const outcome = room?.outcome ?? null;
  useEffect(() => {
    if (!phase) return;
    const was = prevPhase.current;
    prevPhase.current = phase;
    if (!was || was === phase) return;
    if (phase === 'clues') play('go');
    else if (phase === 'vote') play('flip');
    else if (phase === 'offboard') play('power');
    else if (phase === 'guess') play('bad');
    else if (phase === 'roundEnd') play(outcome === 'explorers' ? 'win' : 'gold');
    else if (phase === 'final') play('win');
    try { navigator.vibrate?.(phase === 'offboard' ? [30, 40, 30] : 20); } catch { /* no haptics */ }
  }, [phase, outcome, play]);

  // ── Shared speaking timer (server time, so every screen agrees) ──
  const startedAt = room?.timer_started_at ? Date.parse(room.timer_started_at) : null;
  useEffect(() => {
    if (!startedAt) return;
    const tick = () => setNowMs(serverNow());
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [startedAt, serverNow]);
  const secondsLeft = startedAt && nowMs > 0
    ? Math.max(0, Math.min(SPEAK_SECONDS, Math.ceil(SPEAK_SECONDS - (nowMs - startedAt) / 1000)))
    : SPEAK_SECONDS;
  useEffect(() => {
    if (!startedAt) return;
    if (secondsLeft > 0 && secondsLeft <= 5) play('tick');
    if (secondsLeft === 0) { play('miss'); try { navigator.vibrate?.(120); } catch { /* no haptics */ } }
  }, [secondsLeft, startedAt, play]);

  // ── After the offboard reveal, any phone nudges the game on (first one wins) ──
  useEffect(() => {
    if (phase !== 'offboard') return;
    const call = () => { void online.afterReveal(code).then(refresh).catch(() => undefined); };
    let repeat: number | undefined;
    const first = window.setTimeout(() => { call(); repeat = window.setInterval(call, 2500); }, 4300);
    return () => { window.clearTimeout(first); if (repeat) window.clearInterval(repeat); };
  }, [phase, code, refresh]);

  // ── Things that need the word and role ──
  const seen = !!room && seenRound === room.round_no;
  const names = useMemo(() => players.map(p => p.name), [players]);

  const stats = useMemo(() => {
    const out: Record<string, PlayerStats> = {};
    players.forEach(p => {
      out[p.name] = { points: p.points, survivedAsStowaway: p.survived, correctVotes: p.correct_votes, wrongVotes: p.wrong_votes, lostWins: p.lost_wins };
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
  const link = joinLink(room.code);
  const shareText = `Join my Stowaway game on Ulaa! Room code ${room.code}. Tap to join: ${link}`;
  const n = players.length;
  const sRaw = state.counts?.stowaways ?? 1;
  const lRaw = state.counts?.lost ?? 0;
  const eff = n >= MIN_PLAYERS ? clampRoles(n, sRaw, lRaw) : { stowaways: sRaw, lost: lRaw };
  const validRoles = n >= MIN_PLAYERS && rolesValid(n, eff.stowaways, eff.lost);
  const explorers = n - eff.stowaways - eff.lost;

  const saveSettings = (patch: Partial<{ stowaways: number; lost: number; level: Level; hideCounts: boolean; challenges: boolean; dares: boolean }>) =>
    act(() => online.setSettings(room.code, {
      stowaways: eff.stowaways, lost: eff.lost, level: room.level, hideCounts: room.hide_counts,
      challenges: room.challenges, dares: room.dares, ...patch,
    }));

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(`${shareText}`); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }
    catch { flash('Could not copy. Share the code instead.'); }
  };

  const nextRoundArgs = (): [string | null, string | null] => [
    room.challenges ? drawChallenge().id : null,
    room.dares ? drawDare() : null,
  ];

  const roleName = (r?: Role | null) => (r ? ROLE_LABEL[r] : '');
  const speakerId = room.turn_order[room.turn_pos];
  const speaker = speakerId ? byId.get(speakerId) : undefined;
  const isMyTurn = !!speakerId && speakerId === me.id;
  const canControl = isMyTurn || isHost;
  const alivePlayers = players.filter(p => p.alive);
  const challenge = room.challenge_id ? CHALLENGES.find(c => c.id === room.challenge_id) : undefined;
  const countLine = room.hide_counts || !state.counts
    ? `${alivePlayers.length} travellers aboard. Roles are secret.`
    : `${state.counts.explorers} Explorers, ${state.counts.stowaways} Stowaway${state.counts.stowaways === 1 ? '' : 's'}${state.counts.lost ? `, ${state.counts.lost} Lost Soul${state.counts.lost === 1 ? '' : 's'}` : ''}`;

  const voteKey = `${room.round_no}-${room.stop_no}-${room.last_result?.tie ? 't' : 'n'}`;
  const pickId = pick?.key === voteKey ? pick.id : null;
  const out = room.out_player ? byId.get(room.out_player) : undefined;
  const iAmOut = !!out && out.id === me.id;
  const summary = room.round_summary;

  const hostBanner = !isHost && state.host_away && (
    <div className="rounded-2xl bg-rose-400/10 border border-rose-300/30 px-3 py-2.5 mb-3 text-left">
      <p className="text-xs text-rose-100"><WifiSlash size={13} weight="bold" className="inline -mt-0.5 mr-1" />{hostName} seems to be away, so the game is paused.</p>
      <button type="button" onClick={() => void act(() => online.claimHost(room.code))} className="mt-1.5 text-xs font-bold text-[#F0CE7A] hover:text-white transition-colors">Take over as host</button>
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

      {/* ── Lobby ── */}
      {phase === 'lobby' && (
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

          <div className="flex items-center justify-between mb-1.5">
            <p className={eyebrow}>Travellers</p>
            <span className="text-xs text-cream/50 tabular-nums">{n} of {MIN_PLAYERS}–{MAX_PLAYERS}</span>
          </div>
          <ul className={`${glass} divide-y divide-white/10 mb-3`}>
            {players.map(p => (
              <li key={p.id} className="flex items-center gap-2.5 px-3 py-2">
                <span className={`w-2 h-2 rounded-full shrink-0 ${p.away ? 'bg-cream/25' : 'bg-emerald-400'}`} aria-hidden="true" />
                <span className="flex-1 min-w-0 text-sm font-bold text-white truncate">{p.name}{p.id === me.id && <span className="ml-1.5 text-[10px] font-semibold text-cream/40">you</span>}</span>
                {p.id === room.host_id && <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#F0CE7A]"><Crown size={12} weight="fill" /> Host</span>}
                {isHost && p.id !== me.id && (
                  <button type="button" onClick={() => void act(() => online.kick(room.code, p.id))} className="w-7 h-7 rounded-full text-cream/40 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors" aria-label={`Remove ${p.name}`}>
                    <X size={13} weight="bold" />
                  </button>
                )}
              </li>
            ))}
          </ul>

          {isHost ? (
            <>
              <button type="button" onClick={() => void act(() => online.setLocked(room.code, !room.locked))} className={`${ghostBtn} !py-2.5 !text-sm mb-4`} aria-pressed={room.locked}>
                {room.locked ? <><LockSimple size={16} weight="fill" /> Room locked. Tap to unlock</> : <><LockSimpleOpen size={16} weight="bold" /> Lock the room when everyone is in</>}
              </button>

              <div className="flex items-center justify-between mb-2">
                <h3 className="font-display text-lg font-extrabold text-white">Pick the roles</h3>
                <button type="button" disabled={n < MIN_PLAYERS} onClick={() => { const r = recommendedRoles(n); void saveSettings({ stowaways: r.stowaways, lost: r.lost }); }} className="inline-flex items-center gap-1 rounded-full bg-gold/15 border border-gold/30 text-[#F0CE7A] text-[11px] font-bold px-2.5 py-1 hover:bg-gold/25 disabled:opacity-40 transition-colors">
                  <MagicWand size={12} weight="fill" /> Recommended
                </button>
              </div>
              <div className={`${glass} divide-y divide-white/10 mb-2`}>
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <span className="w-8 h-8 rounded-lg bg-emerald-400/20 text-emerald-300 flex items-center justify-center"><Eye size={16} weight="duotone" /></span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white leading-tight">Explorers</p>
                    <p className="text-[11px] text-cream/50">Same word. Always the majority.</p>
                  </div>
                  <span className="font-display text-xl font-extrabold text-white tabular-nums w-8 text-center">{n >= MIN_PLAYERS ? explorers : '-'}</span>
                </div>
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <span className="w-8 h-8 rounded-lg bg-gold/20 text-[#F0CE7A] flex items-center justify-center"><Ticket size={16} weight="duotone" /></span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white leading-tight">Stowaways</p>
                    <p className="text-[11px] text-cream/50">A similar but different word.</p>
                  </div>
                  <button type="button" className={stepBtn} aria-label="Fewer Stowaways" disabled={busy || n < MIN_PLAYERS || eff.stowaways <= 1} onClick={() => void saveSettings({ stowaways: eff.stowaways - 1 })}><Minus size={14} weight="bold" /></button>
                  <span className="font-display text-xl font-extrabold text-white tabular-nums w-6 text-center">{eff.stowaways}</span>
                  <button type="button" className={stepBtn} aria-label="More Stowaways" disabled={busy || n < MIN_PLAYERS || !rolesValid(n, eff.stowaways + 1, eff.lost)} onClick={() => void saveSettings({ stowaways: eff.stowaways + 1 })}><Plus size={14} weight="bold" /></button>
                </div>
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <span className="w-8 h-8 rounded-lg bg-rose-400/20 text-rose-300 flex items-center justify-center"><Question size={16} weight="duotone" /></span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white leading-tight">Lost Soul</p>
                    <p className="text-[11px] text-cream/50">No word at all. Blends in.</p>
                  </div>
                  <button type="button" className={stepBtn} aria-label="Fewer Lost Souls" disabled={busy || n < MIN_PLAYERS || eff.lost <= 0} onClick={() => void saveSettings({ lost: eff.lost - 1 })}><Minus size={14} weight="bold" /></button>
                  <span className="font-display text-xl font-extrabold text-white tabular-nums w-6 text-center">{eff.lost}</span>
                  <button type="button" className={stepBtn} aria-label="More Lost Souls" disabled={busy || n < MIN_PLAYERS || eff.lost >= maxLost(n) || !rolesValid(n, eff.stowaways, eff.lost + 1)} onClick={() => void saveSettings({ lost: eff.lost + 1 })}><Plus size={14} weight="bold" /></button>
                </div>
              </div>
              {n < MIN_PLAYERS && <p className="text-xs text-[#F0CE7A] mb-2">Waiting for at least {MIN_PLAYERS} travellers.</p>}

              <h3 className="font-display text-lg font-extrabold text-white mt-4 mb-2">How tricky?</h3>
              <div className="grid grid-cols-3 gap-1.5 mb-1" role="radiogroup" aria-label="Difficulty">
                {LEVELS.map(l => (
                  <button key={l.id} type="button" role="radio" aria-checked={room.level === l.id} disabled={busy} onClick={() => void saveSettings({ level: l.id })}
                    className={`rounded-xl border py-2 text-sm font-bold transition-colors ${room.level === l.id ? 'bg-gradient-to-b from-primary-light to-primary border-transparent text-white' : 'bg-white/[0.06] border-white/10 text-cream/70 hover:bg-white/10'}`}>{l.label}</button>
                ))}
              </div>
              <p className="text-[11px] text-cream/50 mb-4">{LEVELS.find(l => l.id === room.level)?.hint}.</p>

              <div className={`${glass} divide-y divide-white/10 mb-4`}>
                <Toggle on={room.hide_counts} onChange={v => void saveSettings({ hideCounts: v })} disabled={busy} title="Hide the counts" desc="Only you can see the role split. Nobody else knows if a Lost Soul exists." />
                <Toggle on={room.challenges} onChange={v => void saveSettings({ challenges: v })} disabled={busy} title="Clue challenge cards" desc="A twist on how everyone gives a clue each round." />
                <Toggle on={room.dares} onChange={v => void saveSettings({ dares: v })} disabled={busy} title="Trip dares" desc="The losing side gets a silly dare." />
              </div>

              <button type="button" disabled={busy || !validRoles} onClick={() => { const [c, d] = nextRoundArgs(); void act(() => online.startRound(room.code, c, d, false)); }} className={`${primaryBtn} disabled:opacity-50 disabled:pointer-events-none`}>
                <Play size={18} weight="fill" /> Deal boarding passes
              </button>
            </>
          ) : (
            <div className={`${glass} px-3 py-3 mb-3 text-sm text-cream/70`}>
              <p className="font-bold text-white mb-1">Game settings</p>
              <p>{LEVELS.find(l => l.id === room.level)?.label} words{room.hide_counts ? ', hidden role counts' : state.counts ? `, ${state.counts.explorers} Explorers, ${state.counts.stowaways} Stowaway${state.counts.stowaways === 1 ? '' : 's'}${state.counts.lost ? `, ${state.counts.lost} Lost Soul` : ''}` : ''}.</p>
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
          <BoardingPass name={meP?.name ?? ''} seat={meP?.seat ?? null} word={me.word} tripTitle={room.trip_title} holding={holding} />
          <HoldButton
            holding={holding}
            onChange={v => { setHolding(v); if (v) { setSeenRound(room.round_no); play('flip'); try { navigator.vibrate?.(20); } catch { /* no haptics */ } } }}
            className="mt-5"
          />
          {!meP?.ready ? (
            <button type="button" disabled={!seen || holding || busy} onClick={() => void act(() => online.ready(room.code))} className={`${primaryBtn} mt-3 disabled:opacity-40 disabled:pointer-events-none`}>
              Hidden. I am ready <ArrowRight size={16} weight="bold" />
            </button>
          ) : (
            <p className="mt-3 text-sm font-bold text-emerald-300"><CheckCircle size={16} weight="fill" className="inline -mt-0.5 mr-1" />You are ready</p>
          )}
          <p className="mt-2 text-[11px] text-cream/40">Only you can see this. Look away from other screens.</p>

          <ul className="flex flex-wrap justify-center gap-1.5 mt-4" aria-label="Who is ready">
            {players.map(p => (
              <li key={p.id} className={`rounded-full px-2.5 py-1 text-[11px] font-bold border ${p.ready ? 'bg-emerald-400/15 border-emerald-300/40 text-emerald-200' : 'bg-white/[0.06] border-white/15 text-cream/60'}`}>
                {p.ready && <CheckCircle size={11} weight="fill" className="inline -mt-0.5 mr-1" />}{p.name}
              </li>
            ))}
          </ul>
          {isHost
            ? <button type="button" disabled={busy} onClick={() => void act(() => online.beginClues(room.code))} className={`${players.every(p => p.ready) ? primaryBtn : ghostBtn} mt-4`}>
                {players.every(p => p.ready) ? 'Everyone has boarded. Start' : `Start anyway (${players.filter(p => p.ready).length} of ${n} ready)`} <ArrowRight size={16} weight="bold" />
              </button>
            : <div className="mt-3">{waiting(players.every(p => p.ready) ? `Waiting for ${hostName} to start…` : 'Waiting for everyone to get ready…')}</div>}
        </div>
      )}

      {/* ── Clues ── */}
      {phase === 'clues' && (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <div className={`${glass} flex-1 px-3.5 py-2`}>
              <p className={eyebrow}>Round {room.round_no} · Stop {room.stop_no}</p>
              <p className="text-xs text-cream/70 leading-snug mt-0.5">{countLine}</p>
            </div>
            <TimerRing secondsLeft={secondsLeft} progress={startedAt ? 1 - secondsLeft / SPEAK_SECONDS : 0} lowAt={5} />
          </div>

          {room.challenges && challenge && (
            <div className="rounded-2xl bg-gradient-to-br from-primary/40 to-secondary/25 border border-gold/30 px-3.5 py-2.5 mb-3">
              <p className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#F0CE7A]"><Sparkle size={11} weight="fill" /> Clue challenge</p>
              <p className="font-display text-base font-extrabold text-white leading-tight">{challenge.title}</p>
              <p className="text-xs text-cream/70">{challenge.text}</p>
            </div>
          )}

          <motion.div key={`${room.stop_no}-${room.turn_pos}`} initial={reduce ? false : { scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`${glass} text-center py-5 mb-3 ${isMyTurn ? '!border-[#F0CE7A]/60 !bg-gold/10' : ''}`}>
            <p className={eyebrow}>{isMyTurn ? 'Your turn' : room.turn_pos === 0 ? 'Starts the round' : 'Now speaking'}</p>
            <p className={`font-display text-3xl font-extrabold leading-tight ${GOLD_GRAD_TEXT}`}>{isMyTurn ? 'You' : speaker?.name ?? '...'}</p>
            <p className="text-xs text-cream/50 mt-1">{isMyTurn ? 'Say one clue out loud. Do not say your word.' : 'One clue. Listen closely.'}</p>
          </motion.div>

          <ol className="flex flex-wrap gap-1.5 mb-4" aria-label="Speaking order">
            {room.turn_order.map((id, k) => (
              <li key={id} className={`rounded-full px-2.5 py-1 text-[11px] font-bold border ${k === room.turn_pos ? 'bg-gold/25 border-gold/60 text-[#F0CE7A]' : k < room.turn_pos ? 'bg-white/[0.04] border-white/10 text-cream/35 line-through' : 'bg-white/[0.07] border-white/15 text-cream/70'}`}>{byId.get(id)?.name ?? '...'}</li>
            ))}
          </ol>

          {canControl ? (
            <div className="flex gap-2">
              {!startedAt
                ? <button type="button" disabled={busy} onClick={() => void act(() => online.timer(room.code, true))} className={`${ghostBtn} !w-auto px-5`}><Lightning size={16} weight="fill" /> Timer</button>
                : <button type="button" disabled={busy} onClick={() => void act(() => online.timer(room.code, false))} className={`${ghostBtn} !w-auto px-5`}>Reset</button>}
              <button type="button" disabled={busy} onClick={() => void act(() => online.nextSpeaker(room.code, room.turn_pos))} className={primaryBtn}>
                {isMyTurn ? 'I gave my clue' : 'Next speaker'} <ArrowRight size={16} weight="bold" />
              </button>
            </div>
          ) : waiting(`${speaker?.name ?? 'Someone'} is speaking…`)}

          {meP?.alive && me.role !== null && (
            <div className="mt-3">
              <HoldButton holding={holding} onChange={v => { setHolding(v); if (v) play('flip'); }} label="Hold to peek at my word" className="!py-2.5 !text-sm" />
              <AnimatePresence>
                {holding && (
                  <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-2 text-center font-display text-2xl font-extrabold text-[#F0CE7A]">
                    {me.word ?? 'No destination. Blend in.'}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          )}
          {!meP?.alive && waiting('You are offboard. Keep watching.')}
          {isHost && room.turn_pos + 1 < room.turn_order.length && (
            <button type="button" disabled={busy} onClick={() => void act(() => online.skipToVote(room.code))} className="mt-3 w-full text-xs font-semibold text-cream/50 hover:text-cream transition-colors">Skip to the vote</button>
          )}
        </div>
      )}

      {/* ── Vote ── */}
      {phase === 'vote' && (
        <div>
          <div className="mb-3">
            <p className={eyebrow}>Round {room.round_no} · Stop {room.stop_no}</p>
            <h2 className="font-display text-2xl font-extrabold text-white leading-tight">Who goes offboard?</h2>
            <p className="text-xs text-cream/60">Votes are private. Everyone's votes are revealed together.</p>
          </div>

          {room.last_result?.tie && (
            <div className="rounded-2xl bg-gradient-to-br from-primary/40 to-secondary/25 border border-gold/30 px-3.5 py-2.5 mb-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#F0CE7A]">It was a tie</p>
              <p className="text-sm font-bold text-white">{(room.last_result.names ?? []).join(' and ')} got the same number of votes. Talk again, then vote again.</p>
            </div>
          )}

          {meP?.alive ? (
            <>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {alivePlayers.filter(p => p.id !== me.id).map(p => (
                  <button key={p.id} type="button" aria-pressed={pickId === p.id} onClick={() => { setPick({ key: voteKey, id: p.id }); play('flip'); }}
                    className={`rounded-2xl border px-3 py-3 text-left transition ${pickId === p.id ? 'bg-gradient-to-br from-primary-light to-primary border-transparent text-white shadow-[0_8px_20px_rgba(168,90,42,0.5)]' : 'bg-white/[0.06] border-white/10 text-cream hover:bg-white/10'}`}>
                    <span className="block font-display text-base font-extrabold leading-tight truncate">{p.name}</span>
                    <span className="block text-[10px] uppercase tracking-wider opacity-60">Seat {p.seat}</span>
                  </button>
                ))}
              </div>
              <button type="button" disabled={!pickId || busy} onClick={() => { if (pickId) void act(() => online.vote(room.code, pickId)); }} className={`${primaryBtn} disabled:opacity-40 disabled:pointer-events-none`}>
                <Airplane size={18} weight="fill" /> {meP.voted ? 'Change my vote' : pickId ? `Lock vote for ${byId.get(pickId)?.name ?? ''}` : 'Pick someone'}
              </button>
              {meP.voted && <p className="mt-2 text-center text-xs font-bold text-emerald-300"><CheckCircle size={14} weight="fill" className="inline -mt-0.5 mr-1" />Your vote is in</p>}
            </>
          ) : waiting('You are offboard, so you cannot vote. Watch the others decide.')}

          <p className={`${eyebrow} mt-4 mb-1.5`}>{alivePlayers.filter(p => p.voted).length} of {alivePlayers.length} voted</p>
          <ul className="flex flex-wrap gap-1.5">
            {alivePlayers.map(p => (
              <li key={p.id} className={`rounded-full px-2.5 py-1 text-[11px] font-bold border ${p.voted ? 'bg-emerald-400/15 border-emerald-300/40 text-emerald-200' : 'bg-white/[0.06] border-white/15 text-cream/60'}`}>
                {p.voted && <CheckCircle size={11} weight="fill" className="inline -mt-0.5 mr-1" />}{p.name}
              </li>
            ))}
          </ul>
          {isHost && alivePlayers.some(p => p.voted) && (
            <button type="button" disabled={busy} onClick={() => void act(() => online.resolveNow(room.code))} className={`${ghostBtn} mt-4`}>Reveal now with the votes so far</button>
          )}
        </div>
      )}

      {/* ── Offboard reveal ── */}
      {phase === 'offboard' && out && room.last_result?.role && (
        <div className="text-center pt-4 min-h-[22rem]">
          <p className={eyebrow}>Offboarding</p>
          <p className="font-display text-3xl font-extrabold text-white mt-1">{iAmOut ? 'You' : out.name}</p>
          <div className="relative h-24 mt-4 overflow-hidden" aria-hidden="true">
            <motion.div className="absolute top-1/2 -translate-y-1/2 text-[#F0CE7A]" initial={{ x: reduce ? 120 : -80, rotate: -10 }} animate={{ x: reduce ? 120 : 360, rotate: -10 }} transition={{ duration: reduce ? 0 : 1.6, ease: 'easeIn' }}>
              <Airplane size={52} weight="fill" />
            </motion.div>
          </div>
          <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: reduce ? 0 : 1, type: 'spring', stiffness: 240, damping: 14 }}
            className={`inline-block rounded-2xl bg-gradient-to-br ${ROLE_TONE[room.last_result.role]} px-6 py-3 shadow-[0_12px_30px_rgba(0,0,0,0.4)]`}>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-70">Was a</p>
            <p className="font-display text-3xl font-extrabold leading-tight">{roleName(room.last_result.role)}</p>
          </motion.div>

          {room.last_result.votes.length > 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduce ? 0 : 1.4 }} className="mt-5 text-left">
              <p className={`${eyebrow} mb-1.5 text-center`}>Who voted for whom</p>
              <ul className={`${glass} divide-y divide-white/10`}>
                {room.last_result.votes.map((v, i) => (
                  <li key={i} className="flex items-center gap-2 px-3 py-1.5 text-[13px]">
                    <span className="flex-1 min-w-0 font-bold text-white truncate">{v.from}</span>
                    <ArrowRight size={12} weight="bold" className="text-cream/40 shrink-0" />
                    <span className="flex-1 min-w-0 text-right font-bold text-[#F0CE7A] truncate">{v.to}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}
        </div>
      )}

      {/* ── Lost Soul's last chance ── */}
      {phase === 'guess' && out && (
        <div className="text-center pt-3">
          <motion.div initial={reduce ? false : { scale: 0.5, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 240, damping: 12 }}
            className="w-20 h-20 mx-auto mb-4 rounded-[28px] bg-gradient-to-br from-rose-300 to-rose-500 text-rose-950 flex items-center justify-center shadow-[0_14px_36px_rgba(244,63,94,0.4)]" aria-hidden="true">
            <Question size={46} weight="bold" />
          </motion.div>
          <span className="inline-block text-[10px] font-bold uppercase tracking-[0.2em] text-rose-200 bg-rose-400/15 border border-rose-300/30 rounded-full px-3 py-1 mb-2">Last chance</span>
          <h2 className="font-display text-3xl font-extrabold text-white leading-tight">{iAmOut ? 'You were the Lost Soul' : `${out.name} was the Lost Soul`}</h2>

          {iAmOut ? (
            room.guess_text ? (
              <>
                <p className="text-sm text-cream/65 mt-2 px-4">You guessed</p>
                <p className={`font-display text-3xl font-extrabold ${GOLD_GRAD_TEXT}`}>{room.guess_text}</p>
                {waiting('Waiting for the group to judge…')}
              </>
            ) : (
              <>
                <p className="text-sm text-cream/65 mt-2 mb-4 px-4">Guess the Explorers' word. One shot.</p>
                <input value={guessDraft} onChange={e => setGuessDraft(e.target.value.slice(0, 40))} onKeyDown={e => { if (e.key === 'Enter' && guessDraft.trim() && !busy) void act(() => online.submitGuess(room.code, guessDraft)); }} maxLength={40} placeholder="Type your guess" aria-label="Your guess" className={`${inputCls} text-center mb-3`} />
                <button type="button" disabled={!guessDraft.trim() || busy} onClick={() => void act(() => online.submitGuess(room.code, guessDraft))} className={`${primaryBtn} disabled:opacity-40 disabled:pointer-events-none`}>Send my guess</button>
              </>
            )
          ) : room.guess_text ? (
            <>
              <p className="text-sm text-cream/65 mt-2 px-4">{out.name} guessed</p>
              <p className={`font-display text-3xl font-extrabold ${GOLD_GRAD_TEXT}`}>{room.guess_text}</p>
              {room.guess_match && <p className="text-xs font-bold text-emerald-300 mt-1">That is an exact match with the Explorers' word.</p>}
              <p className="text-xs text-cream/45 my-3 px-4">Close enough counts. Spelling does not matter.</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" disabled={busy} onClick={() => void act(() => online.judgeGuess(room.code, false))} className={`${ghostBtn} !py-4`}><XCircle size={20} weight="fill" className="text-rose-300" /> Wrong</button>
                <button type="button" disabled={busy} onClick={() => void act(() => online.judgeGuess(room.code, true))} className={`${primaryBtn} !py-4`}><CheckCircle size={20} weight="fill" /> Correct</button>
              </div>
            </>
          ) : waiting(`Waiting for ${out.name} to type her guess…`)}
        </div>
      )}

      {/* ── Round end ── */}
      {phase === 'roundEnd' && summary && (
        <div className="text-center pt-1">
          {!reduce && <Confetti />}
          <span className="inline-block text-[10px] font-bold uppercase tracking-[0.2em] text-[#F0CE7A] bg-gold/15 border border-gold/30 rounded-full px-3 py-1 mb-2">Round {room.round_no} over</span>
          <h2 className={`font-display text-3xl font-extrabold leading-tight ${GOLD_GRAD_TEXT}`}>
            {summary.outcome === 'explorers' ? 'Explorers win!' : summary.outcome === 'stowaways' ? 'The Stowaways got away!' : 'The Lost Soul stole it!'}
          </h2>
          <p className="text-sm text-cream/60 mt-1 mb-3">
            {summary.outcome === 'explorers' ? 'Every sneaky traveller was offboarded.' : summary.outcome === 'stowaways' ? 'They blended in until the end.' : 'One lucky guess flipped the whole round.'}
          </p>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className={`${glass} py-2.5`}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-cream/50">Explorers had</p>
              <p className="font-display text-lg font-extrabold text-white leading-tight px-2">{summary.explorer_word}</p>
            </div>
            <div className={`${glass} py-2.5`}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-cream/50">Stowaways had</p>
              <p className="font-display text-lg font-extrabold text-[#F0CE7A] leading-tight px-2">{summary.stowaway_word}</p>
            </div>
          </div>
          <p className="text-[11px] text-cream/40 mb-3">{CATEGORY_LABEL[summary.category as Category] ?? summary.category}</p>

          <ul className={`${glass} text-left divide-y divide-white/10 mb-3`}>
            {[...summary.players].sort((x, y) => y.gained - x.gained).map(s => (
              <li key={s.id} className="flex items-center gap-2.5 px-3 py-2">
                <span className={`w-6 h-6 shrink-0 rounded-full bg-gradient-to-br ${ROLE_TONE[s.role]} flex items-center justify-center`} aria-hidden="true">
                  {s.role === 'explorer' ? <Eye size={13} weight="bold" /> : s.role === 'stowaway' ? <Ticket size={13} weight="bold" /> : <Skull size={13} weight="bold" />}
                </span>
                <span className="flex-1 min-w-0 text-sm font-bold text-white truncate">{byId.get(s.id)?.name ?? '...'}{s.id === me.id && <span className="ml-1.5 text-[10px] font-semibold text-cream/40">you</span>}</span>
                <span className="text-[11px] text-cream/50">{ROLE_LABEL[s.role]}</span>
                <span className={`w-9 text-right font-display font-extrabold tabular-nums ${s.gained > 0 ? 'text-emerald-300' : 'text-cream/30'}`}>+{s.gained}</span>
              </li>
            ))}
          </ul>

          {room.dare && (
            <div className="rounded-2xl bg-gradient-to-br from-primary/40 to-secondary/25 border border-gold/30 px-3.5 py-3 mb-3 text-left">
              <p className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#F0CE7A]"><Gift size={11} weight="fill" /> Trip dare for the {summary.outcome === 'explorers' ? 'Stowaways' : 'Explorers'}</p>
              <p className="text-sm font-bold text-white mt-0.5">{room.dare}</p>
            </div>
          )}

          <p className="text-[11px] text-cream/45 mb-3">Points: Explorers +{POINTS.explorerWin}, a surviving Stowaway +{POINTS.stowawaySurvive}, a Lost Soul steal +{POINTS.lostSteal}.</p>

          {isHost ? (
            <>
              <button type="button" disabled={busy} onClick={() => { const [c, d] = nextRoundArgs(); void act(() => online.startRound(room.code, c, d, false)); }} className={`${primaryBtn} mb-2.5`}><Play size={18} weight="fill" /> Play next round</button>
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
          <span className="inline-block text-[10px] font-bold uppercase tracking-[0.2em] text-[#F0CE7A] bg-gold/15 border border-gold/30 rounded-full px-3 py-1 mb-2">{room.round_no} round{room.round_no === 1 ? '' : 's'} played</span>
          <div className="w-16 h-16 mx-auto mb-2 rounded-[22px] bg-gradient-to-br from-[#F0CE7A] to-gold text-dark flex items-center justify-center shadow-[0_12px_30px_rgba(200,150,42,0.45)]" aria-hidden="true"><Crown size={36} weight="fill" /></div>
          <p className={eyebrow}>Champion</p>
          <p className={`font-display text-4xl font-extrabold leading-tight ${GOLD_GRAD_TEXT}`}>{ranking[0]?.name}</p>
          <p className="text-sm text-cream/60 mb-3">{ranking[0]?.points ?? 0} point{ranking[0]?.points === 1 ? '' : 's'}</p>

          <ol className={`${glass} text-left divide-y divide-white/10 mb-3`}>
            {ranking.map((p, i) => (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                <span className="w-5 text-center font-display font-extrabold text-cream/50 tabular-nums">{i + 1}</span>
                <span className="flex-1 min-w-0 text-sm font-bold text-white truncate">{p.name}</span>
                <span className="font-display text-lg font-extrabold text-[#F0CE7A] tabular-nums">{p.points}</span>
              </li>
            ))}
          </ol>

          {awards.length > 0 && (
            <div className="grid grid-cols-2 gap-2 mb-3">
              {awards.map(aw => (
                <div key={aw.id} className={`${glass} px-2.5 py-2.5`}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#F0CE7A]">{aw.title}</p>
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
                  title: top ? `${short(top.name, 14)} takes the trip` : 'Stowaway',
                  tripTitle: room.trip_title, host: SITE_HOST, best: top?.points ?? 0, isNewBest: false,
                  eyebrow: 'STOWAWAY  ·  GROUP GAME', unit: 'TOP SCORE', ringMax: Math.max(12, room.round_no * 4),
                  playerName: top?.name,
                  tiles: [
                    { v: String(room.round_no), l: 'ROUNDS' },
                    { v: String(n), l: 'TRAVELLERS' },
                    { v: bluffer ? short(bluffer.winner.split(' & ')[0], 8) : '-', l: 'BEST BLUFFER' },
                  ],
                });
              } catch { blob = null; }
              const text = `${top?.name ?? 'We'} won our game of Stowaway on Ulaa after ${room.round_no} round${room.round_no === 1 ? '' : 's'}! Play with your travel gang: ${link}`;
              await shareCardImage(blob, { filename: 'ulaa-stowaway.png', title: 'Stowaway', text, fallbackLink: getWhatsAppLink('', text) });
              setSharing(false);
            })();
          }}>
            <ShareNetwork size={16} weight="bold" /> {sharing ? 'Preparing…' : 'Share the result card'}
          </button>

          {isHost ? (
            <>
              <button type="button" disabled={busy} onClick={() => { const [c, d] = nextRoundArgs(); void act(() => online.startRound(room.code, c, d, true)); }} className={`${primaryBtn} mb-2.5`}><ArrowCounterClockwise size={18} weight="bold" /> Play again, same group</button>
              <button type="button" disabled={busy} onClick={() => void act(() => online.toLobby(room.code))} className={ghostBtn}><UsersThree size={16} weight="bold" /> Back to the lobby</button>
            </>
          ) : waiting(`Waiting for ${hostName} to pick what is next…`)}
        </div>
      )}

      {phase !== 'lobby' && (
        <button type="button" onClick={() => void leave()} className="mt-4 w-full text-[11px] font-semibold text-cream/35 hover:text-cream transition-colors">Leave game</button>
      )}
    </div>
  );
}
