import type { ReactNode } from 'react';
import GameCard, { EmptyGame } from './GameCard';

// Admin -> Games -> Play, for the games that need no player list (Dumb Charades,
// Find My Twin): the game's tile plus a plain link. Nothing is saved for the
// link, so it needs no database setup. Like the other games, it waits until a
// trip is picked.
interface LinkGameHostProps {
  /** The game's tile, rendered inline (tapping it opens the full screen game). */
  game: ReactNode;
  /** Public path the link opens, e.g. "/play/dumb-charades". */
  path: string;
  title: string;
  note?: string;
  /** The trip picked in the roster card; the game stays locked until there is one. */
  tripId: string;
  tripTitle?: string;
}

export default function LinkGameHost({ game, path, title, note, tripId, tripTitle }: LinkGameHostProps) {
  const url = `${window.location.origin}${path}`;
  if (!tripId) {
    return <GameCard game={<EmptyGame>Pick a trip to play {title}.</EmptyGame>} shareTitle={title} status={{ tone: 'idle', text: 'Waiting for a trip' }} />;
  }
  return (
    <GameCard
      game={game}
      shareTitle={title}
      status={{ tone: 'ok', text: tripTitle ? `Ready · ${tripTitle}` : 'Ready to play' }}
      url={url}
      shareText={`Game time! Play ${title} with the group: ${url}`}
      note={note}
    />
  );
}
