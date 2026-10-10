import { useNavigate, useParams } from 'react-router-dom';
import FullScreenGame from '../components/ui/FullScreenGame';
import FindMyTwinOnline from '../components/ui/FindMyTwinOnline';
import { usePageMeta } from '../hooks/usePageMeta';
import { pageTitle } from '../constants/site';

// The page a Find My Twin invite link opens (/play/twin/KBR7). It shows the
// "Join" form with the code already filled in, or drops a returning player
// straight back into their seat. Hosting from here works too.
export default function FindMyTwinJoinPage() {
  const { code } = useParams<{ code?: string }>();
  const navigate = useNavigate();

  usePageMeta({
    title: pageTitle('Join Find My Twin'),
    description: 'Join your friends in Find My Twin, the Ulaa game that matches you with your travel twin. Each player uses their own phone.',
    path: '/play/twin',
  });

  return (
    <FullScreenGame ariaLabel="Find My Twin group game" onClose={() => navigate('/games')}>
      <FindMyTwinOnline tripTitle="Ulaa" initialCode={code} onExit={() => navigate('/games')} />
    </FullScreenGame>
  );
}
