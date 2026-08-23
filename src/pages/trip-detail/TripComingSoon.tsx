import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import Layout from '../../components/layout/Layout';
import Button from '../../components/ui/Button';
import type { UpcomingTrip } from '../../types/types-index';
import { PLACEHOLDER_IMAGE, getCoverImageStyle } from '../../utils/utils-index';
import { ArrowLeft, ArrowRight, Play } from '@phosphor-icons/react';

interface TripComingSoonProps {
  trip: UpcomingTrip;
}

// Coming Soon trips (Admin → Upcoming Trips → Add/Edit Trip → Publish tab)
// intentionally show only the hero banner (cover image + title) on the
// public detail page — everything else (itinerary, pricing, FAQs, booking,
// etc.) is hidden while the rest of the trip's content is still being
// filled in. This renders instead of, not alongside, the full page.
export default function TripComingSoon({ trip }: TripComingSoonProps) {
  return (
    <Layout>
      <div className="relative mt-[81px] aspect-[9/16] sm:aspect-[21/9] overflow-hidden bg-dark">
        <img
          src={trip.hero_mobile_image || trip.cover_image || PLACEHOLDER_IMAGE}
          alt={trip.title}
          className={
            trip.hero_mobile_image
              ? 'absolute inset-0 w-full h-full object-cover sm:hidden'
              : 'absolute inset-x-0 top-0 w-full aspect-[9/8] object-cover sm:hidden'
          }
          style={trip.hero_mobile_image ? undefined : getCoverImageStyle(trip.cover_image_crop)}
        />
        <img
          src={trip.cover_image || PLACEHOLDER_IMAGE}
          alt={trip.title}
          className="hidden sm:block absolute inset-0 w-full h-full object-cover"
          style={getCoverImageStyle(trip.cover_image_crop)}
        />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_0%,transparent_45%,var(--color-dark)_85%)] sm:bg-[linear-gradient(to_right,var(--color-dark)_0%,var(--color-dark)_32%,transparent_55%)] sm:opacity-90" />
        <div className="relative sm:absolute sm:inset-0 w-full h-full">
          <div className="relative w-full h-full flex flex-col justify-end pl-4 sm:pl-6 lg:pl-8 pr-4 sm:pr-6 lg:pr-8 pt-32 sm:pt-28 pb-8 sm:pb-12 max-w-[1344px] mx-auto">
            <motion.div className="flex flex-col" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
              <Link
                to="/trips"
                onClick={() => sessionStorage.setItem('ulaa:restoreScroll:/trips', '1')}
                className="inline-flex items-center gap-2 text-white/70 hover:text-white text-sm mb-3 sm:mb-4 transition-colors w-fit"
              >
                <ArrowLeft size={16} /> All Trips
              </Link>
              <span className="inline-flex w-fit items-center gap-1.5 bg-amber-500 text-white text-xs font-button font-semibold px-3 py-1.5 rounded-md mb-3 sm:mb-4">
                Coming Soon
              </span>
              <h1 className="font-display text-3xl sm:text-4xl md:text-6xl font-bold text-white mb-3 sm:mb-4 leading-tight">
                {trip.title}
              </h1>
            </motion.div>
          </div>
        </div>
      </div>
      <div className="max-w-[1344px] mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 text-center">
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-dark mb-3">Something exciting is on the way!</h2>
        <p className="text-dark-muted text-sm sm:text-base max-w-lg mx-auto mb-8">
          We're putting the finishing touches on this adventure. The full itinerary, pricing, and
          booking details will be available soon. While you wait, check out our other upcoming
          trips or explore our completed trips to see the unforgettable experiences our community
          has already shared.
        </p>
        <div className="flex flex-row flex-wrap items-center justify-center gap-3 sm:gap-4">
          <Link to="/trips">
            <Button
              variant="primary"
              size="sm"
              className="group/btn whitespace-nowrap sm:px-8 sm:py-4 sm:text-lg sm:rounded-lg"
            >
              View All Trips
              <ArrowRight size={16} className="transition-transform group-hover/btn:translate-x-1 sm:w-[18px] sm:h-[18px]" />
            </Button>
          </Link>
          <Link to="/completed-trips">
            <Button
              variant="outline"
              size="sm"
              className="whitespace-nowrap sm:px-8 sm:py-4 sm:text-lg sm:rounded-lg"
            >
              <Play size={14} className="fill-current sm:w-4 sm:h-4" />
              View Gallery
            </Button>
          </Link>
        </div>
      </div>
    </Layout>
  );
}
