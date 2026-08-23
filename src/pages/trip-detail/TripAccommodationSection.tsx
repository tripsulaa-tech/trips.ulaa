import type { RefObject } from 'react';
import PagedCarousel, { type PagedCarouselHandle } from '../../components/ui/PagedCarousel';
import { useResponsiveItemsPerView } from '../../components/ui/useResponsiveItemsPerView';
import { ArrowRight } from '@phosphor-icons/react';

interface TripAccommodationSectionProps {
  description?: string | null;
  photos?: string[] | null;
  carouselRef: RefObject<PagedCarouselHandle | null>;
}

export default function TripAccommodationSection({ description, photos, carouselRef }: TripAccommodationSectionProps) {
  const accommodationPerView = useResponsiveItemsPerView({ base: 1, sm: 2, lg: 3 });
  const hasPhotos = (photos?.length ?? 0) > 0;
  const INITIAL_COUNT = 3;
  const hasMore = hasPhotos && photos!.length > INITIAL_COUNT;

  return (
    <section id="accommodation" className="scroll-mt-44">
      <h2 className="font-display text-2xl sm:text-3xl font-bold text-dark mb-2">Stay. Relax. Repeat.</h2>
      {description && (
        <p className="text-dark-muted leading-relaxed text-sm sm:text-base mb-4 sm:mb-6">{description}</p>
      )}
      {hasPhotos && (
        <>
          <PagedCarousel
            ref={carouselRef}
            items={photos!}
            itemsPerView={accommodationPerView}
            keyExtractor={(_photo, i) => i}
            renderItem={(photo, i) => (
              <div className="aspect-video overflow-hidden rounded-lg">
                <img src={photo} alt={`Accommodation ${i + 1}`} className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
              </div>
            )}
          />
          {hasMore && (
            <button
              type="button"
              onClick={() => carouselRef.current?.next()}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-button font-semibold text-primary hover:text-primary/80 transition-colors"
            >
              View Accommodation Details <ArrowRight size={15} />
            </button>
          )}
        </>
      )}
    </section>
  );
}
