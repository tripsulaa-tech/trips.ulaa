import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/layout/Layout';
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
    <Layout>
      <section className="px-4 py-8 sm:py-12 bg-gradient-to-b from-footer to-dark min-h-[70vh]">
        <div className="relative overflow-hidden mx-auto max-w-md rounded-3xl bg-gradient-to-b from-dark via-footer to-[#1B130E] text-cream p-4 pt-5 min-h-[30rem] shadow-[0_24px_60px_rgba(0,0,0,0.45)] border border-white/10">
          <span className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-72 rounded-full bg-primary/35 blur-3xl pointer-events-none" aria-hidden="true" />
          <span className="absolute -top-10 -right-16 w-56 h-56 rounded-full bg-gold/20 blur-3xl pointer-events-none" aria-hidden="true" />
          <StowawayOnline tripTitle="Ulaa" initialCode={code} onExit={() => navigate('/trips')} />
        </div>
      </section>
    </Layout>
  );
}
