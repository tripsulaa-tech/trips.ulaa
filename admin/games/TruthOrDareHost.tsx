import { useEffect, useMemo, useState } from 'react';
import { Users, CheckCircle, Circle, ShareNetwork, Copy, WhatsappLogo } from '@phosphor-icons/react';
import { useToast } from '../../components/ui/useToast';
import Select from '../../components/ui/Select';
import TruthOrDareGame from '../../components/ui/TruthOrDareGame';
import { getAllUpcomingTripsAdmin, getEnquiries } from '../../services/api';
import type { Enquiry, UpcomingTrip } from '../../types/types-index';
import { isBooked } from '../enquiries/AdminEnquiriesShared';
import { formatDateRange } from '../../utils/utils-index';
import { loadPersisted, savePersisted } from '../../utils/sessionState';
import { createTodShare, updateTodShare } from '../../services/api/todShare';

// Admin -> Games -> "Play Truth or Dare". The game is hosted from here instead
// of the public Games page:
//  1. Pick a trip. Only trips that have not finished are listed (upcoming, and
//     in progress = started but not yet ended).
//  2. The booked travellers for that trip (same isBooked() test the Enquiries
//     page and the Check-in popup use) become the players.
//  3. "Present" decides who is dealt in: if anyone has been checked in, only the
//     checked-in travellers start ticked; before check-in opens, everyone booked
//     starts ticked. Tick or untick anyone, then open the game.

const MAX_HOST_PLAYERS = 40;

// Kept for the browser session so leaving this page and coming back finds the
// same trip and the same present/absent ticks.
const STORAGE_KEY = 'ulaa:admin-games:truth-or-dare-host';
type Persisted = { tripId: string; picked: string[] | null; shareCode: string; shareSig: string };

