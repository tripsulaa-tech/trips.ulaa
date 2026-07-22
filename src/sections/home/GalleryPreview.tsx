import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ZoomIn } from 'lucide-react';
import SectionTitle from '../../components/ui/SectionTitle';
import Lightbox from '../../components/ui/Lightbox';
import { getGalleryImages } from '../../services/api';

const FALLBACK_IMAGES = [
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=500&q=80',
  'https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?w=400&q=80',
  'https://images.unsplash.com/photo-1619546813926-a78fa6372cd2?w=500&q=80',
  'https://images.unsplash.com/photo-1598091381862-6a65b2a36ab4?w=400&q=80',
  'https://images.unsplash.com/photo-1584464491033-06628f3a6b7b?w=500&q=80',
  'https://images.unsplash.com/photo-1519922639192-e73293ca430e?w=400&q=80',
  'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?w=500&q=80',
  'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=400&q=80',
  'https://images.unsplash.com/photo-1591017403997-beeee1ec6981?w=500&q=80',
];

export default function GalleryPreview() {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [images, setImages] = useState<string[]>(FALLBACK_IMAGES);

  useEffect(() => {
    getGalleryImages()
      .then(data => {
        if (data.length > 0) {
          setImages(data.map(img => img.image_url).slice(0, 9));
        }
      })
      .catch(console.error);
  }, []);

  const open = (i: number) => {
    setSelectedIndex(i);
    setLightboxOpen(true);
  };

  return (
    <section className="py-14 sm:py-24 px-4 sm:px-6 lg:px-8 bg-background">
      <div className="max-w-[1344px] mx-auto">
        <div className="flex flex-col items-center mb-8 sm:mb-16">
          <SectionTitle
            label="Instagram Moments"
            title="Frame by frame."
            subtitle="Every destination. Every memory. Every woman who dared to explore."
            align="center"
          />
        </div>

        {/* Masonry-style grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-3 md:gap-4">
          {images.map((img, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.06 }}
              onClick={() => open(i)}
              className={`group relative overflow-hidden rounded-2xl cursor-pointer ${
                i === 0 || i === 4 ? 'row-span-2' : ''
              } ${i === 0 ? 'md:col-span-2 md:row-span-1' : ''}`}
            >
              <img
                src={img}
                alt={`ULAA Gallery ${i + 1}`}
                loading="lazy"
                className="w-full h-full object-cover min-h-40 md:min-h-56 transition-transform duration-700 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-dark/0 group-hover:bg-dark/30 transition-all duration-300 flex items-center justify-center">
                <ZoomIn
                  size={28}
                  className="text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                />
              </div>
            </motion.div>
          ))}
        </div>

        <Lightbox
          images={images}
          initialIndex={selectedIndex}
          isOpen={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
        />
      </div>
    </section>
  );
}
