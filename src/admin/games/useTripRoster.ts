import { useEffect, useMemo, useState } from 'react';
import { getAllUpcomingTripsAdmin, getEnquiries } from '../../services/api';
import type { Enquiry, UpcomingTrip } from '../../types/types-index';
import { isBooked } from '../enquiries/AdminEnquiriesShared';
import { loadPersisted, savePersisted } from '../../utils/sessionState';
import { todayLocal, playableTrips, playerNames } from './hostShared';

// Admin -> Games -> Play. One trip and one "who is present" list for every game
// below it:
//  1. Pick a trip. Only trips that have not finished are listed (upcoming, and
//     in progress = started but not yet ended).
//  2. The booked travellers (same isBooked() test the Enquiries page and the
//     Check-in popup use) are listed. If anyone has been checked in, only the
//     checked-in travellers start ticked; before check-in opens, everyone booked
//     starts ticked. Tick or untick anyone.
//  3. The games read the ticked names (first names, plus a last initial where two
//     share one).

const STORAGE_KEY = 'ulaa:admin-games:roster';
type Persisted = { tripId: string; picked: string[] | null };

export interface TripRoster {
  trips: UpcomingTrip[] | null;
  tripsError: boolean;
  tripId: string;
  trip: UpcomingTrip | undefined;
  today: string;
  loadingPeople: boolean;
  bookedError: boolean;
  people: Enquiry[];
  anyCheckedIn: boolean;
  presentIds: Set<string>;
  present: Enquiry[];
  /** Display names of everyone ticked (can be more than a game accepts). */
  names: string[];
  pickTrip: (id: string) => void;
  toggle: (id: string) => void;
  setAll: (on: boolean) => void;
}

export function useTripRoster(): TripRoster {
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
  const names = useMemo(() => playerNames(present), [present]);

  const toggle = (id: string) => {
    const next = new Set(presentIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setPicked(next);
  };
  const setAll = (on: boolean) => setPicked(new Set(on ? people.map(p => p.id) : []));
  const trip = trips?.find(t => t.id === tripId);

  return { trips, tripsError, tripId, trip, today, loadingPeople, bookedError, people, anyCheckedIn, presentIds, present, names, pickTrip, toggle, setAll };
}

