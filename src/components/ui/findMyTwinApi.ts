// Find My Twin: the thin layer between the game screens and Supabase.
// All rules, answers and pairings live in the database
// (supabase/migration/add_find_my_twin.sql). This file only calls those
// functions, listens for live changes and remembers which room this device is
// sitting in. A phone only ever receives its OWN twin(s): other players'
// answers and scores never reach the browser. The room and player tables are
// private (supabase/migration/harden_find_my_twin.sql); live changes come from
// the tiny public `ftwin_signal` table instead.

import { supabase } from '../../services/supabase';
import { SITE_ORIGIN } from '../../constants/site';
import { deviceToken } from './stowawayRoomApi';

export type TwinPhase = 'lobby' | 'hunt' | 'roundEnd' | 'final';

interface TwinRoom {
  id: string;
  code: string;
  host_id: string | null;
  trip_title: string;
  phase: TwinPhase;
  locked: boolean;
  round_no: number;
  rev: number;
}

interface TwinPlayer {
  id: string;
  name: string;
  answered: boolean;
  away: boolean;
  connections: number;
}

export interface TwinEdge {
  id: string;
  partner_id: string;
  partner_name: string;
  score: number;
  me_found: boolean;
  partner_found: boolean;
  me_done: boolean;
  partner_done: boolean;
}

export interface TwinState {
  now: string;
  me: { id: string; answers: string | null };
  room: TwinRoom;
  players: TwinPlayer[];
  host_away: boolean;
  edges: TwinEdge[];
  progress: { done: number; total: number };
  history: Array<{ round: number; score: number; partner_name: string }>;
  all_pairs: Array<{ round: number; score: number; a_name: string; b_name: string }>;
}

const MESSAGES: Record<string, string> = {
  room_not_found: 'That room code was not found. Check it and try again.',
  room_locked: 'The host has locked this room.',
  game_started: 'That game has already started. Ask the host to open a new room.',
  room_full: 'This room is full (24 players).',
  name_required: 'Please type your name.',
  name_taken: 'Someone in this room already uses that name. Add an initial.',
  host_only: 'Only the host can do that.',
  not_in_room: 'You are not in this room any more.',
  wrong_phase: 'That is not possible right now.',
  need_more_players: 'You need at least 2 players.',
  waiting_for_answers: 'Everyone needs to answer the questions first.',
  bad_answers: 'Please answer all the questions.',
  too_many_rooms: 'Lots of games are running right now. Try again in a minute.',
  host_present: 'The host is still here.',
  name_not_listed: 'Please tap your name from the list.',
  nobody_away: 'Nobody looks away right now.',
};

export class TwinError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(MESSAGES[code] ?? 'Something went wrong. Please try again.');
    this.code = code;
  }
}

async function rpc<T = void>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new TwinError(error.message.trim());
  return data as T;
}

// ── The room this device is sitting in ──
const SESSION_KEY = 'ulaa:twin:online';

export function loadTwinSession(): { code: string } | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    const v = raw ? (JSON.parse(raw) as { code?: unknown }) : null;
    return v && typeof v.code === 'string' && /^[A-Z0-9]{4}$/.test(v.code) ? { code: v.code } : null;
  } catch { return null; }
}
export function saveTwinSession(code: string) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify({ code })); } catch { /* not remembered */ }
}
export function clearTwinSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

export const normalizeTwinCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);

/** The link people tap to join. The dev server uses its own origin so it can be tested. */
export function twinJoinLink(code: string): string {
  const origin = import.meta.env.DEV ? window.location.origin : SITE_ORIGIN;
  return `${origin}/play/twin/${code}`;
}

// ── Calls ──
const t = () => deviceToken();

export const twin = {
  /** `revealOnly`: skip the find-them-in-person hunt and show every twin straight away.
   *  `roster`: the names this room's players must pick from (leave out to let anyone type any name). */
  create: (name: string, tripTitle: string, roster?: string[], revealOnly?: boolean) =>
    rpc<{ code: string; player_id: string }>('ftwin_create_room', { p_name: name, p_token: t(), p_trip_title: tripTitle, p_roster: roster && roster.length > 0 ? roster : null, p_reveal_only: !!revealOnly }),
  /** The names a room allows, and which are already taken. `names` is empty for a room anyone can join. */
  roster: (code: string) =>
    rpc<{ exists: boolean; locked?: boolean; phase?: TwinPhase; names?: string[]; taken?: string[] }>('ftwin_roster', { p_code: code }),
  join: (code: string, name: string) =>
    rpc<{ code: string; player_id: string }>('ftwin_join', { p_code: code, p_name: name, p_token: t() }),
  state: (code: string) => rpc<TwinState>('ftwin_state', { p_code: code, p_token: t() }),
  submitAnswers: (code: string, answers: string) =>
    rpc('ftwin_submit_answers', { p_code: code, p_token: t(), p_answers: answers }),
  retake: (code: string) => rpc('ftwin_retake', { p_code: code, p_token: t() }),
  start: (code: string) => rpc('ftwin_start', { p_code: code, p_token: t() }),
  found: (code: string, edge: string) => rpc('ftwin_found', { p_code: code, p_token: t(), p_edge: edge }),
  done: (code: string, edge: string) => rpc('ftwin_done', { p_code: code, p_token: t(), p_edge: edge }),
  nextRound: (code: string, fromRound: number) =>
    rpc('ftwin_next_round', { p_code: code, p_token: t(), p_from_round: fromRound }),
  /** Skips unfinished pairs that include an away player. `force` skips every unfinished pair. */
  skipPending: (code: string, force = false) => rpc('ftwin_skip_pending', { p_code: code, p_token: t(), p_force: force }),
  endGame: (code: string) => rpc('ftwin_end_game', { p_code: code, p_token: t() }),
  toLobby: (code: string) => rpc('ftwin_to_lobby', { p_code: code, p_token: t() }),
  setLocked: (code: string, locked: boolean) => rpc('ftwin_set_locked', { p_code: code, p_token: t(), p_locked: locked }),
  kick: (code: string, player: string) => rpc('ftwin_kick', { p_code: code, p_token: t(), p_player: player }),
  leave: (code: string) => rpc('ftwin_leave', { p_code: code, p_token: t() }),
  claimHost: (code: string) => rpc('ftwin_claim_host', { p_code: code, p_token: t() }),
};

/** Calls `onChange` whenever the room or its players change. Returns an unsubscribe function.
 *  Every game action moves the room's counter in `ftwin_signal`; that is the only thing listened to. */
export function subscribeTwinRoom(roomId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`ftwin:${roomId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ftwin_signal', filter: `room_id=eq.${roomId}` }, onChange)
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}
