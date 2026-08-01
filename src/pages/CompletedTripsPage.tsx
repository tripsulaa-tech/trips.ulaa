import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Search, Filter } from 'lucide-react';
import Layout from '../components/layout/Layout';
import SectionTitle from '../components/ui/SectionTitle';
import AlbumCard from '../components/ui/AlbumCard';
import { SkeletonGrid } from '../components/ui/Skeletons';
import { getCompletedTrips } from '../services/api';
import type { CompletedTrip } from '../types/types-index';

const HERO_IMAGE = 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=1600&q=80';

const MONTHS = ['All', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const DEMO_COMPLETED: CompletedTrip[] = [
  {
    id: '1', title: 'Magical Meghalaya', destination: 'Meghalaya',
    slug: 'magical-meghalaya', trip_date: '2024-10-15',
    description: 'We explored the wettest place on Earth — living root bridges, crystal clear rivers, and the warmth of Khasi culture.',
    participants: 14, cover_image: 'https://images.unsplash.com/photo-1584464491033-06628f3a6b7b?w=600&q=80',
    gallery_images: ['https://images.unsplash.com/photo-1584464491033-06628f3a6b7b?w=800&q=80', 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80'],
    is_published: true, likes_count: 0, created_at: '', updated_at: '',
  },
  {
    id: '2', title: 'Ladakh on Wheels', destination: 'Ladakh, J&K',
    slug: 'ladakh-on-wheels', trip_date: '2024-08-20',
    description: 'An epic road journey through the world\'s highest motorable passes — where the sky meets the earth.',
    participants: 10, cover_image: 'https://images.unsplash.com/photo-1598091381862-6a65b2a36ab4?w=600&q=80',
    gallery_images: [],
    is_published: true, likes_count: 0, created_at: '', updated_at: '',
  },
  {
    id: '3', title: 'Andaman Island Hopping', destination: 'Andaman Islands',
    slug: 'andaman-island-hopping', trip_date: '2024-06-10',
    description: 'Pristine beaches, bioluminescent waters, and snorkeling through coral gardens with our fearless ULAA women.',
    participants: 12, cover_image: 'https://images.unsplash.com/photo-1519922639192-e73293ca430e?w=600&q=80',
    gallery_images: [],
    is_published: true, likes_count: 0, created_at: '', updated_at: '',
  },
  {
    id: '4', title: 'Rajasthan Royal Route', destination: 'Rajasthan',
    slug: 'rajasthan-royal-route', trip_date: '2024-03-05',
    description: 'Palaces, sand dunes, camel rides at sunset, and the rich heritage of India\'s most colorful state.',
    participants: 16, cover_image: 'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?w=600&q=80',
    gallery_images: [],
    is_published: true, likes_count: 0, created_at: '', updated_at: '',
  },
  {
    id: '5', title: 'Coorg Monsoon Retreat', destination: 'Coorg, Karnataka',
    slug: 'coorg-monsoon', trip_date: '2024-07-22',
    description: 'Dancing in the rain, misty coffee estates, and the lush magic of Coorg during the monsoon season.',
    participants: 10, cover_image: 'https://images.unsplash.com/photo-1563911302283-d2bc129e7570?w=600&q=80',
    gallery_images: [],
    is_published: true, likes_count: 0, created_at: '', updated_at: '',
  },
  {
    id: '6', title: 'Uttarakhand Spiritual Trail', destination: 'Uttarakhand',
    slug: 'uttarakhand-spiritual', trip_date: '2024-05-01',
    description: 'Rishikesh yoga, Haridwar aarti, and trekking through the Garhwal Himalayas on this soulful journey.',
    participants: 13, cover_image: 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=600&q=80',
    gallery_images: [],
    is_published: true, likes_count: 0, created_at: '', updated_at: '',
  },
];

export default function CompletedTripsPage() {
  const [trips, setTrips] = useState<CompletedTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [month, setMonth] = useState('All');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    getCompletedTrips()
      .then(data => setTrips(data.length > 0 ? data : DEMO_COMPLETED))
      .catch(() => setTrips(DEMO_COMPLETED))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return trips.filter(trip => {
      const matchSearch = search === '' ||
        trip.destination.toLowerCase().includes(search.toLowerCase()) ||
        trip.title.toLowerCase().includes(search.toLowerCase());
      const matchMonth = month === 'All' ||
        new Date(trip.trip_date).toLocaleString('en', { month: 'long' }) === month;
      return matchSearch && matchMonth;
    });
  }, [trips, search, month]);

  // Derived live from the fetched trips — no more hardcoded numbers.
  const stats = useMemo(() => {
    const tripsCompleted = trips.length;
    const womenTraveled = trips.reduce((sum, t) => sum + (t.participants || 0), 0);
    const destinations = new Set(
      trips.flatMap(t => t.destination.split(',').map(d => d.trim().toLowerCase()))
    ).size;
    return [
      { value: `${womenTraveled}+`, label: 'Girls travelled' },
      { value: `${tripsCompleted}+`, label: 'Trips completed' },
      { value: `${destinations}+`, label: 'Destinations' },
    ];
  }, [trips]);

  return (
    <Layout>
      {/* Hero */}
      <div className="relative h-80 md:h-96 overflow-hidden">
        <img src={HERO_IMAGE} alt="Completed Trips" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-dark/50 to-dark/85" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white px-4 sm:px-6 lg:px-8 pt-16">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <span className="text-secondary text-sm font-button font-semibold tracking-[0.2em] uppercase">Travel Journal</span>
            <h1 className="font-display text-4xl md:text-6xl font-bold mt-3">Our Travel Albums</h1>
            <p className="text-white/80 mt-3 text-lg max-w-xl">
              Every trip is a story. Browse through our collection of beautiful memories.
            </p>
          </motion.div>
        </div>
      </div>

      {/* Stats */}
      <div className="bg-white border-b border-background-warm py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-[1344px] mx-auto grid grid-cols-3 gap-6 text-center">
          {stats.map(({ value, label }) => (
            <div key={label}>
              <p className="font-display text-3xl md:text-4xl font-bold text-primary">
                {loading ? '—' : value}
              </p>
              <p className="text-dark-muted text-sm md:text-base mt-1">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Albums Grid */}
      <div className="relative isolate px-4 sm:px-6 lg:px-8 py-16">
        <div className="max-w-[1344px] mx-auto">
        <div className="mb-12 flex justify-center">
          <SectionTitle
            label="Our Stories"
            title="Adventures we've lived."
            subtitle="Click on any album to relive the journey through photos and stories."
            align="center"
          />
        </div>

        {/* Search & Filters */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-dark-muted" />
              <input
                type="text"
                placeholder="Search destination or trip..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-12 pr-4 py-3 rounded-lg border-2 border-background-warm bg-background focus:border-primary focus:outline-none font-body text-dark"
              />
            </div>
            {/* Month filter - desktop */}
            <div className="hidden md:flex gap-2 flex-wrap">
              {MONTHS.slice(0, 7).map(m => (
                <button
                  key={m}
                  onClick={() => setMonth(m)}
                  className={`px-4 py-2 rounded-lg text-sm font-button font-medium transition-all ${
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
              className="md:hidden flex items-center gap-2 px-4 py-3 rounded-lg border-2 border-background-warm text-dark font-button text-sm"
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
                  className={`px-3 py-1.5 rounded-md text-xs font-button font-medium transition-all ${
                    month === m ? 'bg-primary text-white' : 'bg-background-warm text-dark'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <SkeletonGrid count={6} type="album" />
        ) : trips.length === 0 ? (
          <div className="text-center py-24">
            <p className="font-display text-2xl text-dark-muted">No completed trips yet.</p>
            <p className="text-sm text-dark-muted mt-2">Check back soon — our first album is on the way.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24">
            <p className="font-display text-2xl text-dark-muted">No albums found.</p>
            <p className="text-sm text-dark-muted mt-2">Try adjusting your search or filters.</p>
          </div>
        ) : (
          <>
            <p className="text-dark-muted text-sm mb-8">
              Showing <span className="font-semibold text-dark">{filtered.length}</span> album{filtered.length !== 1 ? 's' : ''}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
              {filtered.map((trip, i) => (
                <AlbumCard key={trip.id} trip={trip} index={i} />
              ))}
            </div>
          </>
        )}
        </div>
      </div>
    </Layout>
  );
}
