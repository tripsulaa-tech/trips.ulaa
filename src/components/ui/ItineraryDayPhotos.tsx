interface ItineraryDayPhotosProps {
  images: string[];
  className?: string;
}

// Shows up to 4 of the day's photos directly in the card as a static
// bento collage — no click-to-expand lightbox/carousel (cards must be
// fully readable without any interaction).
//
// Height comes from the aspect ratio the parent passes in (not a fixed
// pixel height) so tiles keep a photo-friendly shape and don't get
// over-cropped when the card width changes.
export default function ItineraryDayPhotos({ images, className = '' }: ItineraryDayPhotosProps) {
  if (!images || images.length === 0) return null;

  const shown = images.slice(0, 4);
  const img = 'w-full h-full object-cover rounded-lg';

  if (shown.length === 1) {
    return (
      <div className={`w-full rounded-lg overflow-hidden shrink-0 ${className}`}>
        <img src={shown[0]} alt="" loading="lazy" className="w-full h-full object-cover" />
      </div>
    );
  }

  if (shown.length === 2) {
    return (
      <div className={`w-full grid grid-cols-2 gap-1 shrink-0 ${className}`}>
        {shown.map((src, i) => (
          <img key={i} src={src} alt="" loading="lazy" className={img} />
        ))}
      </div>
    );
  }

  if (shown.length === 3) {
    // 3 photos: one tall image on the left, two stacked on the right.
    return (
      <div className={`w-full grid grid-cols-2 grid-rows-2 gap-1 shrink-0 ${className}`}>
        <img src={shown[0]} alt="" loading="lazy" className={`row-span-2 ${img}`} />
        <img src={shown[1]} alt="" loading="lazy" className={img} />
        <img src={shown[2]} alt="" loading="lazy" className={img} />
      </div>
    );
  }

  // 4 photos (bento): a big hero on the left, one wide tile top-right,
  // two small tiles bottom-right.
  return (
    <div className={`w-full grid grid-cols-4 grid-rows-2 gap-1 shrink-0 ${className}`}>
      <img src={shown[0]} alt="" loading="lazy" className={`col-span-2 row-span-2 ${img}`} />
      <img src={shown[1]} alt="" loading="lazy" className={`col-span-2 ${img}`} />
      <img src={shown[2]} alt="" loading="lazy" className={img} />
      <img src={shown[3]} alt="" loading="lazy" className={img} />
    </div>
  );
}