const todayLocal = (): string => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Trips that have not ended yet, soonest first. */
function playableTrips(all: UpcomingTrip[], today: string): UpcomingTrip[] {
  return all
    .filter(t => !!t.end_date && t.end_date.slice(0, 10) >= today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
}

const isInProgress = (t: UpcomingTrip, today: string) => t.start_date.slice(0, 10) <= today;

/** First names for the on-screen wheel; adds a last initial when two share one. */
function playerNames(people: Enquiry[]): string[] {
  const parts = people.map(p => p.full_name.trim().split(/\s+/));
  const firstCount = new Map<string, number>();
  parts.forEach(w => { const k = (w[0] ?? '').toLowerCase(); firstCount.set(k, (firstCount.get(k) ?? 0) + 1); });
  return parts.map(w => {
    const first = w[0] ?? '';
    const dupe = (firstCount.get(first.toLowerCase()) ?? 0) > 1;
    return dupe && w.length > 1 ? `${first} ${w[w.length - 1].charAt(0).toUpperCase()}` : first;
  }).filter(Boolean);
}

export default function TruthOrDareHost() {
  const toast = useToast();
  const today = useState(todayLocal)[0];
  const [trips, setTrips] = useState<UpcomingTrip[] | null>(null);
  const [tripsError, setTripsError] = useState(false);
  const [persisted] = useState(() => loadPersisted<Persisted>(STORAGE_KEY));
  // The short link made for this trip, and the roster it was last saved with.
  const [share, setShare] = useState<{ code: string; sig: string } | null>(() => (persisted.shareCode ? { code: persisted.shareCode, sig: persisted.shareSig ?? '' } : null));
  const [sharing, setSharing] = useState(false);
  const [tripId, setTripId] = useState(persisted.tripId ?? '');

  const [booked, setBooked] = useState<Enquiry[] | null>(null);
  const [bookedError, setBookedError] = useState(false);
  // null = nobody toggled yet, so the default applies (see header comment).
  const [picked, setPicked] = useState<Set<string> | null>(() => (Array.isArray(persisted.picked) ? new Set(persisted.picked) : null));

  useEffect(() => {
    let alive = true;
    getAllUpcomingTripsAdmin()
      .then(all => {
        if (!alive) return;
        const list = playableTrips(all, today);
        setTrips(list);
        // The remembered trip may have ended or been removed since.
        setTripId(id => {
          if (!id || list.some(t => t.id === id)) return id;
          setPicked(null);
          setShare(null);
          return '';
        });
      })
      .catch(err => { console.error(err); if (alive) setTripsError(true); });
    return () => { alive = false; };
  }, [today]);

  // Fresh read each time a trip is picked so a booking or check-in made a
  // minute ago is included.
  useEffect(() => {
    if (!tripId) return;
    let alive = true;
    getEnquiries()
      .then(all => {
        if (!alive) return;
        setBooked(all.filter(e => e.trip_id === tripId && isBooked(e)).sort((a, b) => a.full_name.localeCompare(b.full_name)));
      })
      .catch(err => { console.error(err); if (alive) setBookedError(true); });
    return () => { alive = false; };
  }, [tripId]);

  useEffect(() => {
    savePersisted<Persisted>(STORAGE_KEY, { tripId, picked: picked ? [...picked] : null, shareCode: share?.code ?? '', shareSig: share?.sig ?? '' });
  }, [tripId, picked, share]);

  const pickTrip = (id: string) => {
    setTripId(id);
    setBooked(null);
    setBookedError(false);
    setPicked(null);
    // A link already sent for another trip must keep its own players.
    setShare(null);
  };

  const loadingPeople = !!tripId && booked === null && !bookedError;
  const people = useMemo(() => booked ?? [], [booked]);
  const anyCheckedIn = useMemo(() => people.some(p => !!p.checked_in_at), [people]);
  const presentIds = useMemo(
    () => picked ?? new Set(people.filter(p => !anyCheckedIn || !!p.checked_in_at).map(p => p.id)),
    [picked, people, anyCheckedIn],
  );
  const present = useMemo(() => people.filter(p => presentIds.has(p.id)), [people, presentIds]);
  const names = useMemo(() => playerNames(present).slice(0, MAX_HOST_PLAYERS), [present]);

  const toggle = (id: string) => {
    const next = new Set(presentIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setPicked(next);
  };

  const trip = trips?.find(t => t.id === tripId);

  // Share: a short public link (/play/truth-or-dare/k7x2). The players (display
  // names only: first names, plus a last initial where two share one) are saved
  // in the database under that code; the link itself carries nothing else.
  // Changing the ticks afterwards keeps the same code via "Update link".
  const tripTitle = trip?.title ?? '';
  const rosterSig = JSON.stringify([tripTitle, names]);
  const canShare = names.length >= 2;
  const linkStale = !!share && share.sig !== rosterSig;
  const shareUrl = `${window.location.origin}/play/truth-or-dare${share ? `/${share.code}` : ''}`;
  const shareText = `${trip ? `Game time for ${trip.title}! ` : 'Game time! '}Play Truth or Dare with the group: ${shareUrl}`;

  const makeLink = async () => {
    if (!canShare || sharing) return;
    setSharing(true);
    try {
      const code = await createTodShare(names, tripTitle);
      setShare({ code, sig: rosterSig });
    } catch (err) {
      console.error(err);
      toast.error("Couldn't make the link. Has add_truth_or_dare_share_links.sql been run in Supabase?");
    } finally {
      setSharing(false);
    }
  };
  const updateLink = async () => {
    if (!share || !canShare || sharing) return;
    setSharing(true);
    try {
      const ok = await updateTodShare(share.code, names, tripTitle);
      if (ok) { setShare({ code: share.code, sig: rosterSig }); toast.success('Link updated. The same link now has these players.'); }
      else { setShare(null); toast.error('That link had expired, so make a new one.'); }
    } catch (err) {
      console.error(err);
      toast.error("Couldn't update the link. Please try again.");
    } finally {
      setSharing(false);
    }
  };
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(shareUrl); toast.success('Link copied.'); }
    catch { toast.error("Couldn't copy. Select the link and copy it by hand."); }
  };
  const shareNative = async () => {
    try { await navigator.share({ title: 'Truth or Dare', text: shareText, url: shareUrl }); }
    catch { /* cancelled */ }
  };
  const options = (trips ?? []).map(t => ({
    value: t.id,
    label: `${t.title} · ${formatDateRange(t.start_date, t.end_date)}${isInProgress(t, today) ? ' · In progress' : ''}`,
  }));

  const setAll = (on: boolean) => setPicked(new Set(on ? people.map(p => p.id) : []));
  const smallBtn = 'inline-flex items-center gap-1.5 text-xs font-button font-semibold px-3 h-9 rounded-lg border-2 border-background-warm text-dark hover:border-primary/40 transition-colors disabled:opacity-50';
  const primaryBtn = 'inline-flex items-center gap-1.5 text-xs font-button font-semibold px-3 h-9 rounded-lg bg-primary text-white hover:opacity-90 transition-opacity disabled:opacity-50';

  return (
    <div className="bg-white rounded-lg shadow-card p-3 sm:p-4 space-y-3">
      {/* 1. Trip */}
      {tripsError ? (
        <p role="alert" className="text-sm text-dark">Couldn't load the trips. Please refresh the page.</p>
      ) : trips === null ? (
        <p role="status" className="text-sm text-dark-muted">Loading trips…</p>
      ) : trips.length === 0 ? (
        <p className="text-sm text-dark-muted">There are no upcoming or in-progress trips right now.</p>
      ) : (
        <div className="max-w-xl">
          <label htmlFor="tod-host-trip" className="block text-xs font-medium text-dark-muted mb-1">Trip <span className="font-normal">· upcoming and in-progress only</span></label>
          <Select inputId="tod-host-trip" size="sm" value={tripId} onChange={pickTrip} options={options} placeholder="Select a trip…" />
        </div>
      )}

      {tripId && (
        <>
          <hr className="border-background-warm" />

          {loadingPeople ? (
            <p role="status" className="text-sm text-dark-muted">Loading booked travellers…</p>
          ) : bookedError ? (
            <p role="alert" className="text-sm text-dark">Couldn't load the booked travellers. Pick the trip again to retry.</p>
          ) : people.length === 0 ? (
            <p className="text-sm text-dark-muted">No one is booked on {trip?.title ?? 'this trip'} yet, so there is nobody to play with.</p>
          ) : (
            <>
              {/* 2. Who is present */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-dark" role="status">
                  <Users size={16} weight="duotone" aria-hidden="true" />
                  {present.length} of {people.length} present
                </p>
                <p className="text-xs text-dark-muted hidden sm:block">
                  {anyCheckedIn ? 'Checked-in travellers are ticked.' : 'Nobody is checked in yet, so everyone is ticked.'} Tap a name to change.
                </p>
                <span className="ml-auto inline-flex items-center gap-3 text-xs font-button font-semibold">
                  <button type="button" onClick={() => setAll(true)} className="text-primary hover:underline min-h-[32px]">All</button>
                  <button type="button" onClick={() => setAll(false)} className="text-primary hover:underline min-h-[32px]">None</button>
                </span>
              </div>

              <ul className="flex flex-wrap gap-1.5" aria-label="Travellers present">
                {people.map(p => {
                  const on = presentIds.has(p.id);
                  return (
                    <li key={p.id}>
                      <label className={`inline-flex items-center gap-1.5 h-9 sm:h-8 pl-2 pr-3 rounded-full border text-[13px] cursor-pointer select-none transition-colors focus-within:ring-2 focus-within:ring-primary/40 ${on ? 'bg-primary/10 border-primary/40 text-dark font-medium' : 'bg-white border-background-warm text-dark-muted hover:border-primary/30'}`}>
                        <input type="checkbox" checked={on} onChange={() => toggle(p.id)} className="sr-only" />
                        {on ? <CheckCircle size={16} weight="fill" className="text-primary shrink-0" aria-hidden="true" /> : <Circle size={16} className="shrink-0 opacity-50" aria-hidden="true" />}
                        <span className="truncate max-w-[12rem]">{p.full_name}</span>
                        {p.checked_in_at && <span className="text-[10px] font-semibold text-green-700 bg-green-50 rounded px-1 leading-4" title="Checked in">In</span>}
                      </label>
                    </li>
                  );
                })}
              </ul>
              {people.length > MAX_HOST_PLAYERS && (
                <p className="text-xs text-dark-muted">The game takes up to {MAX_HOST_PLAYERS} players, so only the first {MAX_HOST_PLAYERS} ticked are dealt in.</p>
              )}

              <hr className="border-background-warm" />

              {/* 3. Play here, or share */}
              <div className="grid gap-3 sm:grid-cols-[minmax(0,15rem)_1fr] sm:items-center">
                <div>
                  {names.length >= 2 ? (
                    <TruthOrDareGame tripId={trip?.id} tripSlug={trip?.slug} tripTitle={trip?.title} players={names} maxPlayers={MAX_HOST_PLAYERS} compact />
                  ) : (
                    <p className="text-sm text-dark-muted">Tick at least 2 people to start the game.</p>
                  )}
                </div>

                <div className="space-y-2 min-w-0">
                  <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-dark"><ShareNetwork size={14} weight="duotone" aria-hidden="true" /> Share with travellers</p>
                  {canShare && !share ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => void makeLink()} disabled={sharing} className={primaryBtn}>
                        <ShareNetwork size={14} aria-hidden="true" /> {sharing ? 'Making link…' : 'Make share link'}
                      </button>
                      <span className="text-xs text-dark-muted">Opens with these {names.length} players filled in. Only first names are saved.</span>
                    </div>
                  ) : !canShare ? (
                    <p className="text-xs text-dark-muted">Tick at least 2 people to make a link.</p>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <input type="text" readOnly value={shareUrl} onFocus={e => e.currentTarget.select()} aria-label="Truth or Dare link" className="flex-1 min-w-[12rem] h-9 rounded-lg border-2 border-background-warm bg-background px-3 text-xs text-dark" />
                        <button type="button" onClick={() => void copyLink()} className={smallBtn}><Copy size={14} aria-hidden="true" /> Copy</button>
                        <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer" className={primaryBtn}><WhatsappLogo size={14} weight="fill" aria-hidden="true" /> WhatsApp</a>
                        {typeof navigator.share === 'function' && (
                          <button type="button" onClick={() => void shareNative()} className={smallBtn} aria-label="More sharing options"><ShareNetwork size={14} aria-hidden="true" /></button>
                        )}
                      </div>
                      {linkStale && (
                        <p role="status" className="flex flex-wrap items-center gap-x-2 text-xs text-dark-muted">
                          Players changed since this link was made.
                          <button type="button" onClick={() => void updateLink()} disabled={sharing} className="font-button font-semibold text-primary hover:underline disabled:opacity-50 min-h-[32px]">{sharing ? 'Updating…' : 'Update link'}</button>
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
