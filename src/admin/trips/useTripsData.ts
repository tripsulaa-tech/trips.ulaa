import { useEffect, useState } from 'react';
import { getAllUpcomingTripsAdmin } from '../../services/api';
import type { UpcomingTrip } from '../../types/types-index';

/** Loads and holds the full list of trips (all statuses) for the admin
 *  Trips table. Refresh by calling `load()` again after any mutation. */
export function useTripsData() {
  const [trips, setTrips] = useState<UpcomingTrip[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    getAllUpcomingTripsAdmin().then(setTrips).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return { trips, setTrips, loading, load };
}
