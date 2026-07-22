import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import SectionTitle from '../../components/ui/SectionTitle';
import TripCard from '../../components/ui/TripCard';
import { SkeletonGrid } from '../../components/ui/Skeletons';
import Button from '../../components/ui/Button';
import { getUpcomingTrips } from '../../services/api';
import type { UpcomingTrip } from '../../types';

export default function UpcomingTripsPreview() {
  const [trips, setTrips] = useState<UpcomingTrip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getUpcomingTrips()
      .then(data => setTrips(data.slice(0, 3)))
      .catch(() => setTrips([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="py-14 sm:py-24 px-4 sm:px-6 lg:px-8 bg-background">
      <div className="max-w-[1344px] mx-auto">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 sm:gap-6 mb-8 sm:mb-12">
          <SectionTitle
            label="What's Coming"
            title="Upcoming adventures."
            subtitle="Curated trips to India's most stunning hidden destinations."
            align="left"
          />
          <Link to="/trips" className="shrink-0">
            <Button variant="outline" size="md" className="group/btn">
              All Trips
              <ArrowRight size={16} className="transition-transform group-hover/btn:translate-x-1" />
            </Button>
          </Link>
        </div>

        {loading ? (
          <SkeletonGrid count={3} type="trip" />
        ) : trips.length === 0 ? (
          <div className="text-center py-16">
            <p className="font-display text-xl text-dark-muted">No upcoming trips yet.</p>
            <p className="text-sm text-dark-muted mt-2">New adventures are being planned — check back soon.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {trips.map((trip, i) => (
              <TripCard key={trip.id} trip={trip} index={i} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
