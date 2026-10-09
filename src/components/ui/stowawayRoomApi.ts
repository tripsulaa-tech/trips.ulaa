// Stowaway online: the thin layer between the game screens and Supabase.
// All rules and secrets live in the database (supabase/migration/add_stowaway_online.sql).
// This file only calls those functions, listens for live changes, and remembers
// which room this device is sitting in. Each phone only ever receives its OWN
// role and word: other players' words never reach the browser.

import { supabase } from '../../services/supabase';
import { SITE_ORIGIN } from '../../constants/site';
import type { Role } from './stowawayEngine';

export type OnlinePhase = 'lobby' | 'deal' | 'clues' | 'vote' | 'offboard' | 'guess' | 'roundEnd' | 'final';
type OnlineOutcome = 'explorers' | 'stowaways' | 'lost-steal';

interface OnlineRoom {
  id: string;
  code: string;
  host_id: string | null;
  trip_title: string;
  phase: OnlinePhase;
  locked: boolean;
  level: 'easy' | 'medium' | 'hard';
  challenges: boolean;
  dares: boolean;
  hide_counts: boolean;
  round_no: number;
  stop_no: number;
  turn_order: string[];
  turn_pos: number;
  timer_started_at: string | null;
  challenge_id: string | null;
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
    votes: Array<{ from: string; to: string }>;
  } | null;
  round_summary: {
    outcome: OnlineOutcome;
    explorer_word: string;
    stowaway_word: string;
    category: string;
    players: Array<{ id: string; role: Role; gained: number }>;
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
}

export interface OnlineState {
  now: string;
  me: { id: string; role: Role | null; word: string | null };
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
  not_your_turn: 'It is not your turn.',
  not_in_room: 'You are not in this room any more.',
  wrong_phase: 'That is not possible right now.',
  need_more_players: 'You need at least 3 players.',
  bad_roles: 'These roles do not work for this many players.',
  no_votes_yet: 'Nobody has voted yet.',
  too_many_rooms: 'Lots of games are running right now. Try again in a minute.',
  host_present: 'The host is still here.',
  guess_required: 'Type your guess first.',
  no_guess_yet: 'Wait for the guess first.',
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
    rpc<{ code: string; player_id: string }>('stowaway_create_room', { p_name: name, p_token: t(), p_trip_title: tripTitle }),
  peek: (code: string) =>
    rpc<{ exists: boolean; locked?: boolean; phase?: OnlinePhase; trip_title?: string; players?: number }>('stowaway_peek', { p_code: code }),
  join: (code: string, name: string) =>
    rpc<{ code: string; player_id: string }>('stowaway_join', { p_code: code, p_name: name, p_token: t() }),
  state: (code: string) => rpc<OnlineState>('stowaway_state', { p_code: code, p_token: t() }),
  claimHost: (code: string) => rpc('stowaway_claim_host', { p_code: code, p_token: t() }),
  setSettings: (code: string, s: { stowaways: number; lost: number; level: string; hideCounts: boolean; challenges: boolean; dares: boolean }) =>
    rpc('stowaway_set_settings', {
      p_code: code, p_token: t(), p_stowaways: s.stowaways, p_lost: s.lost, p_level: s.level,
      p_hide_counts: s.hideCounts, p_challenges: s.challenges, p_dares: s.dares,
    }),
  setLocked: (code: string, locked: boolean) => rpc('stowaway_set_locked', { p_code: code, p_token: t(), p_locked: locked }),
  kick: (code: string, player: string) => rpc('stowaway_kick', { p_code: code, p_token: t(), p_player: player }),
  leave: (code: string) => rpc('stowaway_leave', { p_code: code, p_token: t() }),
  startRound: (code: string, challenge: string | null, dare: string | null, reset = false) =>
    rpc('stowaway_start_round', { p_code: code, p_token: t(), p_challenge: challenge, p_dare: dare, p_reset: reset }),
  ready: (code: string) => rpc('stowaway_ready', { p_code: code, p_token: t() }),
  beginClues: (code: string) => rpc('stowaway_begin_clues', { p_code: code, p_token: t() }),
  timer: (code: string, running: boolean) => rpc('stowaway_timer', { p_code: code, p_token: t(), p_running: running }),
  nextSpeaker: (code: string, fromPos: number) =>
    rpc('stowaway_next_speaker', { p_code: code, p_token: t(), p_from_pos: fromPos }),
  skipToVote: (code: string) => rpc('stowaway_skip_to_vote', { p_code: code, p_token: t() }),
  vote: (code: string, target: string) => rpc('stowaway_cast_vote', { p_code: code, p_token: t(), p_target: target }),
  resolveNow: (code: string) => rpc('stowaway_resolve_now', { p_code: code, p_token: t() }),
  afterReveal: (code: string) => rpc('stowaway_after_reveal', { p_code: code, p_token: t() }),
  submitGuess: (code: string, text: string) => rpc('stowaway_submit_guess', { p_code: code, p_token: t(), p_text: text }),
  judgeGuess: (code: string, correct: boolean) => rpc('stowaway_judge_guess', { p_code: code, p_token: t(), p_correct: correct }),
  endGame: (code: string) => rpc('stowaway_end_game', { p_code: code, p_token: t() }),
  toLobby: (code: string) => rpc('stowaway_to_lobby', { p_code: code, p_token: t() }),
};

/** Calls `onChange` whenever the room or its players change. Returns an unsubscribe function. */
export function subscribeRoom(roomId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`stowaway:${roomId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'stowaway_rooms', filter: `id=eq.${roomId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'stowaway_players', filter: `room_id=eq.${roomId}` }, onChange)
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}
