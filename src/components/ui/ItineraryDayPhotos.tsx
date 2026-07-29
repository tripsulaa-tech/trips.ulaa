import { useState } from 'react';
import { ZoomIn } from 'lucide-react';
import Lightbox from './Lightbox';

interface ItineraryDayPhotosProps {
  images: string[];
  className?: string;
}

// Shows a single cover photo for the day (matching the "one photo per card"
// itinerary design) with a small "+N" badge when more photos exist. Clicking
// it opens the full Lightbox — starting on that first photo — so the rest
// are just a click away instead of cluttering the card with a thumbnail strip.
export default function ItineraryDayPhotos({ images, className = '' }: ItineraryDayPhotosProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  if (!images || images.length === 0) return null;

  const remaining = images.length - 1;

  return (
    <>
      <button
        type="button"
        onClick={() => setLightboxOpen(true)}
        className={`relative w-full rounded-lg overflow-hidden shrink-0 group cursor-pointer ${className}`}
      >
        <img
          src={images[0]}
          alt=""
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
        />
        <div className="absolute inset-0 bg-dark/0 group-hover:bg-dark/20 transition-colors flex items-center justify-center">
          <ZoomIn size={18} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        {remaining > 0 && (
          <span className="absolute bottom-1.5 right-1.5 bg-dark/70 text-white text-[11px] font-button font-semibold px-1.5 py-0.5 rounded">
            +{remaining}
          </span>
        )}
      </button>

      <Lightbox
        images={images}
        initialIndex={0}
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />
    </>
  );
}

