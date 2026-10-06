import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
} from '@phosphor-icons/react';
import SectionTitle from '../../components/ui/SectionTitle';
import AlbumCarousel from '../../components/ui/AlbumCarousel';
import { SkeletonGrid } from '../../components/ui/Skeletons';
import Button from '../../components/ui/Button';
import { getCompletedTrips } from '../../services/api';
import type { CompletedTrip } from '../../types/types-index';
import { DEMO_COMPLETED } from '../../dev/demoData';

export default function CompletedTripsPreview() {
  const [trips, setTrips] = useState<CompletedTrip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCompletedTrips()
      .then(data => setTrips(data.length > 0 ? data.slice(0, 8) : DEMO_COMPLETED.slice(0, 8)))
      .catch(() => setTrips(DEMO_COMPLETED.slice(0, 8)))
      .finally(() => setLoading(false));
  }, []);

  // Nothing published yet (or the request failed): hide the whole section
  // rather than showing an empty carousel under a heading.
  if (!loading && trips.length === 0) return null;

  return (
    <section className="pt-0 pb-12 sm:py-12 px-4 sm:px-6 lg:px-8 bg-cream">
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
