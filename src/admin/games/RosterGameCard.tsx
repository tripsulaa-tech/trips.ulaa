import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ShareNetwork } from '@phosphor-icons/react';
import { useToast } from '../../components/ui/useToast';
import { loadPersisted, savePersisted } from '../../utils/sessionState';
import GameCard, { EmptyGame, primaryBtn } from './GameCard';
import type { TripRoster } from './useTripRoster';

// A game under Admin -> Games -> Play that is dealt the ticked travellers
// (Truth or Dare, Stowaway). "Make share link" saves the names (first names
// only) under a short code and the link opens the game with them filled in.
// Changing the ticks later keeps the same code via "Update link".
interface RosterGameCardProps {
  roster: TripRoster;
  /** Used for the saved link's key, e.g. "stowaway". */
  id: string;
  title: string;
  /** Public path of the game page, e.g. "/play/stowaway/game". */
  path: string;
  minPlayers: number;
  maxPlayers: number;
  /** Renders the game tile for these names. */
  renderGame: (names: string[]) => ReactNode;
  create: (names: string[], tripTitle: string) => Promise<string>;
  update: (code: string, names: string[], tripTitle: string) => Promise<boolean>;
  migrationFile: string;
}

type Share = { code: string; sig: string; tripId: string };

export default function RosterGameCard({ roster, id, title, path, minPlayers, maxPlayers, renderGame, create, update, migrationFile }: RosterGameCardProps) {
  const toast = useToast();
  const key = `ulaa:admin-games:share:${id}`;
  const { tripId, trip } = roster;
  const names = roster.names.slice(0, maxPlayers);
  const tripTitle = trip?.title ?? '';
  const [share, setShare] = useState<Share | null>(() => {
    const p = loadPersisted<Share>(key);
    return p.code ? { code: p.code, sig: p.sig ?? '', tripId: p.tripId ?? '' } : null;
  });
  const [sharing, setSharing] = useState(false);

  useEffect(() => { savePersisted<Share | Record<string, never>>(key, share ?? {}); }, [key, share]);

  // A link already sent for another trip must keep its own players.
  const mine = share && share.tripId === tripId ? share : null;
  const canShare = names.length >= minPlayers;
  const rosterSig = JSON.stringify([tripTitle, names]);
  const linkStale = !!mine && mine.sig !== rosterSig;
  const url = `${window.location.origin}${path}${mine ? `/${mine.code}` : ''}`;
  const shareText = `${trip ? `Game time for ${trip.title}! ` : 'Game time! '}Play ${title} with the group: ${url}`;

  const makeLink = async () => {
    if (!canShare || sharing) return;
    setSharing(true);
    try {
      const code = await create(names, tripTitle);
      setShare({ code, sig: rosterSig, tripId });
    } catch (err) {
      console.error(err);
      toast.error(`Couldn't make the link. Has ${migrationFile} been run in Supabase?`);
    } finally {
      setSharing(false);
    }
  };
  const updateLink = async () => {
    if (!mine || !canShare || sharing) return;
    setSharing(true);
    try {
      const ok = await update(mine.code, names, tripTitle);
      if (ok) { setShare({ code: mine.code, sig: rosterSig, tripId }); toast.success('Link updated. The same link now has these players.'); }
      else { setShare(null); toast.error('That link had expired, so make a new one.'); }
    } catch (err) {
      console.error(err);
      toast.error("Couldn't update the link. Please try again.");
    } finally {
      setSharing(false);
    }
  };

  const needTrip = !tripId;
  const empty = (text: string) => <EmptyGame>{text}</EmptyGame>;
  const game = needTrip
    ? empty(`Pick a trip to play ${title}.`)
    : canShare
      ? renderGame(names)
      : empty(`Tick at least ${minPlayers} people to play ${title}.`);
  const capped = roster.names.length > maxPlayers;
  const status = needTrip
    ? { tone: 'idle' as const, text: 'Waiting for a trip' }
    : !canShare
      ? { tone: 'warn' as const, text: `Needs ${minPlayers}+ players · ${names.length} ticked` }
      : capped
        ? { tone: 'warn' as const, text: `Max ${maxPlayers} players · first ${maxPlayers} of ${roster.names.length} are in` }
        : { tone: 'ok' as const, text: `${names.length} players ready` };

  return (
    <GameCard
      game={game}
      shareTitle={title}
      status={status}
      url={mine && canShare ? url : undefined}
      shareText={shareText}
      action={canShare && tripId && !mine ? (
        <button type="button" onClick={() => void makeLink()} disabled={sharing} className={primaryBtn}>
          <ShareNetwork size={15} aria-hidden="true" /> {sharing ? 'Making link…' : 'Make share link'}
        </button>
      ) : undefined}
      note={canShare && tripId && !mine ? 'The link opens with these players already in.' : undefined}
      footer={linkStale && canShare ? (
        <p role="status" className="flex flex-wrap items-center gap-x-2 text-xs text-dark-muted">
          Players changed since this link was made.
          <button type="button" onClick={() => void updateLink()} disabled={sharing} className="font-button font-semibold text-primary hover:underline disabled:opacity-50 min-h-[32px]">{sharing ? 'Updating…' : 'Update link'}</button>
        </p>
      ) : undefined}
    />
  );
}
