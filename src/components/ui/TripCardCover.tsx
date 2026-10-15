import type { CoverImageCrop } from '../../types/types-index';
import { getCoverImageStyle } from '../../utils/utils-index';
import { thumbImgProps } from '../../utils/imageUrls';

interface TripCardCoverProps {
  src: string;
  alt: string;
  crop?: CoverImageCrop | null;
  loading?: 'lazy' | 'eager';
}

/**
 * Cover photo for the Trip Card (and the Trip Card preview in the Cover Image
 * Editor). The card's photo area has a fixed shape, so a normal "cover" fit
 * trims whatever doesn't match it — fine for landscape photos, but it cuts
 * off the edges of posters / photos with baked-in text.
 *
 * When the admin ticks "Show full image on Trip Card" (crop.fit === 'contain'),
 * the whole image is shown, uncropped, over a blurred copy of itself so the
 * leftover space looks intentional rather than like empty bars. Otherwise this
 * behaves exactly as before (object-cover + saved focal point / zoom).
 *
 * Parent must be a sized, overflow-hidden box.
 */
export default function TripCardCover({ src, alt, crop, loading = 'lazy' }: TripCardCoverProps) {
  // The card shows the photo at ~450px wide, so the small copy is plenty - unless
  // the admin zoomed in (crop.zoom), which magnifies the image and would look soft.
  const imgSrc = !crop || crop.zoom <= 1.25 ? thumbImgProps(src) : { src };
  if (crop?.fit === 'contain') {
    return (
      <div className="relative w-full h-full overflow-hidden bg-dark/5">
        <img
          {...imgSrc}
          alt=""
          aria-hidden="true"
          loading={loading}
          className="absolute inset-0 w-full h-full object-cover scale-125 blur-2xl opacity-80"
        />
        <img {...imgSrc} alt={alt} loading={loading} className="relative w-full h-full object-contain" />
      </div>
    );
  }
  return (
    <img
      {...imgSrc}
      alt={alt}
      loading={loading}
      className="w-full h-full object-cover"
      style={getCoverImageStyle(crop)}
    />
  );
}
