import { useNavigate, useParams } from 'react-router-dom';
import FullScreenGame from '../components/ui/FullScreenGame';
import YaaruAvanOnline from '../components/ui/YaaruAvanOnline';
import { usePageMeta } from '../hooks/usePageMeta';
import { pageTitle } from '../constants/site';

// The page a Stowaway invite link opens (/play/stowaway/KBR7). It shows the
// "Join" form with the code already filled in, or drops a returning player
// straight back into their seat. Hosting from here works too.
export default function YaaruAvanJoinPage() {
  const { code } = useParams<{ code?: string }>();
  const navigate = useNavigate();

  usePageMeta({
    title: pageTitle('Join a Yaaru Avan? game'),
    description: 'Join your friends in Yaaru Avan?, the group bluffing game. Each player uses their own phone.',
    path: '/play/stowaway',
  });

  return (
    <FullScreenGame ariaLabel="Yaaru Avan? group game" onClose={() => navigate('/trips')}>
      <YaaruAvanOnline tripTitle="Ulaa" initialCode={code} onExit={() => navigate('/trips')} />
    </FullScreenGame>
  );
}
