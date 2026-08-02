import PagedCarousel from './PagedCarousel';
import { useResponsiveItemsPerView } from './useResponsiveItemsPerView';
import { PLACEHOLDER_IMAGE } from '../../utils/utils-index';

export interface GalleryCarouselItem {
  photo: string;
  description?: string;
}

interface GalleryCarouselProps {
  items: GalleryCarouselItem[];
}

export default function GalleryCarousel({ items }: GalleryCarouselProps) {
  const itemsPerView = useResponsiveItemsPerView({ base: 2, sm: 3, md: 4, lg: 6 });

  if (items.length === 0) return null;

  return (
    <PagedCarousel
      items={items}
      itemsPerView={itemsPerView}
      keyExtractor={(_item, i) => i}
      renderItem={(item, i) => (
        <div className="group overflow-hidden rounded-xl shadow-card border border-background-warm bg-white relative">
          <div className="aspect-[4/3] overflow-hidden relative">
            <img
              src={item.photo || PLACEHOLDER_IMAGE}
              alt={item.description || `Gallery image ${i + 1}`}
              draggable={false}
              className="w-full h-full object-cover group-hover:scale-[1.07] transition-transform duration-600 ease-out"
            />
          </div>
          {item.description && (
            <div className="px-2.5 py-2">
              <p className="text-dark text-sm font-medium truncate">{item.description}</p>
            </div>
          )}
        </div>
      )}
    />
  );
}

