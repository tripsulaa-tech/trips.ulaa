import { useState, useMemo } from 'react';
import { ZoomIn } from 'lucide-react';
import PagedCarousel from './PagedCarousel';
import { useResponsiveItemsPerView } from './useResponsiveItemsPerView';
import GalleryViewer from './GalleryViewer';
import { PLACEHOLDER_IMAGE } from '../../utils/utils-index';

export interface GalleryCarouselItem {
  photo: string;
  description?: string;
}

interface GalleryCarouselProps {
  items: GalleryCarouselItem[];
  fallbackLocation?: string;
}

export default function GalleryCarousel({ items, fallbackLocation }: GalleryCarouselProps) {
  const itemsPerView = useResponsiveItemsPerView({ base: 2, sm: 3, md: 4, lg: 6 });
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const galleryImages = useMemo(
    () => items.map(item => ({ src: item.photo || PLACEHOLDER_IMAGE, caption: item.description })),
    [items]
  );

  if (items.length === 0) return null;

  return (
    <>
      <PagedCarousel
        items={items}
        itemsPerView={itemsPerView}
        keyExtractor={(_item, i) => i}
        renderItem={(item, i) => (
          <div
            className="group overflow-hidden rounded-xl shadow-card border border-background-warm bg-white cursor-pointer relative"
            onClick={() => { setViewerIndex(i); setViewerOpen(true); }}
          >
            <div className="aspect-[4/3] overflow-hidden relative">
              <img
                src={item.photo || PLACEHOLDER_IMAGE}
                alt={item.description || `Gallery image ${i + 1}`}
                draggable={false}
                className="w-full h-full object-cover group-hover:scale-[1.07] transition-transform duration-600 ease-out"
              />
              <div className="absolute inset-0 bg-dark/0 group-hover:bg-dark/25 transition-all duration-400 flex items-center justify-center">
                <ZoomIn size={22} className="text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300 drop-shadow-lg" />
              </div>
            </div>
            {item.description && (
              <div className="px-2.5 py-2">
                <p className="text-dark text-sm font-medium truncate">{item.description}</p>
              </div>
            )}
          </div>
        )}
      />
      <GalleryViewer
        images={galleryImages}
        initialIndex={viewerIndex}
        isOpen={viewerOpen}
        onClose={() => setViewerOpen(false)}
        fallbackLocation={fallbackLocation}
      />
    </>
  );
}

