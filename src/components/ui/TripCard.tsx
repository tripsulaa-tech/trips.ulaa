import { motion } from 'framer-motion';
import { MapPin, Calendar, Clock, Users, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { UpcomingTrip } from '../../types';
import { formatDateRange, formatDate, formatPrice, getActivePrice, seatsLeft, PLACEHOLDER_IMAGE } from '../../utils';
import Button from './Button';

interface TripCardProps {
  trip: UpcomingTrip;
  index?: number;
}

export default function TripCard({ trip, index = 0 }: TripCardProps) {
  const remaining = seatsLeft(trip.total_seats, trip.seats_booked);
  const isAlmostFull = remaining <= 5 && remaining > 0;
  const isFull = remaining === 0;
  const { activePrice, isEarlyBird } = getActivePrice(trip.price, trip.early_bird_price, trip.early_bird_deadline);

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.1, duration: 0.5 }}
      className="group bg-white rounded-3xl overflow-hidden shadow-card hover:shadow-card-hover transition-all duration-300 h-full flex flex-col"
    >
      {/* Image */}
      <div className="relative h-56 md:h-64 overflow-hidden">
        <img
          src={trip.cover_image || PLACEHOLDER_IMAGE}
          alt={trip.destination}
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-dark/60 via-transparent to-transparent" />

        {/* Badges */}
        <div className="absolute top-4 left-4 flex gap-2">
          {isFull ? (
            <span className="bg-red-500 text-white text-xs font-button font-semibold px-3 py-1 rounded-full">
              Sold Out
            </span>
          ) : isAlmostFull ? (
            <span className="bg-amber-500 text-white text-xs font-button font-semibold px-3 py-1 rounded-full">
              Only {remaining} left!
            </span>
          ) : null}
          {isEarlyBird && (
            <span className="bg-secondary text-white text-xs font-button font-semibold px-3 py-1 rounded-full">
              Early Bird
            </span>
          )}
        </div>

        {/* Destination overlay */}
        <div className="absolute bottom-4 left-4">
          <div className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur-md border border-white/30 text-white text-xs font-button font-semibold px-3 py-1.5 rounded-full">
            <MapPin size={13} />
            <span>{trip.destination}</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 flex-1 flex flex-col">
        <div className="flex-1">
          <h3 className="font-display text-xl font-bold text-dark mb-3 line-clamp-2">
            {trip.title}
          </h3>

          {activePrice != null && (
            <div className="mb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-display text-lg font-bold text-primary">{formatPrice(activePrice)}</span>
                {isEarlyBird && trip.price != null && (
                  <>
                    <span className="text-dark-muted line-through text-sm">{formatPrice(trip.price)}</span>
                    <span className="bg-green-50 border border-green-200 text-green-700 text-[11px] font-button font-medium px-2 py-0.5 rounded-full whitespace-nowrap">
                      Save {formatPrice(trip.price - activePrice)}
                    </span>
                  </>
                )}
              </div>
              {isEarlyBird && trip.early_bird_deadline && (
                <p className="text-secondary text-xs font-button font-semibold mt-1">
                  Offer ends {formatDate(trip.early_bird_deadline, { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              )}
            </div>
          )}

          {/* Meta row: date + duration stay on one line even on mobile, seats wraps to its own line */}
          <div className="flex items-center flex-wrap gap-x-3 gap-y-1.5 mb-5 text-xs sm:text-sm">
            <div className="flex items-center gap-1.5 text-dark-muted whitespace-nowrap">
              <Calendar size={13} className="text-primary shrink-0" />
              <span>{formatDateRange(trip.start_date, trip.end_date)}</span>
            </div>
            <div className="flex items-center gap-1.5 text-dark-muted whitespace-nowrap">
              <Clock size={13} className="text-primary shrink-0" />
              <span>{trip.duration}</span>
            </div>
            <div className="flex items-center gap-1.5 text-dark-muted w-full">
              <Users size={13} className="text-primary shrink-0" />
              <span>
                {isFull
                  ? 'No seats available'
                  : `${remaining} of ${trip.total_seats} seats left`}
              </span>
            </div>
          </div>
        </div>

        <Link to={`/trips/${trip.slug}`}>
          <Button
            variant={isFull ? 'ghost' : 'primary'}
            size="sm"
            fullWidth
            disabled={isFull}
            className="group/btn"
          >
            {isFull ? 'Join Waitlist' : 'View Details'}
            <ArrowRight size={14} className="transition-transform group-hover/btn:translate-x-1" />
          </Button>
        </Link>
      </div>
    </motion.div>
  );
}