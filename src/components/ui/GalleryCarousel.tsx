import PagedCarousel, { useResponsiveItemsPerView } from './PagedCarousel';
import { PLACEHOLDER_IMAGE } from '../../utils/utils-index';

export interface GalleryCarouselItem {
  photo: string;
  description?: string;
}

interface GalleryCarouselProps {
  items: GalleryCarouselItem[];
}

// Same paged carousel used on the homepage (Completed Trips albums): a
// fixed number of cards per page with prev/dots/next controls below,
// rather than floating side arrows over the row. Shows up to 6 photos
// per page on desktop.
export default function GalleryCarousel({ items }: GalleryCarouselProps) {
  const itemsPerView = useResponsiveItemsPerView({ base: 2, sm: 3, md: 4, lg: 6 });

  if (items.length === 0) return null;

  return (
    <PagedCarousel
      items={items}
      itemsPerView={itemsPerView}
      keyExtractor={(_item, i) => i}
      renderItem={(item, i) => (
        <div className="group overflow-hidden rounded-xl shadow-card border border-background-warm bg-white">
          <div className="aspect-[4/3] overflow-hidden">
            <img
              src={item.photo || PLACEHOLDER_IMAGE}
              alt={item.description || `Gallery image ${i + 1}`}
              draggable={false}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          </div>
          {item.description && (
            <div className="px-2.5 py-2">
              <p className="text-dark text-xs font-medium truncate">{item.description}</p>
            </div>
          )}
        </div>
      )}
    />
  );
}
