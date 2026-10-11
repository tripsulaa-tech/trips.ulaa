import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import GalleryViewer from '../../components/ui/GalleryViewer';
import SectionTitle from '../../components/ui/SectionTitle';

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

  // Column count follows the grid breakpoint (2 on phones, 3 from `sm`).
  const [colCount, setColCount] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 640px)').matches ? 3 : 2);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)');
    const update = () => setColCount(mq.matches ? 3 : 2);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Each photo's own height/width ratio, read once it has loaded.
  const [ratios, setRatios] = useState<Record<string, number>>({});
  useEffect(() => {
    let cancelled = false;
    visible.forEach(src => {
      if (ratios[src]) return;
      const img = new Image();
      img.onload = () => {
        if (!cancelled && img.naturalWidth) {
          setRatios(r => (r[src] ? r : { ...r, [src]: img.naturalHeight / img.naturalWidth }));
        }
      };
      img.src = src;
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos]);

  // Masonry by size, not order: each photo goes into whichever column is
  // currently shortest, so the columns end at about the same height and no
  // big empty gaps are left at the bottom.
  const columns = useMemo(() => {
    const cols: { index: number; photo: string }[][] = Array.from({ length: colCount }, () => []);
    const heights: number[] = Array.from({ length: colCount }, () => 0);
    visible.forEach((photo, index) => {
      let target = 0;
      for (let c = 1; c < colCount; c++) if (heights[c] < heights[target] - 0.001) target = c;
      cols[target].push({ index, photo });
      heights[target] += (ratios[photo] ?? 1.25) + 0.02;
    });
    return cols;
  }, [visible, ratios, colCount]);

  return (
    <section className="scroll-mt-44">
      <SectionTitle variant="plain" align="left" label="What to wear" title="Fashion Aesthetics" titleClassName="mb-2" />
      {description && (
        <p className="text-dark-muted text-sm mb-4">{description}</p>
      )}
      <div className="flex gap-2 items-start">
        {columns.map((col, c) => (
          <div key={c} className="flex-1 min-w-0 flex flex-col gap-2">
            {col.map(({ index: i, photo }) => {
              const isLastVisible = i === visible.length - 1;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => { setLightboxIndex(i); setLightboxOpen(true); }}
                  className="relative block w-full overflow-hidden rounded-lg group"
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
        ))}
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
