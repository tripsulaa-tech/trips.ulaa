import { useState } from 'react';
import { ZoomIn } from 'lucide-react';
import Lightbox from './Lightbox';

interface ItineraryDayPhotosProps {
  images: string[];
}

// Small thumbnail strip shown inside each itinerary day card. Shows up to 4
// thumbnails; if there are more, the last visible one gets a "+N" overlay.
// Clicking any thumbnail opens the full Lightbox starting at that photo.
const MAX_VISIBLE = 4;

export default function ItineraryDayPhotos({ images }: ItineraryDayPhotosProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (!images || images.length === 0) return null;

  const visible = images.slice(0, MAX_VISIBLE);
  const remaining = images.length - MAX_VISIBLE;

  const open = (index: number) => {
    setSelectedIndex(index);
    setLightboxOpen(true);
  };

  return (
    <>
      <div className="flex gap-2 mt-3">
        {visible.map((url, i) => {
          const isLast = i === visible.length - 1;
          const showOverlay = isLast && remaining > 0;
          return (
            <button
              key={i}
              type="button"
              onClick={() => open(i)}
              className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden shrink-0 group cursor-pointer"
            >
              <img
                src={url}
                alt=""
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
              />
              {showOverlay ? (
                <div className="absolute inset-0 bg-dark/60 flex items-center justify-center text-white text-sm font-button font-semibold">
                  +{remaining}
                </div>
              ) : (
                <div className="absolute inset-0 bg-dark/0 group-hover:bg-dark/20 transition-colors flex items-center justify-center">
                  <ZoomIn size={16} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      <Lightbox
        images={images}
        initialIndex={selectedIndex}
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />
    </>
  );
}
