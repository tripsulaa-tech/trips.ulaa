import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  MapPin, Calendar, Clock, Users, CheckCircle, XCircle,
  Backpack, Navigation, ArrowLeft, Share2
} from 'lucide-react';
import Layout from '../components/layout/Layout';
import Button from '../components/ui/Button';
import FAQAccordion from '../components/ui/FAQAccordion';
import Modal from '../components/ui/Modal';
import BookingForm from '../components/ui/BookingForm';
import { GalleryGrid } from '../components/ui/Lightbox';
import { getUpcomingTripBySlug } from '../services/api';
import type { UpcomingTrip } from '../types';
import { formatDateRange, seatsLeft, PLACEHOLDER_IMAGE } from '../utils';

const DEMO_TRIP: UpcomingTrip = {
  id: '1', title: 'Spiti Valley Winter Expedition',
  destination: 'Spiti, Himachal Pradesh', slug: 'spiti-valley-winter',
  start_date: '2025-02-15', end_date: '2025-02-22',
  duration: '7 Days / 6 Nights',
  description: 'A magical winter journey through the snow-clad valleys of Spiti — frozen lakes, ancient monasteries, and starlit skies. Spiti in winter is one of India\'s best kept secrets, accessible only to those who dare.',
  highlights: ['Chandratal Lake at dawn', 'Key Monastery (12,500 ft)', 'Kibber Village trek', 'Local homestay experience', 'Star gazing session', 'Snow photography walks'],
  itinerary: [
    { day: 1, title: 'Shimla → Kaza', description: 'Early morning departure from Shimla. Scenic drive through Kinnaur valley. Arrive in Kaza by evening. Acclimatization walk.' },
    { day: 2, title: 'Kaza Exploration', description: 'Visit Key Monastery and Kibber Village. Afternoon at leisure. Evening bonfire and cultural exchange with locals.' },
    { day: 3, title: 'Langza & Komic', description: 'Drive to the world\'s highest inhabited village. Visit the giant Buddha statue. Photography walk in the snow.' },
    { day: 4, title: 'Chandratal Trek', description: 'Trek to the frozen Chandratal Lake. One of the most surreal experiences in the Himalayas. Overnight near the lake.' },
    { day: 5, title: 'Rest Day / Wellness', description: 'Rest and recover. Optional yoga session. Interaction with local women artisans. Explore Kaza market.' },
    { day: 6, title: 'Return Journey', description: 'Begin return journey through Pin Valley. Stop at waterfalls and scenic viewpoints.' },
    { day: 7, title: 'Shimla Drop', description: 'Arrive in Shimla by noon. Trip ends. Lifetime memories begin.' },
  ],
  included: ['Accommodation (homestays/guesthouses)', 'All meals (vegetarian)', 'Transportation (Innova/Tempo Traveller)', 'Experienced female trip leader', 'First aid kit', 'Permits and entry fees'],
  not_included: ['Personal expenses', 'Travel insurance', 'Flights to Shimla', 'Tips and gratuity'],
  things_to_carry: ['Warm thermal layers (at least 3)', 'Windproof jacket', 'Trekking shoes', 'Sunscreen SPF 50+', 'Sunglasses', 'Personal medications', 'Power bank', 'Water bottle'],
  meeting_point: 'Shimla Bus Stand, Himachal Pradesh — 7:00 AM on Day 1',
  faqs: [
    { question: 'Is prior trekking experience required?', answer: 'No prior trekking experience needed. The walks are moderate and our leader ensures everyone is comfortable.' },
    { question: 'Is Spiti safe in winter?', answer: 'Spiti is safe year-round when traveled with experienced guides. We take all necessary precautions including acclimatization days and weather monitoring.' },
    { question: 'What is the payment process?', answer: 'No online payment is required. Once your enquiry is received, our team will contact you within 24 hours to confirm your seat and guide you through the booking process.' },
    { question: 'Can I join alone?', answer: 'Absolutely! Most ULAA travelers join solo and leave with a group of amazing friends.' },
  ],
  total_seats: 15, seats_booked: 11,
  cover_image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&q=80',
  gallery_images: [
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80',
    'https://images.unsplash.com/photo-1598091381862-6a65b2a36ab4?w=800&q=80',
    'https://images.unsplash.com/photo-1588668214407-6ea9a6d8c272?w=800&q=80',
    'https://images.unsplash.com/photo-1584464491033-06628f3a6b7b?w=800&q=80',
  ],
  is_published: true, created_at: '', updated_at: '',
};

