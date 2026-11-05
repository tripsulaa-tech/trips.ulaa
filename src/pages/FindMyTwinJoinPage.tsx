import { useNavigate, useParams } from 'react-router-dom';
import FullScreenGame from '../components/ui/FullScreenGame';
import FindMyTwinOnline from '../components/ui/FindMyTwinOnline';
import { usePageMeta } from '../hooks/usePageMeta';
import { pageTitle } from '../constants/site';
import { loadTwinSession } from '../components/ui/findMyTwinApi';
import { useAskFirst } from '../components/ui/useAskFirst';

// The page a Find My Twin invite link opens (/play/twin/KBR7). It shows the
// "Join" form with the code already filled in, or drops a returning player
// straight back into their seat. Hosting from here works too.
export default function FindMyTwinJoinPage() {
  const { code } = useParams<{ code?: string }>();
  const navigate = useNavigate();
  const askFirst = useAskFirst();

  usePageMeta({
    title: pageTitle('Join Find My Twin'),
    description: 'Join your friends in Find My Twin, the Ulaa game that matches you with your travel twin. Each player uses their own phone.',
    path: '/play/twin',
  });

  return (
    <FullScreenGame ariaLabel="Find My Twin group game" onClose={() => {
      // Ask first when the player is inside a room (themed dialog).
      const roomCode = loadTwinSession()?.code;
      void askFirst(roomCode ? {
        title: 'Close the game?',
        message: `You are still in room ${roomCode}. You can rejoin it from the Find My Twin tile on the Games page.`,
        confirmLabel: 'Close',
        cancelLabel: 'Keep playing',
        variant: 'default',
      } : null, () => navigate('/games'));
    }}>
      <FindMyTwinOnline tripTitle="Ulaa" initialCode={code} onExit={() => navigate('/games')} />
    </FullScreenGame>
  );
}
