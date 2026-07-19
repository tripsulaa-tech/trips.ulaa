import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Search, Filter } from 'lucide-react';
import Layout from '../components/layout/Layout';
import TripCard from '../components/ui/TripCard';
import { SkeletonGrid } from '../components/ui/Skeletons';
import { getUpcomingTrips } from '../services/api';
import type { UpcomingTrip } from '../types';

const HERO_IMAGE = 'https://images.unsplash.com/photo-1488085061387-422e29b40080?w=1600&q=80';

const DEMO_TRIPS: UpcomingTrip[] = [
  {
    id: '1', title: 'Spiti Valley Winter Expedition', destination: 'Spiti, Himachal Pradesh',
    slug: 'spiti-valley-winter', start_date: '2025-02-15', end_date: '2025-02-22',
    duration: '7 Days / 6 Nights', description: 'A magical winter journey through the snow-clad valleys of Spiti.',
    highlights: [], itinerary: [], included: [], not_included: [], things_to_carry: [], faqs: [],
    total_seats: 15, seats_booked: 11,
    cover_image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&q=80',
    gallery_images: [], is_published: true, created_at: '', updated_at: '',
  },
  {
    id: '2', title: 'Kerala Backwaters & Tea Trails', destination: 'Munnar & Alleppey, Kerala',
    slug: 'kerala-backwaters', start_date: '2025-03-08', end_date: '2025-03-14',
    duration: '6 Days / 5 Nights', description: 'Glide through Kerala\'s serene backwaters on a houseboat.',
    highlights: [], itinerary: [], included: [], not_included: [], things_to_carry: [], faqs: [],
    total_seats: 12, seats_booked: 7,
    cover_image: 'https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?w=600&q=80',
    gallery_images: [], is_published: true, created_at: '', updated_at: '',
  },
  {
    id: '3', title: 'Rann of Kutch Sunrise Trek', destination: 'Kutch, Gujarat',
    slug: 'rann-of-kutch', start_date: '2025-03-22', end_date: '2025-03-26',
    duration: '4 Days / 3 Nights', description: 'Witness the surreal white salt desert of Kutch bathed in golden light.',
    highlights: [], itinerary: [], included: [], not_included: [], things_to_carry: [], faqs: [],
    total_seats: 18, seats_booked: 18,
    cover_image: 'https://images.unsplash.com/photo-1619546813926-a78fa6372cd2?w=600&q=80',
    gallery_images: [], is_published: true, created_at: '', updated_at: '',
  },
  {
    id: '4', title: 'Coorg Coffee Trail', destination: 'Coorg, Karnataka',
    slug: 'coorg-coffee-trail', start_date: '2025-04-05', end_date: '2025-04-09',
    duration: '4 Days / 3 Nights', description: 'Breathe in the misty hills of Coorg, stroll through coffee estates and waterfalls.',
    highlights: [], itinerary: [], included: [], not_included: [], things_to_carry: [], faqs: [],
    total_seats: 14, seats_booked: 6,
    cover_image: 'https://images.unsplash.com/photo-1563911302283-d2bc129e7570?w=600&q=80',
    gallery_images: [], is_published: true, created_at: '', updated_at: '',
  },
  {
    id: '5', title: 'Valley of Flowers Trek', destination: 'Uttarakhand',
    slug: 'valley-of-flowers', start_date: '2025-07-20', end_date: '2025-07-27',
    duration: '7 Days / 6 Nights', description: 'Trek through the UNESCO-listed Valley of Flowers at the peak of bloom.',
    highlights: [], itinerary: [], included: [], not_included: [], things_to_carry: [], faqs: [],
    total_seats: 12, seats_booked: 3,
    cover_image: 'https://images.unsplash.com/photo-1588668214407-6ea9a6d8c272?w=600&q=80',
    gallery_images: [], is_published: true, created_at: '', updated_at: '',
  },
  {
    id: '6', title: 'Hampi Heritage Escape', destination: 'Hampi, Karnataka',
    slug: 'hampi-heritage', start_date: '2025-05-15', end_date: '2025-05-19',
    duration: '4 Days / 3 Nights', description: 'Explore the ruins of the Vijayanagara Empire among giant boulders and river banks.',
    highlights: [], itinerary: [], included: [], not_included: [], things_to_carry: [], faqs: [],
    total_seats: 16, seats_booked: 9,
    cover_image: 'https://images.unsplash.com/photo-1586500036706-41963de24d8b?w=600&q=80',
    gallery_images: [], is_published: true, created_at: '', updated_at: '',
  },
];

const MONTHS = ['All', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function UpcomingTripsPage() {
  const [trips, setTrips] = useState<UpcomingTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [month, setMonth] = useState('All');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    getUpcomingTrips()
      .then(data => setTrips(data.length > 0 ? data : DEMO_TRIPS))
      .catch(() => setTrips(DEMO_TRIPS))
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
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white px-4 pt-16">
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
      <div className="bg-white border-b border-background-warm sticky top-[72px] z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {loading ? (
          <SkeletonGrid count={6} type="trip" />
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
    </Layout>
  );
}
