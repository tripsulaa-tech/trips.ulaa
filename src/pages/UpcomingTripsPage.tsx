import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Search, Filter } from 'lucide-react';
import Layout from '../components/layout/Layout';
import TripCard from '../components/ui/TripCard';
import { SkeletonGrid } from '../components/ui/Skeletons';
import { getUpcomingTrips } from '../services/api';
import type { UpcomingTrip } from '../types';

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

  return (
    <Layout>
      {/* Hero */}
      <div className="relative h-80 md:h-96 overflow-hidden">
        <img src={HERO_IMAGE} alt="Upcoming Trips" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-dark/60 to-dark/80" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white px-4 sm:px-6 lg:px-8 pt-16">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <span className="text-secondary text-sm font-button font-semibold tracking-[0.2em] uppercase">Plan Your Journey</span>
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
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-dark-muted" />
              <input
                type="text"
                placeholder="Search destination or trip..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-background-warm bg-background focus:border-primary focus:outline-none font-body text-dark"
              />
            </div>
            {/* Month filter - desktop */}
            <div className="hidden md:flex gap-2 flex-wrap">
              {MONTHS.slice(0, 7).map(m => (
                <button
                  key={m}
                  onClick={() => setMonth(m)}
                  className={`px-4 py-2 rounded-xl text-sm font-button font-medium transition-all ${
                    month === m
                      ? 'bg-primary text-white'
                      : 'bg-background-warm text-dark hover:bg-primary/10 hover:text-primary'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            {/* Filter toggle - mobile */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="md:hidden flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-background-warm text-dark font-button text-sm"
            >
              <Filter size={16} />
              Filter
            </button>
          </div>
          {/* Mobile filters */}
          {showFilters && (
            <div className="md:hidden flex gap-2 flex-wrap mt-3">
              {MONTHS.map(m => (
                <button
                  key={m}
                  onClick={() => { setMonth(m); setShowFilters(false); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-button font-medium transition-all ${
                    month === m ? 'bg-primary text-white' : 'bg-background-warm text-dark'
                  }`}
                >
                  {m}
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
