interface ItineraryDayPhotosProps {
  images: string[];
  className?: string;
}

// Shows up to 3 of the day's photos directly in the card as a static
// collage — no click-to-expand lightbox/carousel, per the itinerary
// redesign (cards must be fully readable without any interaction).
export default function ItineraryDayPhotos({ images, className = '' }: ItineraryDayPhotosProps) {
  if (!images || images.length === 0) return null;

  const shown = images.slice(0, 3);

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
          <img key={i} src={src} alt="" loading="lazy" className="w-full h-full object-cover rounded-lg" />
        ))}
      </div>
    );
  }

  // 3 photos: one tall image on the left, two stacked on the right.
  return (
    <div className={`w-full grid grid-cols-2 grid-rows-2 gap-1 shrink-0 ${className}`}>
      <img src={shown[0]} alt="" loading="lazy" className="row-span-2 w-full h-full object-cover rounded-lg" />
      <img src={shown[1]} alt="" loading="lazy" className="w-full h-full object-cover rounded-lg" />
      <img src={shown[2]} alt="" loading="lazy" className="w-full h-full object-cover rounded-lg" />
    </div>
  );
}
