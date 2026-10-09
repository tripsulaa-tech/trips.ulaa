import TruthOrDareGame from '../../components/ui/TruthOrDareGame';
import { createTodShare, updateTodShare } from '../../services/api/todShare';
import RosterGameCard from './RosterGameCard';
import type { TripRoster } from './useTripRoster';

const MAX_PLAYERS = 40;

// Admin -> Games -> Play: Truth or Dare for the ticked travellers (pass and play
// on this phone, or a short share link: /play/truth-or-dare/:code).
export default function TruthOrDareHost({ roster }: { roster: TripRoster }) {
  return (
    <RosterGameCard
      roster={roster}
      id="truth-or-dare"
      title="Truth or Dare"
      path="/play/truth-or-dare"
      minPlayers={2}
      maxPlayers={MAX_PLAYERS}
      renderGame={names => (
        <TruthOrDareGame tripId={roster.trip?.id} tripSlug={roster.trip?.slug} tripTitle={roster.trip?.title} players={names} maxPlayers={MAX_PLAYERS} row />
      )}
      create={createTodShare}
      update={updateTodShare}
      migrationFile="add_truth_or_dare_share_links.sql"
    />
  );
}
