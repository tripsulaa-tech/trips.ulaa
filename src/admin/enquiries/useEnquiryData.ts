import { useState, useEffect } from 'react';
import { getEnquiries, getAllUpcomingTripsAdmin, getAllCompletedTripsAdmin } from '../../services/api';
import { subscribeToTable } from '../../services/realtime';
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

  // Live updates — pushes a brand-new website/manual enquiry straight into
  // this list the instant it's submitted, and patches an existing row in
  // place for every other mutation (Mark Contacted, Track Payment, etc.),
  // so an admin sitting on this page never has to manually refresh to see
  // a lead that just came in or moved. Mirrors the `kids` live-subscription
  // pattern already used lower in AdminEnquiries.tsx. Requires
  // enable_realtime_enquiries.sql to have been run — see that file.
  useEffect(() => {
    const unsubscribe = subscribeToTable('enquiries', payload => {
      if (payload.eventType === 'DELETE') {
        const oldId = (payload.old as { id?: string } | undefined)?.id;
        if (!oldId) return;
        setEnquiries(prev => prev.filter(e => e.id !== oldId));
        return;
      }
      const row = payload.new as unknown as Enquiry | undefined;
      if (!row?.id) return;
      // getEnquiries() only ever returns live (not soft-deleted) rows —
      // mirror that here so a just-soft-deleted enquiry disappears from an
      // already-open list the same way a hard delete does, instead of
      // lingering until the next manual reload.
      if (row.deleted_at) {
        setEnquiries(prev => prev.filter(e => e.id !== row.id));
        return;
      }
      setEnquiries(prev => {
        const idx = prev.findIndex(e => e.id === row.id);
        if (idx === -1) return [row, ...prev];
        return prev.map(e => (e.id === row.id ? row : e));
      });
    });
    return unsubscribe;
  }, []);

  return { enquiries, trips, completedTrips, loading, load, setTrips };
}
