import StowawayGame from '../../components/ui/StowawayGame';
import { createStowawayShare, updateStowawayShare } from '../../services/api/stowawayShare';
import RosterGameCard from './RosterGameCard';
import type { TripRoster } from './useTripRoster';

// Admin -> Games -> Play: Stowaway for the ticked travellers (3 to 15 players;
// pass and play on this phone, or a short share link: /play/stowaway/game/:code).
// The game's own "Play online with friends" option is still on its tile.
export default function StowawayHost({ roster }: { roster: TripRoster }) {
  return (
    <RosterGameCard
      roster={roster}
      id="stowaway"
      title="Stowaway"
      path="/play/stowaway/game"
      minPlayers={3}
      maxPlayers={15}
      renderGame={names => (
        <StowawayGame tripId={roster.trip?.id ?? ''} tripSlug={roster.trip?.slug ?? ''} tripTitle={roster.trip?.title ?? 'Ulaa'} players={names} row />
      )}
      create={createStowawayShare}
      update={updateStowawayShare}
      migrationFile="add_stowaway_share_links.sql"
    />
  );
}
