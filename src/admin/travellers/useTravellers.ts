import { useEffect, useMemo, useState } from 'react';
import { getEnquiries } from '../../services/api';
import type { Enquiry } from '../../types/types-index';
import { buildTravellerContacts, contactMatchesQuery } from './travellerContacts';

export const TRAVELLERS_PAGE_SIZE = 20;

/** Owns the Travellers Contact Book's data: loads every enquiry once (same
 *  source of truth as Admin Enquiries — see useEnquiryData.ts), collapses
 *  it into one contact per traveller via buildTravellerContacts(), and
 *  layers search + a "repeat travellers only" filter + pagination on top.
 *  A plain useState/useMemo hook (no realtime subscription) since this is
 *  a lookup/reference view, not somewhere admins actively work leads from
 *  minute to minute the way they do on Enquiries — a manual refresh on
 *  next visit is enough. */
export function useTravellers() {
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [repeatOnly, setRepeatOnly] = useState(false);
  const [page, setPage] = useState(1);

  const load = () => {
    getEnquiries().then(setEnquiries).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const allContacts = useMemo(() => buildTravellerContacts(enquiries), [enquiries]);

  const contacts = useMemo(
    () => allContacts
      .filter(c => (repeatOnly ? c.tripCount > 1 : true))
      .filter(c => contactMatchesQuery(c, searchQuery)),
    [allContacts, repeatOnly, searchQuery]
  );

  // A new search/filter can easily leave `page` pointing past the end of
  // the now-shorter result set — land back on page 1 whenever either
  // changes. Done during render (comparing against the previous filter
  // signature), not in an effect — same convention as
  // useEnquiryFilters.ts's currentPage reset, see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes.
  const filterSignature = `${repeatOnly}|${searchQuery.trim().toLowerCase()}`;
  const [prevFilterSignature, setPrevFilterSignature] = useState(filterSignature);
  if (filterSignature !== prevFilterSignature) {
    setPrevFilterSignature(filterSignature);
    setPage(1);
  }

  const kpis = useMemo(() => ({
    total: allContacts.length,
    repeat: allContacts.filter(c => c.tripCount > 1).length,
    tripsBooked: allContacts.reduce((sum, c) => sum + c.tripCount, 0),
    cancelledTrips: allContacts.reduce((sum, c) => sum + c.trips.filter(t => t.allCancelled).length, 0),
  }), [allContacts]);

  return {
    loading,
    contacts,
    totalCount: allContacts.length,
    searchQuery, setSearchQuery,
    repeatOnly, setRepeatOnly,
    page, setPage,
    kpis,
  };
}
