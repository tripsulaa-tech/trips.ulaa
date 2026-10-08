import { useCallback, useEffect, useRef, useState } from 'react';
import { online, OnlineError, subscribeRoom } from './stowawayRoomApi';
import type { OnlineState } from './stowawayRoomApi';

// Keeps one phone in sync with its room:
//  * fetches the state (room, players, and ONLY this player's own secret),
//  * refetches the moment Supabase Realtime says something changed,
//  * polls every few seconds as a safety net (this is also the "I'm still here"
//    signal) and again when the phone wakes up or comes back online,
//  * remembers the gap between the server clock and this phone's clock, so the
//    speaking timer is the same on every screen.

const POLL_MS = 6000;

export type RoomProblem = 'gone' | null;

export function useOnlineRoom(code: string | null) {
  const [state, setState] = useState<OnlineState | null>(null);
  const [problem, setProblem] = useState<RoomProblem>(null);
  const [offline, setOffline] = useState(false);
  const offsetRef = useRef(0);
  const seqRef = useRef(0);
  const debounceRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!code) return;
    const seq = ++seqRef.current;
    try {
      const s = await online.state(code);
      if (seq < seqRef.current - 3) return; // a much newer answer already arrived
      offsetRef.current = Date.parse(s.now) - Date.now();
      setState(s);
      setOffline(false);
      setProblem(null);
    } catch (e) {
      if (e instanceof OnlineError && (e.code === 'not_in_room' || e.code === 'room_not_found')) {
        setProblem('gone');
      } else {
        setOffline(true);
      }
    }
  }, [code]);

  const serverNow = useCallback(() => Date.now() + offsetRef.current, []);

  // First load, polling, wake-up and reconnect.
  useEffect(() => {
    if (!code) return;
    const first = window.setTimeout(() => { void refresh(); }, 0);
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, POLL_MS);
    const wake = () => { if (document.visibilityState === 'visible') void refresh(); };
    const back = () => { void refresh(); };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', back);
    window.addEventListener('focus', wake);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', back);
      window.removeEventListener('focus', wake);
    };
  }, [code, refresh]);

  // Live updates. Several rows often change at once (e.g. dealing a round), so
  // bursts are merged into one refetch.
  const roomId = state?.room.id ?? null;
  useEffect(() => {
    if (!roomId) return;
    const unsubscribe = subscribeRoom(roomId, () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => { void refresh(); }, 120);
    });
    return () => {
      unsubscribe();
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [roomId, refresh]);

  return { state, problem, offline, refresh, serverNow };
}
