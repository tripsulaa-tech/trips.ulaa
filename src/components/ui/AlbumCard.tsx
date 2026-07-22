import { motion } from 'framer-motion';
import { Calendar, Users, Images, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { CompletedTrip } from '../../types';
import { formatMonthYear, formatBatchLabel, PLACEHOLDER_IMAGE } from '../../utils';
import Button from './Button';

interface AlbumCardProps {
  trip: CompletedTrip;
  index?: number;
}

export default function AlbumCard({ trip, index = 0 }: AlbumCardProps) {
  const stats = [
    { icon: Calendar, label: formatMonthYear(trip.trip_date) },
    { icon: Users, label: `${trip.participants} travelers` },
    ...(trip.gallery_images.length > 0
      ? [{ icon: Images, label: `${trip.gallery_images.length} photos` }]
      : []),
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className="group bg-white rounded-2xl border border-background-warm shadow-card hover:shadow-card-hover transition-all duration-300 h-full flex flex-col"
    >
      {/* Image */}
      <div className="relative h-52 sm:h-56 overflow-hidden rounded-t-2xl">
        <img
          src={trip.cover_image || PLACEHOLDER_IMAGE}
          alt={trip.destination}
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
        />
      </div>

      {/* Content */}
      <div className="p-5 sm:p-6 flex-1 flex flex-col">
        <div className="flex items-center justify-start gap-2 mb-2">
          <h3 className="font-display text-xl sm:text-2xl font-bold text-dark line-clamp-1">
            {trip.title}
          </h3>
          {trip.batch && (
            <span className="shrink-0 text-xs font-button font-semibold text-primary bg-background-warm px-2.5 py-1 rounded-full whitespace-nowrap">
              {formatBatchLabel(trip.batch)}
            </span>
          )}
        </div>

        <div className="border-t border-dashed border-background-warm mb-4" />

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-5">
          {stats.map(({ icon: Icon, label }, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Icon size={15} className="text-primary shrink-0" />
              <span className="text-xs text-dark font-medium whitespace-nowrap">{label}</span>
            </div>
          ))}
        </div>

        <Link to={`/completed-trips/${trip.slug}`} className="mt-auto">
          <Button variant="primary" size="sm" fullWidth className="group/btn">
            View Album
            <ArrowRight size={15} className="transition-transform group-hover/btn:translate-x-1" />
          </Button>
        </Link>
      </div>
    </motion.div>
  );
}
