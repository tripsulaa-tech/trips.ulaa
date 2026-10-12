import { useEffect, useState } from 'react';
import { useToast } from '../../components/ui/useToast';
import { getStowawayOnlineOpen, setStowawayOnlineOpen } from '../../services/api/stowawayShare';
import { smallBtn, primaryBtn } from './GameCard';

// Admin -> Games -> Yaaru Fake?: one switch for online play. Closed (the
// default): only an admin can create a room. Open: anyone with the link can
// create or join one. Closing ends every open room. Rules live in
// supabase/migration/add_stowaway_online_switch.sql.
const MIGRATION = 'add_stowaway_online_switch.sql';

export default function StowawayOnlineSwitch() {
  const toast = useToast();
  const [open, setOpen] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    getStowawayOnlineOpen()
      .then(v => { if (live) setOpen(v); })
      .catch(err => { console.error(err); toast.error(`Couldn't load the online switch. Has ${MIGRATION} been run in Supabase?`); });
    return () => { live = false; };
  // toast is a stable provider value; load once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flip = async () => {
    if (busy || open === null) return;
    const next = !open;
    if (!next && !window.confirm('Close online play? Every room that is open right now will end.')) return;
    setBusy(true);
    try {
      await setStowawayOnlineOpen(next);
      setOpen(next);
      toast.success(next ? 'Online play is open.' : 'Online play is closed.');
    } catch (err) {
      console.error(err);
      toast.error(`Couldn't change it. Has ${MIGRATION} been run in Supabase?`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-background-warm bg-background-warm/30 p-3 text-xs text-dark-muted">
      <p className="font-button font-semibold text-dark text-sm">Online play for players</p>
      {open === null ? (
        <p className="mt-1">Loading…</p>
      ) : (
        <>
          <p className="mt-1" role="status">
            {open
              ? 'Open: anyone with the link can host or join a room.'
              : 'Closed: players can\'t host. Only you can, from here.'}
          </p>
          <div className="mt-2">
            <button type="button" onClick={() => void flip()} disabled={busy} className={open ? smallBtn : primaryBtn}>
              {busy ? 'Saving…' : open ? 'Close online play' : 'Open online play'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
