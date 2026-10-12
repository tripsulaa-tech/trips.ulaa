import { useEffect, useState } from 'react';
import { Copy, WhatsappLogo } from '@phosphor-icons/react';
import { useToast } from '../../components/ui/useToast';
import { getStowawayHostCode, makeStowawayHostCode, revokeStowawayHostCode } from '../../services/api/stowawayShare';
import type { StowawayHostCode } from '../../services/api/stowawayShare';
import { smallBtn, primaryBtn } from './GameCard';

// Admin -> Games -> Yaaru Fake?: the trip's host code. Travellers who have it can
// host their own online room (open /play/stowaway, "Host a room", type the code)
// and their friends join with the room's 4-letter code. It stops working the day
// after the trip ends, and allows 5 open rooms at a time. Rules live in
// supabase/migration/add_stowaway_host_codes.sql.
const MIGRATION = 'add_stowaway_host_codes.sql';

const pretty = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;
// The code expires at midnight India time, so the last day it works is the day before that instant.
const lastDay = (iso: string) => new Date(new Date(iso).getTime() - 1).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

export default function StowawayHostCodePanel({ tripId, tripTitle }: { tripId: string; tripTitle: string }) {
  const toast = useToast();
  const [hc, setHc] = useState<StowawayHostCode | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    getStowawayHostCode(tripId)
      .then(r => { if (live) setHc(r); })
      .catch(err => { console.error(err); if (live) toast.error(`Couldn't load the host code. Has ${MIGRATION} been run in Supabase?`); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  // toast is a stable provider value; reloading when the trip changes is the point.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  const make = async () => {
    if (busy) return;
    setBusy(true);
    try {
      setHc(await makeStowawayHostCode(tripId));
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : '';
      toast.error(msg.includes('trip_finished') ? 'That trip has already finished.' : `Couldn't make the host code. Has ${MIGRATION} been run in Supabase?`);
    } finally {
      setBusy(false);
    }
  };
  const revoke = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await revokeStowawayHostCode(tripId);
      setHc(null);
      toast.success('Host code turned off.');
    } catch (err) {
      console.error(err);
      toast.error("Couldn't turn the host code off. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const text = hc
    ? `Host your own Yaaru Fake? game${tripTitle ? ` for ${tripTitle}` : ''}! Open ${window.location.origin}/play/stowaway, tap "Host a room" and enter this host code: ${pretty(hc.code)}. Friends join with the room code you get. Works until ${lastDay(hc.expiresAt)}.`
    : '';
  const copy = async () => {
    try { await navigator.clipboard.writeText(pretty(hc?.code ?? '')); toast.success('Host code copied.'); }
    catch { toast.error("Couldn't copy. Select the code and copy it."); }
  };

  return (
    <div className="mt-3 rounded-xl border border-background-warm bg-background-warm/30 p-3 text-xs text-dark-muted">
      <p className="font-button font-semibold text-dark text-sm">Host code for travellers</p>
      {loading ? (
        <p className="mt-1">Loading…</p>
      ) : hc ? (
        <>
          <p className="mt-1.5 font-display text-xl font-extrabold tracking-[0.15em] text-dark select-all">{pretty(hc.code)}</p>
          <p className="mt-0.5">Works until the end of {lastDay(hc.expiresAt)} · {hc.openRooms} of 5 rooms open</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => void copy()} className={smallBtn}><Copy size={14} aria-hidden="true" /> Copy</button>
            <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" className={smallBtn}><WhatsappLogo size={14} aria-hidden="true" /> Share</a>
            <button type="button" onClick={() => void make()} disabled={busy} className={smallBtn}>New code</button>
            <button type="button" onClick={() => void revoke()} disabled={busy} className={smallBtn}>Turn off</button>
          </div>
          <p className="mt-2">"New code" and "Turn off" stop the old code. Rooms already open keep running.</p>
        </>
      ) : (
        <>
          <p className="mt-1">Lets travellers on this trip host their own room and play with the people near them. It stops working the day after the trip ends.</p>
          <div className="mt-2">
            <button type="button" onClick={() => void make()} disabled={busy} className={primaryBtn}>{busy ? 'Making…' : 'Make host code'}</button>
          </div>
        </>
      )}
    </div>
  );
}