export default function TripDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [trip, setTrip] = useState<UpcomingTrip | null>(null);
  const [loading, setLoading] = useState(true);
  const [bookingOpen, setBookingOpen] = useState(false);

  useEffect(() => {
    if (!slug) return;
    getUpcomingTripBySlug(slug)
      .then(data => setTrip(data || DEMO_TRIP))
      .catch(() => setTrip(DEMO_TRIP))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <Layout>
        <div className="h-screen flex items-center justify-center">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!trip) {
    return (
      <Layout>
        <div className="min-h-screen flex flex-col items-center justify-center text-center px-4">
          <h1 className="font-display text-4xl font-bold text-dark mb-4">Trip not found</h1>
          <Link to="/trips"><Button variant="primary">View All Trips</Button></Link>
        </div>
      </Layout>
    );
  }

  const remaining = seatsLeft(trip.total_seats, trip.seats_booked);
  const isFull = remaining === 0;

  return (
    <Layout>
      {/* Hero */}
      <div className="relative h-[60vh] md:h-[70vh] overflow-hidden">
        <img src={trip.cover_image || PLACEHOLDER_IMAGE} alt={trip.title} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-dark/40 via-dark/30 to-dark/90" />
        <div className="absolute inset-0 flex flex-col justify-end px-4 sm:px-6 lg:px-8 pb-12 max-w-7xl mx-auto left-0 right-0">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
            <Link to="/trips" className="inline-flex items-center gap-2 text-white/70 hover:text-white text-sm mb-4 transition-colors">
              <ArrowLeft size={16} /> All Trips
            </Link>
            <div className="flex items-center gap-2 text-secondary text-sm mb-3">
              <MapPin size={14} /> {trip.destination}
            </div>
            <h1 className="font-display text-4xl md:text-6xl font-bold text-white mb-4">{trip.title}</h1>
            <div className="flex flex-wrap gap-4 text-white/80 text-sm">
              <span className="flex items-center gap-2"><Calendar size={14} /> {formatDateRange(trip.start_date, trip.end_date)}</span>
              <span className="flex items-center gap-2"><Clock size={14} /> {trip.duration}</span>
              <span className="flex items-center gap-2"><Users size={14} />
                {isFull ? 'Sold out' : `${remaining} seats left`}
              </span>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-12">
            {/* Overview */}
            <section>
              <h2 className="font-display text-3xl font-bold text-dark mb-4">Trip Overview</h2>
              <p className="text-dark-muted leading-relaxed text-lg">{trip.description}</p>
            </section>

            {/* Highlights */}
            {trip.highlights.length > 0 && (
              <section>
                <h2 className="font-display text-3xl font-bold text-dark mb-6">Trip Highlights</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {trip.highlights.map((h, i) => (
                    <div key={i} className="flex items-start gap-3 bg-background-warm rounded-xl px-4 py-3">
                      <CheckCircle size={18} className="text-primary shrink-0 mt-0.5" />
                      <span className="text-dark text-sm">{h}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Itinerary */}
            {trip.itinerary.length > 0 && (
              <section>
                <h2 className="font-display text-3xl font-bold text-dark mb-6">Detailed Itinerary</h2>
                <div className="space-y-4">
                  {trip.itinerary.map((day) => (
                    <div key={day.day} className="flex gap-4 bg-white rounded-2xl p-5 shadow-card border border-background-warm">
                      <div className="w-12 h-12 rounded-2xl bg-primary text-white flex flex-col items-center justify-center shrink-0 text-xs font-button font-bold">
                        <span className="text-xs">Day</span>
                        <span className="text-base leading-none">{day.day}</span>
                      </div>
                      <div>
                        <h3 className="font-display font-bold text-dark text-lg mb-1">{day.title}</h3>
                        <p className="text-dark-muted text-sm leading-relaxed">{day.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Included / Not Included */}
            <section className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {trip.included.length > 0 && (
                <div>
                  <h2 className="font-display text-2xl font-bold text-dark mb-4">What's Included</h2>
                  <ul className="space-y-2">
                    {trip.included.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-dark-muted">
                        <CheckCircle size={16} className="text-green-500 shrink-0 mt-0.5" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {trip.not_included.length > 0 && (
                <div>
                  <h2 className="font-display text-2xl font-bold text-dark mb-4">What's Not Included</h2>
                  <ul className="space-y-2">
                    {trip.not_included.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-dark-muted">
                        <XCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {/* Things to carry */}
            {trip.things_to_carry.length > 0 && (
              <section>
                <h2 className="font-display text-2xl font-bold text-dark mb-4 flex items-center gap-2">
                  <Backpack size={24} className="text-primary" /> Things to Carry
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {trip.things_to_carry.map((item, i) => (
                    <div key={i} className="bg-background-warm rounded-xl px-4 py-2 text-sm text-dark text-center">
                      {item}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Meeting Point */}
            {trip.meeting_point && (
              <section className="bg-background-warm rounded-2xl p-6">
                <h2 className="font-display text-2xl font-bold text-dark mb-3 flex items-center gap-2">
                  <Navigation size={22} className="text-primary" /> Meeting Point
                </h2>
                <p className="text-dark-muted">{trip.meeting_point}</p>
              </section>
            )}

            {/* Gallery */}
            {trip.gallery_images.length > 0 && (
              <section>
                <h2 className="font-display text-3xl font-bold text-dark mb-6">Photo Gallery</h2>
                <GalleryGrid images={trip.gallery_images} />
              </section>
            )}

            {/* FAQs */}
            {trip.faqs.length > 0 && (
              <section>
                <h2 className="font-display text-3xl font-bold text-dark mb-6">FAQs</h2>
                <FAQAccordion faqs={trip.faqs} />
              </section>
            )}
          </div>

          {/* Right sticky panel */}
          <div className="lg:col-span-1">
            <div className="sticky top-28">
              <div className="bg-white rounded-3xl shadow-warm-lg p-8 border border-background-warm">
                <div className="text-center mb-6">
                  {!isFull ? (
                    <span className="inline-block bg-green-50 text-green-700 text-sm font-button font-semibold px-4 py-2 rounded-full mb-3">
                      {remaining} seats available
                    </span>
                  ) : (
                    <span className="inline-block bg-red-50 text-red-600 text-sm font-button font-semibold px-4 py-2 rounded-full mb-3">
                      Sold Out
                    </span>
                  )}
                  <div className="w-full bg-background-warm rounded-full h-2 mb-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all"
                      style={{ width: `${(trip.seats_booked / trip.total_seats) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-dark-muted">{trip.seats_booked} of {trip.total_seats} seats booked</p>
                </div>

                <div className="space-y-3 mb-6">
                  <div className="flex justify-between text-sm">
                    <span className="text-dark-muted">Dates</span>
                    <span className="text-dark font-medium">{formatDateRange(trip.start_date, trip.end_date)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-dark-muted">Duration</span>
                    <span className="text-dark font-medium">{trip.duration}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-dark-muted">Group Size</span>
                    <span className="text-dark font-medium">Max {trip.total_seats}</span>
                  </div>
                </div>

                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  disabled={isFull}
                  onClick={() => setBookingOpen(true)}
                >
                  {isFull ? 'Join Waitlist' : 'Book Your Seat'}
                </Button>

                <button
                  onClick={() => navigator.share?.({ title: trip.title, url: window.location.href })}
                  className="w-full flex items-center justify-center gap-2 mt-3 text-sm text-dark-muted hover:text-primary transition-colors"
                >
                  <Share2 size={14} /> Share this trip
                </button>

                <p className="text-xs text-dark-muted text-center mt-4">
                  No payment required to enquire. We'll contact you within 24 hours.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Booking Modal */}
      <Modal
        isOpen={bookingOpen}
        onClose={() => setBookingOpen(false)}
        title="Book Your Seat"
        size="lg"
      >
        <BookingForm
          tripId={trip.id}
          tripTitle={trip.title}
          onSuccess={() => setTimeout(() => setBookingOpen(false), 3000)}
        />
      </Modal>
    </Layout>
  );
}
