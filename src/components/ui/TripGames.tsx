import PackBagGame from './PackBagGame';
import TravelMatchGame from './TravelMatchGame';
import StowawayGame from './StowawayGame';

// The mini-games, shown on the Games page (`page` layout; `card` is a compact
// two-up variant kept for reuse). The group game
// (Stowaway) takes a full-width row of its own beneath the two solo games.
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
      <div className={`grid grid-cols-3 gap-3 sm:gap-6 items-start ${className}`}>
        <PackBagGame tripId={tripId} tripSlug={tripSlug} tripTitle={tripTitle} coverImage={coverImage} thumb />
        <TravelMatchGame tripId={tripId} tripSlug={tripSlug} tripTitle={tripTitle} thumb />
        <StowawayGame tripId={tripId} tripSlug={tripSlug} tripTitle={tripTitle} thumb />
      </div>
    );
  }
  return (
    <div className={`grid gap-2.5 ${compact ? 'grid-cols-2' : 'sm:grid-cols-2 gap-3'} ${className}`}>
      <PackBagGame tripId={tripId} tripSlug={tripSlug} tripTitle={tripTitle} coverImage={coverImage} compact={compact} />
      <TravelMatchGame tripId={tripId} tripSlug={tripSlug} tripTitle={tripTitle} compact={compact} />
      <StowawayGame tripId={tripId} tripSlug={tripSlug} tripTitle={tripTitle} className={compact ? 'col-span-2' : 'sm:col-span-2'} />
    </div>
  );
}
