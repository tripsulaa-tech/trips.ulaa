import { useState, useEffect } from 'react';
import { getAllKids, getEnquiries, getAllUpcomingTripsAdmin, getAllCompletedTripsAdmin } from '../../services/api';
import type { UpcomingTrip, CompletedTrip, Enquiry } from '../../types/types-index';
import { buildKidRows, type KidRow } from './kidsShared';

/** Owns every data list AdminKids renders from — the enriched KidRow list
 *  (joined client-side from raw kid rows + their parent enquiries), the
 *  upcoming-trips list (for the Trip filter and the per-kid Payment
 *  modal's live child_price lookup, same as AdminEnquiries/AdminWaitlist),
 *  and completed trips (to label a trip filter option that already
 *  graduated into an album, same reasoning as useWaitlistData) — plus the
 *  initial load-on-mount and the `load()` re-fetcher the action hook calls
 *  after a mutation.
 *
 *  Mirrors useWaitlistData's shape; see that file for the fuller rationale
 *  on why completed trips get their own lookup. */
export function useKidsData() {
  const [kidRows, setKidRows] = useState<KidRow[]>([]);
  const [trips, setTrips] = useState<UpcomingTrip[]>([]);
  const [completedTrips, setCompletedTrips] = useState<CompletedTrip[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    Promise.all([getAllKids(), getEnquiries(), getAllUpcomingTripsAdmin(), getAllCompletedTripsAdmin()])
      .then(([kids, enquiries, tripsData, completedTripsData]) => {
        const enquiriesById = new Map<string, Enquiry>(enquiries.map(e => [e.id, e]));
        setKidRows(buildKidRows(kids, enquiriesById));
        setTrips(tripsData);
        setCompletedTrips(completedTripsData);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // Same lookup useKidPayment's caller (AdminEnquiries/AdminEnquiryKidsCard)
  // builds for the per-kid Payment modal's Total — the trip's flat
  // per-kid fee (upcoming_trips.child_price), sourced live from `trips`
  // rather than cached on the row so it never goes stale if a trip's price
  // is edited while the modal is open.
  const getTripChildPrice = (tripId: string | undefined): number | undefined => {
    const trip = trips.find(t => t.id === tripId);
    return trip?.child_price ?? undefined;
  };

  return {
    kidRows, setKidRows,
    trips,
    completedTrips,
    getTripChildPrice,
    loading,
    load,
  };
}
