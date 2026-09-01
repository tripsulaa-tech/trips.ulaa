import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Layout from '../components/layout/Layout';
import TripCard from '../components/ui/TripCard';
import { TripSearchFilterBar } from '../components/ui/TripSearchFilterBar';
import { SkeletonGrid } from '../components/ui/Skeletons';
import { getUpcomingTrips } from '../services/api';
import { subscribeToTable } from '../services/realtime';
import { useScrollRestoration } from '../hooks/useScrollRestoration';
import { useMonthFilteredTrips } from '../hooks/useMonthFilteredTrips';
import { useLiveNavLabel } from '../hooks/useLiveNavLabel';
import { DEFAULT_BOTTOM_NAV_ITEMS } from '../constants/bottomNav';
import type { UpcomingTrip } from '../types/types-index';


const HERO_IMAGE = 'https://images.unsplash.com/photo-1488085061387-422e29b40080?w=1600&q=80';

// Module-level (not inline) so useMonthFilteredTrips' memoization gets a
// stable function reference across renders.
const getStartDate = (trip: UpcomingTrip) => trip.start_date;
// Coming Soon trips don't have a confirmed date yet, so they only ever show
// up under "All" — picking a specific month pill hides them, matching that
// month's pill count.
const isComingSoon = (trip: UpcomingTrip) => trip.status === 'coming_soon';

// This page is the "Upcoming" tab in the bottom nav bar (see
// constants/bottomNav.ts) — its route below is used to pull that tab's
// admin-editable label for the "Showing N trips" line, so renaming the tab
// (e.g. AdminBottomNav) updates this text automatically too.
const NAV_ROUTE = '/trips';
const DEFAULT_NAV_LABEL = DEFAULT_BOTTOM_NAV_ITEMS.find(i => i.to === NAV_ROUTE)?.label ?? 'Upcoming';

export default function UpcomingTripsPage() {
  const [trips, setTrips] = useState<UpcomingTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [month, setMonth] = useState('All');
  const [showFilters, setShowFilters] = useState(false);
  // This tab's label in the bottom nav bar (e.g. "Upcoming") — admin-editable
  // in AdminBottomNav, shown in front of "Showing N trips" below.
  const navLabel = useLiveNavLabel(NAV_ROUTE, DEFAULT_NAV_LABEL);

  useEffect(() => {
    getUpcomingTrips()
      .then(data => setTrips(data))
      .catch(() => setTrips([]))
      .finally(() => setLoading(false));
  }, []);

  // Remember and restore scroll position — wherever the user goes from
  // here and however they get back (trip detail's back link, bottom nav
  // tab switch, browser back), they land where they left off.
  useScrollRestoration('/trips', !loading);

  // Live publish/draft + coming-soon status — re-pulls the public list the
  // moment an admin publishes a trip, unpublishes/deletes one, or flips
  // "Coming Soon", so anyone already on this page sees it appear/disappear
  // or switch to the coming-soon layout without refreshing.
  useEffect(() => {
    const unsubscribe = subscribeToTable('upcoming_trips', () => {
      getUpcomingTrips()
        .then(data => setTrips(data))
        .catch(() => {});
    });
    return unsubscribe;
  }, []);

  const { filtered, monthCounts } = useMonthFilteredTrips(trips, search, month, getStartDate, isComingSoon);

  return (
    <Layout>
      {/* Hero */}
      <div className="relative h-80 md:h-96 overflow-hidden">
        <img src={HERO_IMAGE} alt="Upcoming Trips" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-dark/60 to-dark/80" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white px-4 sm:px-6 lg:px-8 pt-16">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <span className="text-secondary font-script font-medium text-2xl sm:text-3xl md:text-4xl block">Plan Your Journey</span>
            <h1 className="font-display text-4xl md:text-6xl font-bold mt-3">Upcoming Trips</h1>
            <p className="text-white/80 mt-3 text-lg max-w-xl">
              Handpicked adventures to India's most beautiful hidden destinations.
            </p>
          </motion.div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-white border-b border-background-warm sticky top-[72px] z-30 px-4 sm:px-6 lg:px-8">
        <div className="max-w-[1344px] mx-auto py-4">
          <TripSearchFilterBar
            search={search}
            onSearchChange={setSearch}
            month={month}
            onMonthChange={setMonth}
            monthCounts={monthCounts}
            showFilters={showFilters}
            onToggleFilters={() => setShowFilters(!showFilters)}
          />
        </div>
      </div>

      {/* Trips */}
      <div className="relative isolate px-4 sm:px-6 lg:px-8 py-6 md:py-16">
        <div className="max-w-[1344px] mx-auto">
        {loading ? (
          <SkeletonGrid count={6} type="trip" />
        ) : (
          <div aria-live="polite">
            {trips.length === 0 ? (
              <div className="text-center py-24">
                <p className="font-display text-2xl text-dark-muted">No upcoming trips yet.</p>
                <p className="text-sm text-dark-muted mt-2">Check back soon — new adventures are on the way.</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-24">
                <p className="font-display text-2xl text-dark-muted">No trips found.</p>
                <p className="text-sm text-dark-muted mt-2">Try adjusting your search or filters.</p>
                {(search !== '' || month !== 'All') && (
                  <button
                    onClick={() => { setSearch(''); setMonth('All'); }}
                    className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-white font-button text-sm font-semibold hover:bg-primary-dark transition-colors"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <>
                <p className="text-dark-muted text-base sm:text-lg mb-6 md:mb-8">
                  <span className="font-semibold text-primary">{navLabel}</span>{' '}
                  <span className="text-sm sm:text-base">
                    Showing <span className="font-semibold text-dark">{filtered.length}</span> trip{filtered.length !== 1 ? 's' : ''}
                  </span>
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
                  {filtered.map((trip, i) => (
                    <TripCard key={trip.id} trip={trip} index={i} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        </div>
      </div>
    </Layout>
  );
}
