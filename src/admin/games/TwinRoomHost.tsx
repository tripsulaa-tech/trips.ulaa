import { useEffect, useState } from 'react';
import { Crown, ArrowsClockwise } from '@phosphor-icons/react';
import GameCard, { EmptyGame, primaryBtn, smallBtn } from './GameCard';
import FindMyTwinGame from '../../components/ui/FindMyTwinGame';
import { cleanName, loadPlayerName, savePlayerName, MAX_NAME } from '../../components/ui/gameUi';
import { twin, TwinError, twinJoinLink, loadTwinSession, saveTwinSession, clearTwinSession } from '../../components/ui/findMyTwinApi';
import { useToast } from '../../components/ui/useToast';
import type { TripRoster } from './useTripRoster';

// Admin -> Games -> Play -> Find My Twin. Everyone plays on their own phone in
// one room, so the thing to share is the ROOM's invite link, not the game's
// front page. This card creates the room for the picked trip (the admin is its
// host and joins as a player), then shares that invite link to the group.
// Opening the game tile resumes the same room.
export default function TwinRoomHost({ roster }: { roster: TripRoster }) {
  const toast = useToast();
  const [code, setCode] = useState<string | null>(() => loadTwinSession()?.code ?? null);
  const [name, setName] = useState(loadPlayerName);
  const [busy, setBusy] = useState(false);
  // true: the game shows each person their twin right away. false: they also have to go and find them in person.
  const [reveal, setReveal] = useState(true);
  const tripTitle = roster.trip?.title ?? '';
  // The names the group taps from: the travellers ticked as present, as the game spells them.
  const groupNames = roster.names.map(n => cleanName(n)).filter(Boolean);

  // While a room is open, check every few seconds who has taken their name.
  const [taken, setTaken] = useState<string[] | null>(null);
  const [roomNames, setRoomNames] = useState<string[]>([]);
  useEffect(() => {
    if (!code) return;
    let alive = true;
    const load = () => {
      twin.roster(code)
        .then(r => { if (alive) { setTaken(r.exists ? r.taken ?? [] : null); setRoomNames(r.exists ? r.names ?? [] : []); } })
        .catch(() => { /* keep the last answer */ });
    };
    load();
    const id = window.setInterval(load, 6000);
    return () => { alive = false; window.clearInterval(id); };
  }, [code]);

  if (!roster.tripId) {
    return <GameCard game={<EmptyGame>Pick a trip to play Find My Twin.</EmptyGame>} shareTitle="Find My Twin" status={{ tone: 'idle', text: 'Waiting for a trip' }} />;
  }

  const create = async () => {
    const clean = cleanName(name);
    if (!clean) { toast.error('Please type your name first.'); return; }
    setBusy(true);
    try {
      savePlayerName(clean);
      const res = await twin.create(clean, tripTitle, groupNames, reveal);
      saveTwinSession(res.code);
      setCode(res.code);
    } catch (e) {
      toast.error(e instanceof TwinError ? e.message : 'Could not create the room. Check your internet and try again.');
    } finally {
      setBusy(false);
    }
  };
  // Forget this device's room (the room itself stays open for anyone already in it).
  const forget = () => { clearTwinSession(); setCode(null); };

  const link = code ? twinJoinLink(code) : '';
  const takenSet = new Set((taken ?? []).map(n => n.toLowerCase()));
  const missing = roomNames.filter(n => !takenSet.has(n.toLowerCase()));
  const joined = roomNames.length - missing.length;
  return (
    <GameCard
      game={<FindMyTwinGame tripTitle={tripTitle} row />}
      shareTitle="Find My Twin"
      status={code ? { tone: 'ok', text: roomNames.length > 0 ? `Room ${code} · ${joined} of ${roomNames.length} joined` : `Room ${code} · ${tripTitle}` } : { tone: 'idle', text: 'No room yet' }}
      url={code ? link : undefined}
      shareText={`Find your travel twin with me on Ulaa! Room code ${code ?? ''}. Tap to join: ${link}`}
      action={code ? undefined : (
        <span className="flex w-full flex-wrap gap-2">
          <span role="radiogroup" aria-label="How the game plays" className="flex w-full rounded-lg bg-background-warm/60 p-0.5 text-xs font-button font-semibold">
            {([[true, 'Reveal twins'], [false, 'Find them in person']] as const).map(([v, label]) => (
              <button key={label} type="button" role="radio" aria-checked={reveal === v} onClick={() => setReveal(v)} className={`flex-1 min-h-[36px] rounded-md px-2 transition-colors ${reveal === v ? 'bg-white text-primary shadow-sm' : 'text-dark-muted'}`}>{label}</button>
            ))}
          </span>
          <input
            value={name}
            onChange={e => setName(e.target.value.slice(0, MAX_NAME))}
            maxLength={MAX_NAME}
            aria-label="Your name in the room"
            placeholder="Your name"
            autoComplete="given-name"
            className="min-w-0 flex-1 h-10 sm:h-9 rounded-lg border-2 border-background-warm px-3 text-sm text-dark placeholder:text-dark-muted focus:outline-none focus:border-primary/50"
          />
          <button type="button" onClick={() => void create()} disabled={busy || groupNames.length < 2} className={`${primaryBtn} shrink-0`}>
            <Crown size={15} weight="fill" aria-hidden="true" /> {busy ? 'Creating…' : 'Create room'}
          </button>
        </span>
      )}
      note={code
        ? (roomNames.length > 0
          ? (missing.length > 0 ? `Waiting for ${missing.join(', ')}. ` : 'Everyone has joined. ') + 'Open the game above to start once all have answered.'
          : 'Send this to the trip group. Open the game above to start once all have answered.')
        : `Everyone plays on their own phone. ${reveal ? 'Everyone answers, then the game shows each person their twin and the match %.' : 'After the reveal, twins go and find each other in person.'} Create the room for the ${groupNames.length} ticked players: each taps their own name, so no one can join twice or under a wrong name. You join as the host and count as an extra player.`}
      footer={code ? (
        <button type="button" onClick={forget} className={`${smallBtn} self-start`}><ArrowsClockwise size={14} aria-hidden="true" /> Use a different room</button>
      ) : undefined}
    />
  );
}
