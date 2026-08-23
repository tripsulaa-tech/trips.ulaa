import PagedCarousel from './PagedCarousel';
import { useResponsiveItemsPerView } from './useResponsiveItemsPerView';
import AlbumCard from './AlbumCard';
import type { CompletedTrip } from '../../types/types-index';

interface AlbumCarouselProps {
  items: CompletedTrip[];
}

// A normal, always-live carousel: shows `itemsPerView` cards at a time
// (1 on mobile, 3 on desktop) and slides through the rest — nothing is
// rendered as a separate static grid. Built on top of PagedCarousel, which
// owns the actual drag/swipe/paging mechanics; this just supplies the
// Album-specific card renderer and responsive item count.
export default function AlbumCarousel({ items }: AlbumCarouselProps) {
  const itemsPerView = useResponsiveItemsPerView({ base: 1, md: 3 });

  return (
    <PagedCarousel
      items={items}
      itemsPerView={itemsPerView}
      keyExtractor={trip => trip.id}
      renderItem={(trip, i) => <AlbumCard trip={trip} index={i} />}
    />
  );
}
