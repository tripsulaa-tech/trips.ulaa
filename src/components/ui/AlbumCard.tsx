import { motion } from 'framer-motion';
import { MapPin, Calendar, Users, Images, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { CompletedTrip } from '../../types';
import { formatMonthYear, PLACEHOLDER_IMAGE } from '../../utils';
import Button from './Button';

interface AlbumCardProps {
  trip: CompletedTrip;
  index?: number;
}

export default function AlbumCard({ trip, index = 0 }: AlbumCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.1, duration: 0.5 }}
      className="group bg-white rounded-3xl overflow-hidden shadow-card hover:shadow-card-hover transition-all duration-300"
    >
      {/* Image with overlay */}
      <div className="relative h-64 md:h-72 overflow-hidden">
        <img
          src={trip.cover_image || PLACEHOLDER_IMAGE}
          alt={trip.destination}
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-dark/80 via-dark/20 to-transparent" />

        {/* Overlay Content */}
        <div className="absolute inset-0 flex flex-col justify-end p-6">
          <div className="flex items-center gap-1 text-white/80 text-sm mb-2">
            <MapPin size={13} />
            <span>{trip.destination}</span>
          </div>
          <h3 className="font-display text-2xl font-bold text-white mb-2 line-clamp-2">
            {trip.title}
          </h3>
          <div className="flex items-center gap-4 text-white/70 text-xs">
            <span className="flex items-center gap-1">
              <Calendar size={11} />
              {formatMonthYear(trip.trip_date)}
            </span>
            <span className="flex items-center gap-1">
              <Users size={11} />
              {trip.participants} travelers
            </span>
            {trip.gallery_images.length > 0 && (
              <span className="flex items-center gap-1">
                <Images size={11} />
                {trip.gallery_images.length} photos
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        <p className="text-dark-muted text-sm leading-relaxed mb-5 line-clamp-3">
          {trip.description}
        </p>
        <Link to={`/completed-trips/${trip.slug}`}>
          <Button variant="outline" size="sm" fullWidth className="group/btn">
            View Album
            <ArrowRight size={14} className="transition-transform group-hover/btn:translate-x-1" />
          </Button>
        </Link>
      </div>
    </motion.div>
  );
}
