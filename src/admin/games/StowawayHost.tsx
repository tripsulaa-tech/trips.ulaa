import StowawayGame from '../../components/ui/StowawayGame';
import GameCard from './GameCard';
import StowawayOnlineSwitch from './StowawayOnlineSwitch';
import type { TripRoster } from './useTripRoster';

// Admin -> Games -> Play: Yaaru Fake?. The tile starts either game:
//  - "Play online with friends": a room with a 4-letter code. Friends open the room's
//    own link (/play/stowaway/:code), type their name and join. The lobby has its own
//    WhatsApp / Copy link buttons, so there is no separate share link here.
//  - "Play on this phone": pass and play, dealt the ticked travellers (3 to 15).
// Below the tile, one switch opens or closes online play for players (admins can always host).
const MAX_PLAYERS = 15;
const MIN_PLAYERS = 3;

export default function StowawayHost({ roster }: { roster: TripRoster }) {
  const names = roster.names.slice(0, MAX_PLAYERS);
  return (
    <GameCard
      game={(
        <StowawayGame
          tripId={roster.trip?.id ?? ''}
          tripSlug={roster.trip?.slug ?? ''}
          tripTitle={roster.trip?.title ?? 'Ulaa'}
          players={names.length >= MIN_PLAYERS ? names : undefined}
          row
        />
      )}
      shareTitle="Yaaru Fake?"
      footer={<StowawayOnlineSwitch />}
    />
  );
}
