import { useEffect, useState } from 'react';
import { getAllUpcomingTripsAdmin } from '../../services/api';
import { useToast } from '../../components/ui/useToast';
import type { UpcomingTrip } from '../../types/types-index';

/** Loads and holds the full list of trips (all statuses) for the admin
 *  Trips table. Refresh by calling `load()` again after any mutation. */
export function useTripsData() {
  const [trips, setTrips] = useState<UpcomingTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const toast = useToast();

  const load = () => {
    getAllUpcomingTripsAdmin()
      .then(data => { setTrips(data); setLoadError(false); })
      .catch(err => {
        console.error(err);
        setLoadError(true);
        toast.error("Couldn't load the trips. Please try again.");
      })
      .finally(() => setLoading(false));
  };

  const retry = () => { setLoading(true); load(); };

  useEffect(() => { load(); }, []);

  return { trips, setTrips, loading, loadError, load, retry };
}
