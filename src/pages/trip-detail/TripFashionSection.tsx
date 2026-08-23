import { useState } from 'react';
import { motion } from 'framer-motion';
import GalleryViewer from '../../components/ui/GalleryViewer';

interface TripFashionSectionProps {
  photos: string[];
  description?: string | null;
  tripTitle: string;
}

const VISIBLE_COUNT = 7;

export default function TripFashionSection({ photos, description, tripTitle }: TripFashionSectionProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const visible = photos.slice(0, VISIBLE_COUNT);
  const remaining = photos.length - visible.length;

  return (
    <section className="scroll-mt-44">
      <h2 className="font-display text-2xl font-bold text-dark mb-2">Fashion Aesthetics</h2>
      {description && (
        <p className="text-dark-muted text-sm mb-4">{description}</p>
      )}
      <div className="columns-2 sm:columns-3 gap-2 [&>*]:mb-2">
        {visible.map((photo, i) => {
          const isLastVisible = i === visible.length - 1;
          return (
            <button
              key={i}
              type="button"
              onClick={() => { setLightboxIndex(i); setLightboxOpen(true); }}
              className="relative block w-full overflow-hidden rounded-lg break-inside-avoid group"
            >
              {/* h-auto (no object-cover) lets each tile take the photo's own
                  aspect ratio, so admin-uploaded images are never cropped —
                  portrait, landscape, and square photos all show in full. */}
              <motion.img
                layoutId={`fashion-gallery-${i}`}
                src={photo}
                alt={`Fashion ${i + 1}`}
                className="w-full h-auto block group-hover:scale-105 transition-transform duration-500"
              />
              {isLastVisible && remaining > 0 && (
                <div className="absolute inset-0 bg-dark/50 flex items-center justify-center">
                  <span className="text-white font-display font-bold text-lg">+{remaining}</span>
                </div>
              )}
            </button>
          );
        })}
      </div>
      <GalleryViewer
        images={photos}
        initialIndex={lightboxIndex}
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        openLayoutId={`fashion-gallery-${lightboxIndex}`}
        fallbackLocation={tripTitle}
      />
    </section>
  );
}
