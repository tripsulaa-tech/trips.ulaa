import GalleryCarousel from '../../components/ui/GalleryCarousel';
import type { UpcomingTrip } from '../../types/types-index';

interface TripGallerySectionProps {
  trip: UpcomingTrip;
}

export default function TripGallerySection({ trip }: TripGallerySectionProps) {
  const allItems: { photo: string; description?: string }[] =
    (trip.gallery_items?.length ?? 0) > 0
      ? trip.gallery_items!
      : trip.gallery_images.map(photo => ({ photo }));

  return (
    <section id="gallery" className="scroll-mt-44">
      <div className="mb-6">
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-dark mb-2">Places You'll Definitely Post</h2>
        {trip.gallery_description && (
          <p className="text-dark-muted text-sm max-w-2xl">{trip.gallery_description}</p>
        )}
      </div>
      <GalleryCarousel items={allItems} />
    </section>
  );
}
