import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import Layout from '../components/layout/Layout';
import SectionTitle from '../components/ui/SectionTitle';
import AlbumCard from '../components/ui/AlbumCard';
import { TripSearchFilterBar } from '../components/ui/TripSearchFilterBar';
import { SkeletonGrid } from '../components/ui/Skeletons';
import { getCompletedTrips, getSiteContent } from '../services/api';
import { subscribeToTable } from '../services/realtime';
import { useScrollRestoration } from '../hooks/useScrollRestoration';
import { useMonthFilteredTrips } from '../hooks/useMonthFilteredTrips';
import { DEFAULT_ABOUT, mergeWithDefaults } from '../constants/about';
import { DEFAULT_BOTTOM_NAV_ITEMS } from '../constants/bottomNav';
import type { CompletedTrip, AboutContent, BottomNavItemConfig } from '../types/types-index';

const HERO_IMAGE = 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=1600&q=80';

// This page is the "Journey" tab in the bottom nav bar (see
// constants/bottomNav.ts) — its route below is used to pull that tab's
// admin-editable label for the "Showing N albums" line, so renaming the
// tab (e.g. AdminBottomNav) updates this text automatically too.
const NAV_ROUTE = '/completed-trips';
const DEFAULT_NAV_LABEL = DEFAULT_BOTTOM_NAV_ITEMS.find(i => i.to === NAV_ROUTE)?.label ?? 'Journey';

// Module-level (not inline) so useMonthFilteredTrips' memoization gets a
// stable function reference across renders.
const getTripDate = (trip: CompletedTrip) => trip.trip_date;

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
  // Stat labels only (e.g. "Girls travelled") — admin-editable in the About
  // page's Statistics section, and shared here so both pages always match.
  // The numbers themselves stay derived live from real trips below.
  const [statLabels, setStatLabels] = useState<AboutContent['stats']>(DEFAULT_ABOUT.stats);
  // This tab's label in the bottom nav bar (e.g. "Journey") — admin-editable
  // in AdminBottomNav, shown in front of "Showing N albums" below.
  const [navLabel, setNavLabel] = useState<string>(DEFAULT_NAV_LABEL);

  useEffect(() => {
    getCompletedTrips()
      .then(data => setTrips(data.length > 0 ? data : DEMO_COMPLETED))
      .catch(() => setTrips(DEMO_COMPLETED))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    getSiteContent<Partial<AboutContent>>('about')
      .then(data => setStatLabels(mergeWithDefaults(data).stats))
      .catch(() => {});
  }, []);

  useEffect(() => {
    getSiteContent<BottomNavItemConfig[]>('bottom_nav')
      .then(data => {
        const match = data?.find(i => i.to === NAV_ROUTE);
        if (match?.label) setNavLabel(match.label);
      })
      .catch(() => {});
  }, []);

  // Live nav label — the instant an admin renames this tab in
  // AdminBottomNav, re-pull it so the text below updates without a refresh.
  useEffect(() => {
    const unsubscribe = subscribeToTable(
      'site_content',
      () => {
        getSiteContent<BottomNavItemConfig[]>('bottom_nav')
          .then(data => {
            const match = data?.find(i => i.to === NAV_ROUTE);
            setNavLabel(match?.label || DEFAULT_NAV_LABEL);
          })
          .catch(() => {});
      },
      'key=eq.bottom_nav'
    );
    return unsubscribe;
  }, []);

  // Live stat labels — the instant an admin renames a stat in AdminAbout's
  // Statistics section, re-pull it so this page's stats strip updates
  // without a refresh (matches the live publish/draft subscription below).
  useEffect(() => {
    const unsubscribe = subscribeToTable(
      'site_content',
      () => {
        getSiteContent<Partial<AboutContent>>('about')
          .then(data => setStatLabels(mergeWithDefaults(data).stats))
          .catch(() => {});
      },
      'key=eq.about'
    );
    return unsubscribe;
  }, []);

  // Remember and restore scroll position — wherever the user goes from
  // here and however they get back (album page's back link, bottom nav
  // tab switch, browser back), they land where they left off.
  useScrollRestoration('/completed-trips', !loading);

  // Live publish/draft status — when the admin publishes a new album (or
  // unpublishes/deletes one) while someone is already sitting on this page,
  // re-pull the public list so it appears/disappears without needing a
  // refresh. Re-fetching (rather than patching the changed row locally)
  // keeps this in sync with the same is_published filter the server
  // enforces, instead of trying to duplicate that logic client-side.
  useEffect(() => {
    const unsubscribe = subscribeToTable('completed_trips', () => {
      getCompletedTrips()
        .then(data => setTrips(data.length > 0 ? data : DEMO_COMPLETED))
        .catch(() => {});
    });
    return unsubscribe;
  }, []);

  const { filtered, monthCounts } = useMonthFilteredTrips(trips, search, month, getTripDate);

  // Derived live from the fetched trips — no more hardcoded numbers.
  const stats = useMemo(() => {
    const tripsCompleted = trips.length;
    const womenTraveled = trips.reduce((sum, t) => sum + (t.participants || 0), 0);
    const destinations = new Set(
      trips.flatMap(t => t.destination.split(',').map(d => d.trim().toLowerCase()))
    ).size;
    return [
      { value: `${womenTraveled}+`, label: statLabels.girls_travelled_label },
      { value: `${tripsCompleted}+`, label: statLabels.trips_completed_label },
      { value: `${destinations}+`, label: statLabels.destinations_label },
    ];
  }, [trips, statLabels]);

  return (
    <Layout>
      {/* Hero */}
      <div className="relative h-80 md:h-96 overflow-hidden">
        <img src={HERO_IMAGE} alt="Completed Trips" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-dark/50 to-dark/85" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white px-4 sm:px-6 lg:px-8 pt-16">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <span className="text-secondary font-script font-medium text-2xl sm:text-3xl md:text-4xl block">Travel Journal</span>
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
      <div className="relative isolate px-6 lg:px-8 pt-6 md:pt-16">
        <div className="max-w-[1344px] mx-auto">
        <div className="mb-6 md:mb-12 flex justify-center">
          <SectionTitle
            label="Our Stories"
            title="Adventures we've lived."
            subtitle="Click on any album to relive the journey through photos and stories."
            align="center"
          />
        </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-background border-b border-background-warm sticky top-[72px] z-30 px-4 sm:px-6 lg:px-8">
        <div className="max-w-[1344px] mx-auto py-0 md:py-4">
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

      {/* Albums Grid */}
      <div className="relative isolate px-6 lg:px-8 py-6 md:py-16">
        <div className="max-w-[1344px] mx-auto">

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
            <p className="text-dark-muted text-base sm:text-lg mb-6 md:mb-8">
              <span className="font-semibold text-primary">{navLabel}</span>{' '}
              <span className="text-sm sm:text-base">
                Showing <span className="font-semibold text-dark">{filtered.length}</span> album{filtered.length !== 1 ? 's' : ''}
              </span>
            </p>
            {/* All albums shown in a single grid — no carousel */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
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