import PackBagGame from './PackBagGame';
import TravelMatchGame from './TravelMatchGame';

// The mini-games, shown on the Games page (`page` layout; `card` is a compact
// two-up variant kept for reuse).
// Truth or Dare, Stowaway, Find My Twin and Dumb Charades are admin-hosted now
// (Admin -> Games), so they are not listed here.
interface TripGamesProps {
  tripId: string;
  tripSlug: string;
  tripTitle: string;
  coverImage?: string | null;
  layout: 'card' | 'page' | 'thumb';
  className?: string;
}

export default function TripGames({ tripId, tripSlug, tripTitle, coverImage, layout, className = '' }: TripGamesProps) {
  const compact = layout === 'card';
  if (layout === 'thumb') {
    return (
      <div className={`grid grid-cols-2 gap-x-1.5 gap-y-5 sm:gap-x-3 sm:gap-6 items-start ${className}`}>
        <PackBagGame tripId={tripId} tripSlug={tripSlug} tripTitle={tripTitle} coverImage={coverImage} thumb />
        <TravelMatchGame tripId={tripId} tripSlug={tripSlug} tripTitle={tripTitle} thumb />
      </div>
    );
  }
  return (
    <div className={`grid gap-2.5 ${compact ? 'grid-cols-2' : 'sm:grid-cols-2 gap-3'} ${className}`}>
      <PackBagGame tripId={tripId} tripSlug={tripSlug} tripTitle={tripTitle} coverImage={coverImage} compact={compact} />
      <TravelMatchGame tripId={tripId} tripSlug={tripSlug} tripTitle={tripTitle} compact={compact} />
    </div>
  );
}
