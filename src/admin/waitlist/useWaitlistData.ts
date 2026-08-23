import { useState, useEffect } from 'react';
import { getWaitlistEntries, getAllUpcomingTripsAdmin, getAllCompletedTripsAdmin, getEnquiries } from '../../services/api';
import { seatsLeft } from '../../utils/utils-index';
import type { WaitlistEntry, UpcomingTrip, CompletedTrip, Enquiry } from '../../types/types-index';

/** Owns every data list AdminWaitlist renders from — waitlist entries, seat
 *  availability per trip, the full upcoming-trips list (for the Add to
 *  Waitlist modal), completed trips (to label a trip that graduated into an
 *  album), and cancelled-enquiry ids (to flag a converted entry whose
 *  booking was later cancelled) — plus the initial load-on-mount and the
 *  `load()` re-fetcher other handlers call after a mutation.
 *
 *  Extracted from AdminWaitlist.tsx (see that file's history for the
 *  original single-component version). */
export function useWaitlistData() {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [seatsAvailable, setSeatsAvailable] = useState<Record<string, number>>({});
  // Full upcoming-trips list (not just trips that already have waitlist
  // entries, unlike the `trips` filter options in useWaitlistFilters) —
  // needed so the Add to Waitlist modal can offer every sold-out-or-not
  // trip, including ones with zero signups so far.
  const [allTrips, setAllTrips] = useState<UpcomingTrip[]>([]);
  // Completed-trip lookup only — same reasoning as AdminEnquiries: a
  // waitlist entry's trip_id can point at a trip that already finished and
  // graduated into an album (same id, see sync_started_trip_albums in
  // schema.sql). That's expected, not a data problem, but it looks
  // identical to a still-upcoming trip in the Trip filter unless labeled.
  const [completedTrips, setCompletedTrips] = useState<CompletedTrip[]>([]);
  // Maps a converted entry's linked enquiry id -> whether that booking was
  // later cancelled. A waitlist entry is only ever marked 'converted' once
  // and never automatically flipped back, so without this a person whose
  // booking got cancelled after converting would still just show
  // "Converted" here with no sign the seat is free again.
  const [cancelledEnquiryIds, setCancelledEnquiryIds] = useState<Set<string>>(new Set());
  // Raw enquiries — kept only so group bookings (enquiries.group_id) can be
  // folded into the same trip-scoped Group A/B/C sequence as group waitlist
  // signups (see useWaitlistGroups), matching what the Enquiries page shows.
  const [enquiriesForGroups, setEnquiriesForGroups] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    Promise.all([getWaitlistEntries(), getAllUpcomingTripsAdmin(), getEnquiries(), getAllCompletedTripsAdmin()])
      .then(([waitlistData, tripsData, enquiries, completedTripsData]) => {
        setEntries(waitlistData);
        setAllTrips(tripsData);
        setCompletedTrips(completedTripsData);
        const map: Record<string, number> = {};
        tripsData.forEach(t => { map[t.id] = seatsLeft(t.total_seats, t.seats_booked); });
        setSeatsAvailable(map);
        setCancelledEnquiryIds(new Set(enquiries.filter(en => !!en.cancelled_at).map(en => en.id)));
        setEnquiriesForGroups(enquiries);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return {
    entries, setEntries,
    seatsAvailable,
    allTrips,
    completedTrips,
    cancelledEnquiryIds,
    enquiriesForGroups,
    loading,
    load,
  };
}
