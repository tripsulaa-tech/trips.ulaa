import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  MagnifyingGlassPlus as ZoomIn,
} from '@phosphor-icons/react';
import SectionTitle from '../../components/ui/SectionTitle';
import GalleryViewer from '../../components/ui/GalleryViewer';
import { getGalleryImages } from '../../services/api';
import { DEMO_GALLERY_IMAGES } from '../../dev/demoData';

export default function GalleryPreview() {
  const [images, setImages] = useState<string[]>([]);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    getGalleryImages()
      .then(data => {
        if (data.length > 0) {
          setImages(data.map(img => img.image_url).slice(0, 9));
        } else {
          setImages(DEMO_GALLERY_IMAGES);
        }
      })
      .catch(err => {
        console.error(err);
        setImages(DEMO_GALLERY_IMAGES);
      });
  }, []);

  const open = (i: number) => {
    setSelectedIndex(i);
    setLightboxOpen(true);
  };

  // No gallery photos uploaded yet (or still loading): render nothing
  // instead of stock placeholder photos.
  if (images.length === 0) return null;

  return (
    <section className="pt-12 pb-12 sm:py-12 px-4 sm:px-6 lg:px-8 bg-background">
      <div className="max-w-[1344px] mx-auto">
        <div className="flex flex-col items-center mb-8 sm:mb-16">
          <SectionTitle
            label="Instagram Moments"
            title="Frame by frame."
            subtitle="Every destination. Every memory. Every woman who dared to explore."
            align="center"
          />
        </div>

        {/* Uniform Instagram-style grid — every tile is the same square
            aspect ratio, so the grid always fills perfectly edge-to-edge
            no matter how many images there are. (The earlier row-span
            "masonry" grid, and then a CSS-columns masonry attempt, both
            left a gap: fixed spans only tile cleanly for specific image
            counts, and CSS columns strand empty space whenever an image
            with break-inside-avoid doesn't fit the remaining column
            height and gets pushed whole to the next column. A uniform
            grid has no such failure mode.) */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
          {images.map((img, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.06 }}
              onClick={() => open(i)}
              className="group relative aspect-square overflow-hidden rounded-lg cursor-pointer"
            >
              <motion.img
                layoutId={`home-gallery-${i}`}
                src={img}
                alt={`Ulaa Gallery ${i + 1}`}
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
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

        <GalleryViewer
          images={images}
          initialIndex={selectedIndex}
          isOpen={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
          openLayoutId={`home-gallery-${selectedIndex}`}
        />
      </div>
    </section>
  );
}
