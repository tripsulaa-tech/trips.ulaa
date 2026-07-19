import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import SectionTitle from '../../components/ui/SectionTitle';
import TripCard from '../../components/ui/TripCard';
import { SkeletonGrid } from '../../components/ui/Skeletons';
import Button from '../../components/ui/Button';
import { getUpcomingTrips } from '../../services/api';
import type { UpcomingTrip } from '../../types';

// Demo data for when Supabase isn't connected
const DEMO_TRIPS: UpcomingTrip[] = [
  {
    id: '1', title: 'Spiti Valley Winter Expedition', destination: 'Spiti, Himachal Pradesh',
    slug: 'spiti-valley-winter', start_date: '2025-02-15', end_date: '2025-02-22',
    duration: '7 Days / 6 Nights', description: 'A magical winter journey through the snow-clad valleys of Spiti — frozen lakes, ancient monasteries, and starlit skies.',
    highlights: ['Chandratal Lake', 'Key Monastery', 'Kibber Village'], itinerary: [], included: [], not_included: [],
    things_to_carry: [], faqs: [], total_seats: 15, seats_booked: 11,
    cover_image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&q=80',
    gallery_images: [], is_published: true, created_at: '', updated_at: '',
  },
  {
    id: '2', title: 'Kerala Backwaters & Tea Trails', destination: 'Munnar & Alleppey, Kerala',
    slug: 'kerala-backwaters', start_date: '2025-03-08', end_date: '2025-03-14',
    duration: '6 Days / 5 Nights', description: 'Glide through Kerala\'s serene backwaters on a houseboat, wander through misty tea estates, and discover the soul of God\'s Own Country.',
    highlights: ['Houseboat Stay', 'Tea Estate Tour', 'Athirapally Falls'], itinerary: [], included: [], not_included: [],
    things_to_carry: [], faqs: [], total_seats: 12, seats_booked: 7,
    cover_image: 'https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?w=600&q=80',
    gallery_images: [], is_published: true, created_at: '', updated_at: '',
  },
  {
    id: '3', title: 'Rann of Kutch Sunrise Trek', destination: 'Kutch, Gujarat',
    slug: 'rann-of-kutch', start_date: '2025-03-22', end_date: '2025-03-26',
    duration: '4 Days / 3 Nights', description: 'Witness the surreal white salt desert of Kutch bathed in golden light, experience folk culture, and camp under a million stars.',
    highlights: ['White Desert Camping', 'Kutch Embroidery Craft', 'Flamingo Spotting'], itinerary: [], included: [], not_included: [],
    things_to_carry: [], faqs: [], total_seats: 18, seats_booked: 18,
    cover_image: 'https://images.unsplash.com/photo-1619546813926-a78fa6372cd2?w=600&q=80',
    gallery_images: [], is_published: true, created_at: '', updated_at: '',
  },
];

export default function UpcomingTripsPreview() {
  const [trips, setTrips] = useState<UpcomingTrip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getUpcomingTrips()
      .then(data => setTrips(data.length > 0 ? data.slice(0, 3) : DEMO_TRIPS))
      .catch(() => setTrips(DEMO_TRIPS))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 bg-background">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
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
