import type { ReactNode } from 'react';
import GameCard from './GameCard';

// Admin -> Games -> Play, for the games that need no player list (Dumb Charades,
// Find My Twin): the game's tile plus a plain link. Nothing is saved for the
// link, so it needs no database setup.
interface LinkGameHostProps {
  /** The game's tile, rendered inline (tapping it opens the full screen game). */
  game: ReactNode;
  /** Public path the link opens, e.g. "/play/dumb-charades". */
  path: string;
  title: string;
  note?: string;
}

export default function LinkGameHost({ game, path, title, note }: LinkGameHostProps) {
  const url = `${window.location.origin}${path}`;
  return <GameCard game={game} shareTitle={title} url={url} shareText={`Game time! Play ${title} with the group: ${url}`} note={note} />;
}
