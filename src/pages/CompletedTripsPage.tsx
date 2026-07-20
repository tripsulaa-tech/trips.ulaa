import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import Layout from '../components/layout/Layout';
import SectionTitle from '../components/ui/SectionTitle';
import AlbumCard from '../components/ui/AlbumCard';
import { SkeletonGrid } from '../components/ui/Skeletons';
import { getCompletedTrips } from '../services/api';
import type { CompletedTrip } from '../types';

const HERO_IMAGE = 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=1600&q=80';

const DEMO_COMPLETED: CompletedTrip[] = [
  {
    id: '1', title: 'Magical Meghalaya', destination: 'Meghalaya',
    slug: 'magical-meghalaya', trip_date: '2024-10-15',
    description: 'We explored the wettest place on Earth — living root bridges, crystal clear rivers, and the warmth of Khasi culture.',
    participants: 14, cover_image: 'https://images.unsplash.com/photo-1584464491033-06628f3a6b7b?w=600&q=80',
    gallery_images: ['https://images.unsplash.com/photo-1584464491033-06628f3a6b7b?w=800&q=80', 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80'],
    is_published: true, created_at: '', updated_at: '',
  },
  {
    id: '2', title: 'Ladakh on Wheels', destination: 'Ladakh, J&K',
    slug: 'ladakh-on-wheels', trip_date: '2024-08-20',
    description: 'An epic road journey through the world\'s highest motorable passes — where the sky meets the earth.',
    participants: 10, cover_image: 'https://images.unsplash.com/photo-1598091381862-6a65b2a36ab4?w=600&q=80',
    gallery_images: [],
    is_published: true, created_at: '', updated_at: '',
  },
  {
    id: '3', title: 'Andaman Island Hopping', destination: 'Andaman Islands',
    slug: 'andaman-island-hopping', trip_date: '2024-06-10',
    description: 'Pristine beaches, bioluminescent waters, and snorkeling through coral gardens with our fearless ULAA women.',
    participants: 12, cover_image: 'https://images.unsplash.com/photo-1519922639192-e73293ca430e?w=600&q=80',
    gallery_images: [],
    is_published: true, created_at: '', updated_at: '',
  },
  {
    id: '4', title: 'Rajasthan Royal Route', destination: 'Rajasthan',
    slug: 'rajasthan-royal-route', trip_date: '2024-03-05',
    description: 'Palaces, sand dunes, camel rides at sunset, and the rich heritage of India\'s most colorful state.',
    participants: 16, cover_image: 'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?w=600&q=80',
    gallery_images: [],
    is_published: true, created_at: '', updated_at: '',
  },
  {
    id: '5', title: 'Coorg Monsoon Retreat', destination: 'Coorg, Karnataka',
    slug: 'coorg-monsoon', trip_date: '2024-07-22',
    description: 'Dancing in the rain, misty coffee estates, and the lush magic of Coorg during the monsoon season.',
    participants: 10, cover_image: 'https://images.unsplash.com/photo-1563911302283-d2bc129e7570?w=600&q=80',
    gallery_images: [],
    is_published: true, created_at: '', updated_at: '',
  },
  {
    id: '6', title: 'Uttarakhand Spiritual Trail', destination: 'Uttarakhand',
    slug: 'uttarakhand-spiritual', trip_date: '2024-05-01',
    description: 'Rishikesh yoga, Haridwar aarti, and trekking through the Garhwal Himalayas on this soulful journey.',
    participants: 13, cover_image: 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=600&q=80',
    gallery_images: [],
    is_published: true, created_at: '', updated_at: '',
  },
];

export default function CompletedTripsPage() {
  const [trips, setTrips] = useState<CompletedTrip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCompletedTrips()
      .then(data => setTrips(data.length > 0 ? data : DEMO_COMPLETED))
      .catch(() => setTrips(DEMO_COMPLETED))
      .finally(() => setLoading(false));
  }, []);

  // Derived live from the fetched trips — no more hardcoded numbers.
  const stats = useMemo(() => {
    const tripsCompleted = trips.length;
    const womenTraveled = trips.reduce((sum, t) => sum + (t.participants || 0), 0);
    const destinations = new Set(
      trips.flatMap(t => t.destination.split(',').map(d => d.trim().toLowerCase()))
    ).size;
    return [
      { value: `${tripsCompleted}+`, label: 'Trips Completed' },
      { value: `${womenTraveled}+`, label: 'Women Traveled' },
      { value: `${destinations}+`, label: 'Destinations' },
    ];
  }, [trips]);

  return (
    <Layout>
      {/* Hero */}
      <div className="relative h-80 md:h-96 overflow-hidden">
        <img src={HERO_IMAGE} alt="Completed Trips" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-dark/50 to-dark/85" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white px-4 pt-16">
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
        <div className="max-w-7xl mx-auto grid grid-cols-3 gap-6 text-center">
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
      <div className="relative isolate max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="mb-12 flex justify-center">
          <SectionTitle
            label="Our Stories"
            title="Adventures we've lived."
            subtitle="Click on any album to relive the journey through photos and stories."
            align="center"
          />
        </div>

        {loading ? (
          <SkeletonGrid count={6} type="album" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {trips.map((trip, i) => (
              <AlbumCard key={trip.id} trip={trip} index={i} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
