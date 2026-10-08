import { useCallback, useEffect, useRef, useState } from 'react';
import { twin, TwinError, subscribeTwinRoom } from './findMyTwinApi';
import type { TwinState } from './findMyTwinApi';

// Keeps one phone in sync with its Find My Twin room: fetches the state (room,
// players and ONLY this player's own twins), refetches the moment Supabase
// Realtime reports a change, and polls every few seconds as a safety net (this
// is also the "I'm still here" signal).

const POLL_MS = 6000;

export function useTwinRoom(code: string | null) {
  const [state, setState] = useState<TwinState | null>(null);
  const [gone, setGone] = useState(false);
  const [offline, setOffline] = useState(false);
  const seqRef = useRef(0);
  const debounceRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!code) return;
    const seq = ++seqRef.current;
    try {
      const s = await twin.state(code);
      if (seq < seqRef.current - 3) return; // a much newer answer already arrived
      setState(s);
      setOffline(false);
      setGone(false);
    } catch (e) {
      if (e instanceof TwinError && (e.code === 'not_in_room' || e.code === 'room_not_found')) setGone(true);
      else setOffline(true);
    }
  }, [code]);

  useEffect(() => {
    if (!code) return;
    const first = window.setTimeout(() => { void refresh(); }, 0);
    const poll = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, POLL_MS);
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

  // Live updates; bursts are merged into one refetch.
  const roomId = state?.room.id ?? null;
  useEffect(() => {
    if (!roomId) return;
    const unsubscribe = subscribeTwinRoom(roomId, () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => { void refresh(); }, 120);
    });
    return () => {
      unsubscribe();
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [roomId, refresh]);

  return { state, gone, offline, refresh };
}
