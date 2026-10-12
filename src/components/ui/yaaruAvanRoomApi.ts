// Stowaway online: the thin layer between the game screens and Supabase.
// All rules and secrets live in the database (supabase/migration/add_yaaru_avan_online.sql).
// This file only calls those functions, listens for live changes, and remembers
// which room this device is sitting in. Each phone only ever receives its OWN
// role and word: other players' words never reach the browser. The room and
// player tables are private (supabase/migration/fix_yaaru_avan_logic_and_privacy.sql);
// live changes come from the tiny public `yaaru_avan_signal` table instead.

import { supabase } from '../../services/supabase';
import { SITE_ORIGIN } from '../../constants/site';
import type { Role } from './yaaruAvanEngine';
import type { SpecialId } from './yaaruAvanSpecials';

export type OnlinePhase = 'lobby' | 'deal' | 'describe' | 'vote' | 'tiebreak' | 'offboard' | 'guess' | 'payback' | 'roundEnd' | 'final';
type OnlineOutcome = 'explorers' | 'stowaways' | 'lost-steal';

interface OnlineRoom {
  id: string;
  code: string;
  host_id: string | null;
  trip_title: string;
  phase: OnlinePhase;
  locked: boolean;
  level: 'easy' | 'medium' | 'hard';
  dares: boolean;
  hide_counts: boolean;
  specials: boolean;
  /** Which specials the host ticked. null = all of them. */
  special_ids: SpecialId[] | null;
  /** Description round: who speaks, in order, and whose turn it is (0-based). */
  describe_order: string[];
  describe_pos: number;
  /** Boomerang bounce: after the votes bounce, only these players can be voted for. */
  bounce?: string[] | null;
  round_no: number;
  stop_no: number;
  dare: string | null;
  out_player: string | null;
  offboard_at: string | null;
  guess_text: string | null;
  guess_match: boolean | null;
  outcome: OnlineOutcome | null;
  last_result: {
    tie: boolean;
    names?: string[];
    out?: string;
    role?: Role;
    /** The ability the player who left had (a Lucky Dip's drawn one), and whether it came from a Lucky Dip. */
    special?: SpecialId | null;
    dip?: boolean;
    /** Boomerang (Return Ticket): the vote against this player bounced; the name is theirs. */
    saved?: string;
    name?: string;
    /** Names of the players the votes bounced back onto. */
    bounce_names?: string[];
    /** Set when this exit is the landing of a Boomerang bounce: the Boomerang's id. */
    bounce_from?: string | null;
    /** Tied vote waiting for the Goddess of Justice (Trip Leader): her id and the tied players. */
    tiebreak?: boolean;
    leader?: string;
    tied?: string[];
    /** Lovers: the partner who left right after them. */
    lover?: string | null;
    /** Set when this exit came from a Payback by that player. */
    payback_by?: string;
    votes: Array<{ from: string; to: string }>;
  } | null;
  round_summary: {
    outcome: OnlineOutcome;
    explorer_word: string;
    stowaway_word: string;
    category: string;
    players: Array<{ id: string; role: Role; gained: number; bonus?: number; special?: SpecialId | null; dip?: boolean }>;
  } | null;
}

interface OnlinePlayer {
  id: string;
  name: string;
  seat: string | null;
  seat_idx: number;
  alive: boolean;
  voted: boolean;
  ready: boolean;
  points: number;
  survived: number;
  correct_votes: number;
  wrong_votes: number;
  lost_wins: number;
  away: boolean;
  /** Alive, or a Backseat Rider who is out: may vote. */
  voter: boolean;
  /** Only used by older rooms: all roles are secret now. */
  public_special: 'tripLeader' | 'driver' | null;
}

export interface OnlineState {
  now: string;
  me: {
    id: string; role: Role | null; word: string | null;
    /** The ability that applies to me (a Lucky Dip's drawn one). */
    special: SpecialId | null;
    /** True when `special` came from a Lucky Dip. */
    dip: boolean;
    /** Name of my Duelist or Lover. */
    partner: string | null;
    can_vote: boolean;
  };
  room: OnlineRoom;
  players: OnlinePlayer[];
  host_away: boolean;
  counts: { explorers: number; stowaways: number; lost: number } | null;
}

// ── Friendly messages for the errors the database raises ──
const MESSAGES: Record<string, string> = {
  room_not_found: 'That room code was not found. Check it and try again.',
  room_locked: 'The host has locked this room.',
  game_started: 'That game has already started. Ask the host to open the next lobby.',
  room_full: 'This room is full (15 players).',
  name_required: 'Please type your name.',
  host_only: 'Only the host can do that.',
  not_in_room: 'You are not in this room any more.',
  wrong_phase: 'That is not possible right now.',
  need_more_players: 'You need at least 3 players.',
  bad_roles: 'These roles do not work for this many players.',
  no_votes_yet: 'Nobody has voted yet.',
  game_closed: 'Online play is not open right now. Ask the Ulaa team to open it.',
  too_many_rooms: 'Lots of games are running right now. Try again in a minute.',
  host_present: 'The host is still here.',
  guess_required: 'Type your guess first.',
  no_guess_yet: 'Wait for the guess first.',
  already_guessed: 'You already sent your guess.',
  bad_target: 'You cannot pick that player.',
  not_your_turn: 'It is not your turn to speak.',
};

