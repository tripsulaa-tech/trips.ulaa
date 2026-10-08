import PackBagGame from './PackBagGame';
import TravelMatchGame from './TravelMatchGame';

// The Coming Soon mini-games, side by side. `card` is the compact two-up row
// on trip cards; `page` is the roomier layout on the trip detail page.
interface TripGamesProps {
  tripId: string;
  tripSlug: string;
  tripTitle: string;
  coverImage?: string | null;
  layout: 'card' | 'page';
  className?: string;
}

export default function TripGames({ tripId, tripSlug, tripTitle, coverImage, layout, className = '' }: TripGamesProps) {
  const compact = layout === 'card';
  return (
    <div className={`grid gap-2.5 ${compact ? 'grid-cols-2' : 'sm:grid-cols-2 gap-3'} ${className}`}>
      <PackBagGame tripId={tripId} tripSlug={tripSlug} tripTitle={tripTitle} coverImage={coverImage} compact={compact} />
      <TravelMatchGame tripId={tripId} tripSlug={tripSlug} tripTitle={tripTitle} compact={compact} />
    </div>
  );
}
