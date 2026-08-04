import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Search, Filter } from 'lucide-react';
import Layout from '../components/layout/Layout';
import TripCard from '../components/ui/TripCard';
import { SkeletonGrid } from '../components/ui/Skeletons';
import { getUpcomingTrips } from '../services/api';
import { subscribeToTable } from '../services/realtime';
import type { UpcomingTrip } from '../types/types-index';


const HERO_IMAGE = 'https://images.unsplash.com/photo-1488085061387-422e29b40080?w=1600&q=80';

const MONTHS = ['All', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function UpcomingTripsPage() {
  const [trips, setTrips] = useState<UpcomingTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [month, setMonth] = useState('All');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    getUpcomingTrips()
      .then(data => setTrips(data))
      .catch(() => setTrips([]))
      .finally(() => setLoading(false));
  }, []);

  // Keep track of how far down this page the user has scrolled, so that if
  // they open a trip and then follow its "All Trips" link back here, we can
  // put them back where they were instead of dropping them at the top.
  useEffect(() => {
    const handleScroll = () => {
      sessionStorage.setItem('ulaa:scrollY:/trips', String(window.scrollY));
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Once the trips have loaded (so the grid has its real height) and the
  // trip detail page has flagged that we should restore, smoothly scroll
  // back to the saved position. The flag is cleared immediately after so a
  // normal, fresh visit to this page still starts at the top.
  useEffect(() => {
    if (loading) return;
    const shouldRestore = sessionStorage.getItem('ulaa:restoreScroll:/trips');
    if (shouldRestore) {
      sessionStorage.removeItem('ulaa:restoreScroll:/trips');
      const savedY = Number(sessionStorage.getItem('ulaa:scrollY:/trips') || 0);
      requestAnimationFrame(() => window.scrollTo({ top: savedY, behavior: 'smooth' }));
    }
  }, [loading]);

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

  const filtered = useMemo(() => {
    return trips.filter(trip => {
      const matchSearch = search === '' ||
        trip.destination.toLowerCase().includes(search.toLowerCase()) ||
        trip.title.toLowerCase().includes(search.toLowerCase());
      const matchMonth = month === 'All' ||
        new Date(trip.start_date).toLocaleString('en', { month: 'long' }) === month;
      return matchSearch && matchMonth;
    });
  }, [trips, search, month]);

  // How many upcoming (active) trips fall in each month pill — respects the
  // current search text but not the currently-selected month (so switching
  // months doesn't change every other pill's count out from under you).
  // "All" reflects the same search-filtered total shown in "Showing N trips" below.
  const monthCounts = useMemo(() => {
    const bySearch = trips.filter(trip =>
      search === '' ||
      trip.destination.toLowerCase().includes(search.toLowerCase()) ||
      trip.title.toLowerCase().includes(search.toLowerCase())
    );
    const counts: Record<string, number> = { All: bySearch.length };
    for (const trip of bySearch) {
      const m = new Date(trip.start_date).toLocaleString('en', { month: 'long' });
      counts[m] = (counts[m] || 0) + 1;
    }
    return counts;
  }, [trips, search]);

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
          <div className="flex gap-3 sm:gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-dark-muted" />
              <input
                type="text"
                placeholder="Search destination or trip..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-12 pr-4 py-2 rounded-lg border-2 border-background-warm bg-background focus:border-primary focus:outline-none font-body text-dark"
              />
            </div>
            {/* Month filter - desktop */}
            <div className="hidden md:flex gap-2 flex-wrap">
              {MONTHS.filter(m => m === 'All' || (monthCounts[m] ?? 0) > 0).map(m => (
                <button
                  key={m}
                  onClick={() => setMonth(m)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-button font-medium transition-all whitespace-nowrap ${
                    month === m
                      ? 'bg-primary text-white'
                      : 'bg-background-warm text-dark hover:bg-primary/10 hover:text-primary'
                  }`}
                >
                  {m}
                  <span
                    className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full text-xs font-semibold ${
                      month === m ? 'bg-white/25 text-white' : 'bg-white text-primary'
                    }`}
                  >
                    {monthCounts[m] ?? 0}
                  </span>
                </button>
              ))}
            </div>
            {/* Filter toggle - mobile */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="md:hidden flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-background-warm text-dark font-button text-sm shrink-0"
            >
              <Filter size={16} />
              Filter
            </button>
          </div>
          {/* Mobile filters */}
          {showFilters && (
            <div className="md:hidden flex gap-2 flex-wrap mt-3">
              {MONTHS.filter(m => m === 'All' || (monthCounts[m] ?? 0) > 0).map(m => (
                <button
                  key={m}
                  onClick={() => setMonth(m)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-button font-medium transition-all ${
                    month === m ? 'bg-primary text-white' : 'bg-background-warm text-dark'
                  }`}
                >
                  {m}
                  <span
                    className={`inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-semibold ${
                      month === m ? 'bg-white/25 text-white' : 'bg-white text-primary'
                    }`}
                  >
                    {monthCounts[m] ?? 0}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Trips */}
      <div className="relative isolate px-4 sm:px-6 lg:px-8 py-16">
        <div className="max-w-[1344px] mx-auto">
        {loading ? (
          <SkeletonGrid count={6} type="trip" />
        ) : trips.length === 0 ? (
          <div className="text-center py-24">
            <p className="font-display text-2xl text-dark-muted">No upcoming trips yet.</p>
            <p className="text-sm text-dark-muted mt-2">Check back soon — new adventures are on the way.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24">
            <p className="font-display text-2xl text-dark-muted">No trips found.</p>
            <p className="text-sm text-dark-muted mt-2">Try adjusting your search or filters.</p>
          </div>
        ) : (
          <>
            <p className="text-dark-muted text-sm mb-8">
              Showing <span className="font-semibold text-dark">{filtered.length}</span> trip{filtered.length !== 1 ? 's' : ''}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
              {filtered.map((trip, i) => (
                <TripCard key={trip.id} trip={trip} index={i} />
              ))}
            </div>
          </>
        )}
        </div>
      </div>
    </Layout>
  );
}