export class OnlineError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(MESSAGES[code] ?? 'Something went wrong. Please try again.');
    this.code = code;
  }
}

async function rpc<T = void>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new OnlineError(error.message.trim());
  return data as T;
}

// ── This device: a secret token + the room it is sitting in ──
const TOKEN_KEY = 'ulaa:stowaway:token';
const SESSION_KEY = 'ulaa:stowaway:online';

export function deviceToken(): string {
  try {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved) return saved;
  } catch { /* storage blocked */ }
  const fresh = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c =>
        (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16));
  try { localStorage.setItem(TOKEN_KEY, fresh); } catch { /* not remembered */ }
  return fresh;
}

export function loadOnlineSession(): { code: string } | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    const v = raw ? (JSON.parse(raw) as { code?: unknown }) : null;
    return v && typeof v.code === 'string' && /^[A-Z0-9]{4}$/.test(v.code) ? { code: v.code } : null;
  } catch { return null; }
}
export function saveOnlineSession(code: string) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify({ code })); } catch { /* not remembered */ }
}
export function clearOnlineSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

export const normalizeCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);

/** The link people tap to join. The dev server uses its own origin so it can be tested. */
export function joinLink(code: string): string {
  const origin = import.meta.env.DEV ? window.location.origin : SITE_ORIGIN;
  return `${origin}/play/stowaway/${code}`;
}

// ── Calls ──
const t = () => deviceToken();

export const online = {
  create: (name: string, tripTitle: string) =>
    rpc<{ code: string; player_id: string }>('yaaru_avan_create_room', { p_name: name, p_token: t(), p_trip_title: tripTitle }),
  peek: (code: string) =>
    rpc<{ exists: boolean; locked?: boolean; phase?: OnlinePhase; trip_title?: string; players?: number }>('yaaru_avan_peek', { p_code: code }),
  join: (code: string, name: string) =>
    rpc<{ code: string; player_id: string }>('yaaru_avan_join', { p_code: code, p_name: name, p_token: t() }),
  state: (code: string) => rpc<OnlineState>('yaaru_avan_state', { p_code: code, p_token: t() }),
  claimHost: (code: string) => rpc('yaaru_avan_claim_host', { p_code: code, p_token: t() }),
  setSettings: (code: string, s: { stowaways: number; lost: number; level: string; hideCounts: boolean; dares: boolean; specials: boolean; specialIds: SpecialId[] | null }) =>
    rpc('yaaru_avan_set_settings', {
      p_code: code, p_token: t(), p_stowaways: s.stowaways, p_lost: s.lost, p_level: s.level,
      p_hide_counts: s.hideCounts, p_dares: s.dares, p_specials: s.specials, p_special_ids: s.specialIds,
    }),
  setLocked: (code: string, locked: boolean) => rpc('yaaru_avan_set_locked', { p_code: code, p_token: t(), p_locked: locked }),
  kick: (code: string, player: string) => rpc('yaaru_avan_kick', { p_code: code, p_token: t(), p_player: player }),
  leave: (code: string) => rpc('yaaru_avan_leave', { p_code: code, p_token: t() }),
  startRound: (code: string, dare: string | null, reset = false) =>
    rpc('yaaru_avan_start_round', { p_code: code, p_token: t(), p_dare: dare, p_reset: reset }),
  ready: (code: string) => rpc('yaaru_avan_ready', { p_code: code, p_token: t() }),
  describeDone: (code: string, pos: number) => rpc('yaaru_avan_describe_done', { p_code: code, p_token: t(), p_pos: pos }),
  beginVote: (code: string) => rpc('yaaru_avan_begin_vote', { p_code: code, p_token: t() }),
  vote: (code: string, target: string) => rpc('yaaru_avan_cast_vote', { p_code: code, p_token: t(), p_target: target }),
  resolveNow: (code: string) => rpc('yaaru_avan_resolve_now', { p_code: code, p_token: t() }),
  afterReveal: (code: string) => rpc('yaaru_avan_after_reveal', { p_code: code, p_token: t() }),
  submitGuess: (code: string, text: string) => rpc('yaaru_avan_submit_guess', { p_code: code, p_token: t(), p_text: text }),
  judgeGuess: (code: string, correct: boolean) => rpc('yaaru_avan_judge_guess', { p_code: code, p_token: t(), p_correct: correct }),
  tiebreak: (code: string, pick: string) => rpc('yaaru_avan_tiebreak', { p_code: code, p_token: t(), p_pick: pick }),
  payback: (code: string, victim: string) => rpc('yaaru_avan_payback', { p_code: code, p_token: t(), p_victim: victim }),
  endGame: (code: string) => rpc('yaaru_avan_end_game', { p_code: code, p_token: t() }),
  toLobby: (code: string) => rpc('yaaru_avan_to_lobby', { p_code: code, p_token: t() }),
};

/** Calls `onChange` whenever the room or its players change. Returns an unsubscribe function.
 *  Every game action moves the room's counter in `yaaru_avan_signal`; that is the only thing listened to. */
export function subscribeRoom(roomId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`stowaway:${roomId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'yaaru_avan_signal', filter: `room_id=eq.${roomId}` }, onChange)
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}
