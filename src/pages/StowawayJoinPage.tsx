import { useNavigate, useParams } from 'react-router-dom';
import FullScreenGame from '../components/ui/FullScreenGame';
import StowawayOnline from '../components/ui/StowawayOnline';
import { usePageMeta } from '../hooks/usePageMeta';
import { pageTitle } from '../constants/site';

// The page a Stowaway invite link opens (/play/stowaway/KBR7). It shows the
// "Join" form with the code already filled in, or drops a returning player
// straight back into their seat. Hosting from here works too.
export default function StowawayJoinPage() {
  const { code } = useParams<{ code?: string }>();
  const navigate = useNavigate();

  usePageMeta({
    title: pageTitle('Join a Stowaway game'),
    description: 'Join your friends in Stowaway, the group bluffing game. Each player uses their own phone.',
    path: '/play/stowaway',
  });

  return (
    <FullScreenGame ariaLabel="Stowaway group game" onClose={() => navigate('/trips')}>
      <StowawayOnline tripTitle="Ulaa" initialCode={code} onExit={() => navigate('/trips')} />
    </FullScreenGame>
  );
}
