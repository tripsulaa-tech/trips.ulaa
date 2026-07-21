import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, type PanInfo } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react';

interface LightboxProps {
  images: string[];
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
}

export default function Lightbox({ images, initialIndex = 0, isOpen, onClose }: LightboxProps) {
  const [current, setCurrent] = useState(initialIndex);
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    setCurrent(initialIndex);
  }, [initialIndex]);

  // Lock body scroll while lightbox is open so the footer/page behind
  // can never peek through or overlap the modal.
  useEffect(() => {
    if (!isOpen) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [isOpen]);

  const prev = useCallback(() => {
    setCurrent(c => (c > 0 ? c - 1 : images.length - 1));
  }, [images.length]);

  const next = useCallback(() => {
    setCurrent(c => (c < images.length - 1 ? c + 1 : 0));
  }, [images.length]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose, prev, next]);

  // Keep the active thumbnail scrolled into view whenever it changes.
  useEffect(() => {
    thumbRefs.current[current]?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  }, [current]);

  const handleDragEnd = (_e: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    const SWIPE_DISTANCE = 60;
    const SWIPE_VELOCITY = 400;
    if (info.offset.x < -SWIPE_DISTANCE || info.velocity.x < -SWIPE_VELOCITY) {
      next();
    } else if (info.offset.x > SWIPE_DISTANCE || info.velocity.x > SWIPE_VELOCITY) {
      prev();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-[#0c0906]/98 backdrop-blur-xl flex items-center justify-center p-4"
          onClick={onClose}
        >
          {/* Close */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center z-10 cursor-pointer transition-colors"
            aria-label="Close"
          >
            <X size={24} />
          </button>

          {/* Counter */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/60 text-sm font-button tracking-wide">
            {current + 1} / {images.length}
          </div>

          {/* Prev */}
          {images.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); prev(); }}
              className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 hover:scale-110 active:scale-95 rounded-full p-3 z-10 cursor-pointer transition-all"
              aria-label="Previous"
            >
              <ChevronLeft size={26} />
            </button>
          )}

          {/* Image (swipeable) */}
          <AnimatePresence initial={false} mode="wait">
            <motion.div
              key={current}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={e => e.stopPropagation()}
              className="max-w-5xl max-h-[78vh] w-full touch-pan-y"
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.6}
              onDragEnd={handleDragEnd}
              whileDrag={{ cursor: 'grabbing' }}
            >
              <img
                src={images[current]}
                alt={`Gallery image ${current + 1}`}
                draggable={false}
                className="w-full h-full max-h-[78vh] object-contain rounded-2xl select-none pointer-events-none"
              />
            </motion.div>
          </AnimatePresence>

          {/* Next */}
          {images.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); next(); }}
              className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 hover:scale-110 active:scale-95 rounded-full p-3 z-10 cursor-pointer transition-all"
              aria-label="Next"
            >
              <ChevronRight size={26} />
            </button>
          )}

          {/* Thumbnails - hidden on mobile, swipe/arrows handle navigation there */}
          {images.length > 1 && (
            <div
              className="hidden sm:block absolute bottom-5 left-1/2 -translate-x-1/2 w-full max-w-xl px-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="relative">
                {/* edge fade masks */}
                <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-[#0c0906] to-transparent z-10 rounded-l-2xl" />
                <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#0c0906] to-transparent z-10 rounded-r-2xl" />

                <div className="flex gap-2 overflow-x-auto no-scrollbar scroll-smooth bg-white/[0.06] border border-white/10 backdrop-blur-md rounded-2xl px-3 py-2.5">
                  {images.map((img, i) => (
                    <button
                      key={i}
                      ref={el => { thumbRefs.current[i] = el; }}
                      onClick={() => setCurrent(i)}
                      aria-label={`Go to image ${i + 1}`}
                      aria-current={i === current}
                      className={`relative w-12 h-12 rounded-xl overflow-hidden shrink-0 cursor-pointer transition-all duration-200 ${
                        i === current
                          ? 'ring-2 ring-secondary ring-offset-2 ring-offset-[#0c0906] scale-105'
                          : 'opacity-50 hover:opacity-90'
                      }`}
                    >
                      <img src={img} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Gallery Grid with lightbox
interface GalleryGridProps {
  images: string[];
  columns?: number;
}

export function GalleryGrid({ images }: GalleryGridProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const open = (index: number) => {
    setSelectedIndex(index);
    setLightboxOpen(true);
  };

  return (
    <>
      <div className="masonry-grid">
        {images.map((img, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.04 }}
            className="masonry-item group relative cursor-pointer rounded-2xl overflow-hidden"
            onClick={() => open(i)}
          >
            <img
              src={img}
              alt={`Gallery ${i + 1}`}
              loading="lazy"
              className="w-full object-cover transition-transform duration-500 group-hover:scale-110"
            />
            <div className="absolute inset-0 bg-dark/0 group-hover:bg-dark/30 transition-all duration-300 flex items-center justify-center">
              <ZoomIn size={28} className="text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
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
    </>
  );
}
