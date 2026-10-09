import { useEffect, useMemo, useState } from 'react';
import { Users, CheckCircle, ShareNetwork, Copy, WhatsappLogo } from '@phosphor-icons/react';
import { useToast } from '../../components/ui/useToast';
import Select from '../../components/ui/Select';
import TruthOrDareGame from '../../components/ui/TruthOrDareGame';
import { getAllUpcomingTripsAdmin, getEnquiries } from '../../services/api';
import type { Enquiry, UpcomingTrip } from '../../types/types-index';
import { isBooked } from '../enquiries/AdminEnquiriesShared';
import { formatDateRange } from '../../utils/utils-index';
import { loadPersisted, savePersisted } from '../../utils/sessionState';

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
type Persisted = { tripId: string; picked: string[] | null };

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
    savePersisted<Persisted>(STORAGE_KEY, { tripId, picked: picked ? [...picked] : null });
  }, [tripId, picked]);

  const pickTrip = (id: string) => {
    setTripId(id);
    setBooked(null);
    setBookedError(false);
    setPicked(null);
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

  // Share: a public pass-and-play link. It carries only the players' display
  // names (first names, plus a last initial where two share one) in the URL
  // fragment, which browsers never send to a server. No phones, emails or
  // booking details. The link follows the present/absent ticks below.
  const shareUrl = `${window.location.origin}/play/truth-or-dare${names.length >= 2 ? `#p=${encodeURIComponent(JSON.stringify(names))}` : ''}`;
  const shareText = `${trip ? `Game time for ${trip.title}! ` : 'Game time! '}Play Truth or Dare with the group: ${shareUrl}`;
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

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow-card p-4 sm:p-6 space-y-4">
        <p className="text-xs text-dark-muted bg-background-warm/60 rounded-md px-3 py-2">
          Pick a trip and the people booked on it become the players. Only upcoming and in-progress trips are listed.
        </p>

        {tripsError ? (
          <p role="alert" className="text-sm text-dark">Couldn't load the trips. Please refresh the page.</p>
        ) : trips === null ? (
          <p role="status" className="text-sm text-dark-muted">Loading trips…</p>
        ) : trips.length === 0 ? (
          <p className="text-sm text-dark-muted">There are no upcoming or in-progress trips right now.</p>
        ) : (
          <div>
            <label htmlFor="tod-host-trip" className="block text-sm font-medium text-dark mb-1.5">Trip</label>
            <Select inputId="tod-host-trip" value={tripId} onChange={pickTrip} options={options} placeholder="Select a trip…" />
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-card p-4 sm:p-6 space-y-3">
        <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-dark"><ShareNetwork size={18} weight="duotone" aria-hidden="true" /> Share with travellers</p>
        <p className="text-xs text-dark-muted">{names.length >= 2
            ? `The link opens Truth or Dare with the ${names.length} players ticked below already filled in, so nobody has to type names. Only first names are in the link. Change the ticks and the link updates.`
            : 'Pick a trip and tick who is present and the link will open with those players filled in. Until then it opens a blank game where people type their own names.'}</p>
        <input type="text" readOnly value={shareUrl} onFocus={e => e.currentTarget.select()} aria-label="Truth or Dare link" className="w-full rounded-md border-2 border-background-warm bg-background px-3 py-2 text-sm text-dark" />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void copyLink()} className="inline-flex items-center gap-1.5 text-sm font-button font-semibold px-3 py-2 rounded-lg border-2 border-background-warm text-dark hover:border-primary/40 min-h-[44px]"><Copy size={16} aria-hidden="true" /> Copy link</button>
          <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-button font-semibold px-3 py-2 rounded-lg bg-primary text-white hover:opacity-90 min-h-[44px]"><WhatsappLogo size={16} weight="fill" aria-hidden="true" /> WhatsApp</a>
          {typeof navigator.share === 'function' && (
            <button type="button" onClick={() => void shareNative()} className="inline-flex items-center gap-1.5 text-sm font-button font-semibold px-3 py-2 rounded-lg border-2 border-background-warm text-dark hover:border-primary/40 min-h-[44px]"><ShareNetwork size={16} aria-hidden="true" /> More…</button>
          )}
        </div>
      </div>

      {tripId && (
        <div className="bg-white rounded-lg shadow-card p-4 sm:p-6 space-y-4">
          {loadingPeople ? (
            <p role="status" className="text-sm text-dark-muted">Loading booked travellers…</p>
          ) : bookedError ? (
            <p role="alert" className="text-sm text-dark">Couldn't load the booked travellers. Pick the trip again to retry.</p>
          ) : people.length === 0 ? (
            <p className="text-sm text-dark-muted">No one is booked on {trip?.title ?? 'this trip'} yet, so there is nobody to play with.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-dark" role="status">
                  <Users size={18} weight="duotone" aria-hidden="true" />
                  {present.length} present of {people.length} booked
                </p>
                <p className="text-xs text-dark-muted">
                  {anyCheckedIn ? 'Checked-in travellers are ticked. Tick anyone else who is here.' : 'Nobody is checked in yet, so everyone booked is ticked. Untick who is missing.'}
                </p>
              </div>

              <ul className="grid sm:grid-cols-2 gap-x-4 gap-y-1">
                {people.map(p => (
                  <li key={p.id}>
                    <label className="flex items-center gap-2.5 min-h-[44px] cursor-pointer text-sm text-dark">
                      <input type="checkbox" checked={presentIds.has(p.id)} onChange={() => toggle(p.id)} className="w-4 h-4 accent-primary shrink-0" />
                      <span className="truncate">{p.full_name}</span>
                      {p.checked_in_at && <CheckCircle size={16} weight="fill" className="text-green-600 shrink-0" aria-label="Checked in" />}
                    </label>
                  </li>
                ))}
              </ul>

              {people.length > MAX_HOST_PLAYERS && (
                <p className="text-xs text-dark-muted">The game takes up to {MAX_HOST_PLAYERS} players, so only the first {MAX_HOST_PLAYERS} ticked are dealt in.</p>
              )}

              <div className="max-w-xs">
                {names.length >= 2 ? (
                  <TruthOrDareGame
                    tripId={trip?.id}
                    tripSlug={trip?.slug}
                    tripTitle={trip?.title}
                    players={names}
                    maxPlayers={MAX_HOST_PLAYERS}
                  />
                ) : (
                  <p className="text-sm text-dark-muted">Tick at least 2 people to start the game.</p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
