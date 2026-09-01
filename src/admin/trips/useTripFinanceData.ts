import { useEffect, useState } from 'react';
import { getEnquiries } from '../../services/api';
import type { Enquiry } from '../../types/types-index';
import { isBooked } from '../enquiries/AdminEnquiriesShared';

export interface TripRevenue {
  bookedCount: number;
  totalRevenue: number;
}

// Loads every enquiry once (same source AdminEnquiries/AdminReports read)
// so the Add/Edit Trip modal and the read-only Trip Details view can show
// each trip's REAL revenue — the sum of what booked travelers were
// actually invoiced (total_amount) — instead of an estimate based on
// seats_booked x listed price. See utils/tripFinance.ts for why that
// estimate can be wrong: early-bird pricing, group/manual discounts, and
// one-off deals all mean a real booking's price can differ from the
// trip's regular price, so bookedCount x price silently over/understates
// revenue the moment any booking didn't come in at plain regular price.
//
// A brand-new (not-yet-saved) trip has no id to look enquiries up by, so
// revenueByTripId(undefined) returns null on purpose — callers fall back
// to the old seats_booked x price estimate in that case, since there's
// nothing real to sum yet.
export function useTripFinanceData() {
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getEnquiries().then(setEnquiries).catch(console.error).finally(() => setLoading(false));
  }, []);

  const revenueByTripId = (tripId: string | undefined | null): TripRevenue | null => {
    if (!tripId || loading) return null;
    const bookings = enquiries.filter(e => e.trip_id === tripId && isBooked(e));
    return {
      bookedCount: bookings.length,
      totalRevenue: bookings.reduce((sum, e) => sum + (e.total_amount || 0), 0),
    };
  };

  return { loading, revenueByTripId };
}
