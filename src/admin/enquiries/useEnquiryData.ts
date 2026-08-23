import { useState, useEffect } from 'react';
import { getEnquiries, getAllUpcomingTripsAdmin, getAllCompletedTripsAdmin } from '../../services/api';
import type { Enquiry, UpcomingTrip, CompletedTrip } from '../../types/types-index';

/** Owns the three core data lists AdminEnquiries renders from — enquiries,
 *  upcoming trips, and completed trips — plus the initial load-on-mount and
 *  the `load()`/`setTrips` re-fetchers other handlers call after a mutation.
 *  Extracted from AdminEnquiries.tsx (see that file's history for the
 *  original single-component version). */
export function useEnquiryData() {
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [trips, setTrips] = useState<UpcomingTrip[]>([]);
  // Only used to resolve trip titles / tell a genuinely-deleted trip apart
  // from one that simply graduated into a completed album (see
  // sync_started_trip_albums in schema.sql — the album keeps the same id,
  // but the upcoming_trips row itself gets removed once the album is
  // published). Not refreshed after every mutation like `trips` is, since
  // it's only needed for this lookup, not for editing/booking flows.
  const [completedTrips, setCompletedTrips] = useState<CompletedTrip[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    getEnquiries().then(setEnquiries).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    getAllUpcomingTripsAdmin().then(setTrips).catch(console.error);
    getAllCompletedTripsAdmin().then(setCompletedTrips).catch(console.error);
  }, []);

  return { enquiries, trips, completedTrips, loading, load, setTrips };
}
