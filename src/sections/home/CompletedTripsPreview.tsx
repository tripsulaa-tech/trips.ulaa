import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import SectionTitle from '../../components/ui/SectionTitle';
import AlbumCarousel from '../../components/ui/AlbumCarousel';
import { SkeletonGrid } from '../../components/ui/Skeletons';
import Button from '../../components/ui/Button';
import { getCompletedTrips } from '../../services/api';
import type { CompletedTrip } from '../../types/types-index';

const DEMO_COMPLETED: CompletedTrip[] = [
  {
    id: '1', title: 'Magical Meghalaya', destination: 'Meghalaya',
    slug: 'magical-meghalaya', trip_date: '2024-10-15',
    description: 'We explored the wettest place on Earth — living root bridges, crystal clear rivers, and the warmth of Khasi culture.',
    participants: 14, cover_image: 'https://images.unsplash.com/photo-1584464491033-06628f3a6b7b?w=600&q=80',
    gallery_images: ['https://images.unsplash.com/photo-1584464491033-06628f3a6b7b?w=600&q=80'],
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
    description: 'Pristine beaches, bioluminescent waters, and snorkeling through coral gardens with our 12 fearless ULAA women.',
    participants: 12, cover_image: 'https://images.unsplash.com/photo-1519922639192-e73293ca430e?w=600&q=80',
    gallery_images: [],
    is_published: true, created_at: '', updated_at: '',
  },
  {
    id: '4', title: 'Rajasthan Royals', destination: 'Rajasthan',
    slug: 'rajasthan-royals', trip_date: '2024-04-05',
    description: 'Forts, palaces, desert sunsets, and the warmest hospitality — a week of royal history and sisterhood.',
    participants: 15, cover_image: 'https://images.unsplash.com/photo-1477587458883-47145ed94245?w=600&q=80',
    gallery_images: [],
    is_published: true, created_at: '', updated_at: '',
  },
  {
    id: '5', title: 'Spiti Snow Trails', destination: 'Spiti Valley',
    slug: 'spiti-snow-trails', trip_date: '2024-02-12',
    description: 'High-altitude monasteries, frozen rivers, and the kind of silence that changes you — Spiti in winter.',
    participants: 12, cover_image: 'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=600&q=80',
    gallery_images: [],
    is_published: true, created_at: '', updated_at: '',
  },
];

export default function CompletedTripsPreview() {
  const [trips, setTrips] = useState<CompletedTrip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCompletedTrips()
      .then(data => setTrips(data.length > 0 ? data.slice(0, 8) : DEMO_COMPLETED))
      .catch(() => setTrips(DEMO_COMPLETED))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="py-14 sm:py-24 px-4 sm:px-6 lg:px-8 bg-cream">
      <div className="max-w-[1344px] mx-auto">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 sm:gap-6 mb-8 sm:mb-12">
          <SectionTitle
            label="Travel Journal"
            title="Memories we've made."
            subtitle="Every album tells a story of courage, friendship, and the road less traveled."
            align="left"
          />
          <Link to="/completed-trips" className="shrink-0">
            <Button variant="outline" size="md" className="group/btn">
              All Albums
              <ArrowRight size={16} className="transition-transform group-hover/btn:translate-x-1" />
            </Button>
          </Link>
        </div>

        {loading ? (
          <SkeletonGrid count={3} type="album" />
        ) : (
          // Always a live carousel — 2 cards visible on mobile, 3 on
          // desktop — with the rest reachable by swiping/dragging or the
          // prev/next controls. Nothing is rendered as a static grid.
          <AlbumCarousel items={trips} />
        )}
      </div>
    </section>
  );
}
