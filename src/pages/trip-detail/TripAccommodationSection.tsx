import type { RefObject } from 'react';
import PagedCarousel, { type PagedCarouselHandle } from '../../components/ui/PagedCarousel';
import { useResponsiveItemsPerView } from '../../components/ui/useResponsiveItemsPerView';
import SectionTitle from '../../components/ui/SectionTitle';
import { ArrowRight } from '@phosphor-icons/react';
import { ONE_DAY_STAY_TEXT } from '../../utils/utils-index';
import { thumbImgProps } from '../../utils/imageUrls';

interface TripAccommodationSectionProps {
  description?: string | null;
  photos?: string[] | null;
  carouselRef: RefObject<PagedCarouselHandle | null>;
  // One-day trip: with no description of its own, the section says that
  // accommodation isn't included instead of being hidden.
  isOneDay?: boolean;
}

export default function TripAccommodationSection({ description, photos, carouselRef, isOneDay = false }: TripAccommodationSectionProps) {
  const text = description || (isOneDay ? ONE_DAY_STAY_TEXT : null);
  const accommodationPerView = useResponsiveItemsPerView({ base: 1, sm: 2, lg: 3 });
  const hasPhotos = (photos?.length ?? 0) > 0;
  const INITIAL_COUNT = 3;
  const hasMore = hasPhotos && photos!.length > INITIAL_COUNT;

  return (
    <section id="accommodation" className="scroll-mt-44">
      <SectionTitle variant="plain" align="left" label="Where you'll stay" title="Stay. Relax. Repeat." titleClassName="mb-2" />
      {text && (
        <p className="text-dark-muted leading-relaxed text-sm sm:text-base mb-4 sm:mb-6">{text}</p>
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
                <img {...thumbImgProps(photo)} alt={`Accommodation ${i + 1}`} loading="lazy" decoding="async" className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
              </div>
            )}
          />
          {hasMore && (
            <button
              type="button"
              onClick={() => carouselRef.current?.next()}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-button font-semibold text-primary hover:text-primary-dark transition-colors"
            >
              View Accommodation Details <ArrowRight size={15} />
            </button>
          )}
        </>
      )}
    </section>
  );
}
