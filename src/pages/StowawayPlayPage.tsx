import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import Layout from '../components/layout/Layout';
import StowawayGame from '../components/ui/StowawayGame';
import { cleanName } from '../components/ui/gameUi';
import stowawayCat from '../assets/stowaway-cat.png';
import { getStowawayShare } from '../services/api/stowawayShare';
import { usePageMeta } from '../hooks/usePageMeta';
import { pageTitle } from '../constants/site';

// The link an admin shares from Admin -> Games -> "Play Stowaway".
// Not listed on /games: only people who are sent the link land here. It is
// pass-and-play on one phone. The admin's chosen players are saved under a short
// code (/play/stowaway/game/k7x2, see services/api/stowawayShare.ts), so the setup
// screen opens already filled in. A link without a code opens a blank game to
// type names into. (/play/stowaway/:code is a different thing: the invite to an
// online room where everyone uses their own phone.)
const MAX_SHARED_PLAYERS = 15;

export default function StowawayPlayPage() {
  const reduce = useReducedMotion();
  const { code } = useParams<{ code: string }>();

  // Players saved under the code; `shared.code` is the code we have an answer for.
  const [shared, setShared] = useState<{ code: string; players: string[] | null; tripTitle: string } | null>(null);
  useEffect(() => {
    if (!code) return;
    let alive = true;
    getStowawayShare(code)
      .then(sh => { if (alive) setShared({ code, players: sh ? sh.players.map(cleanName).filter(Boolean).slice(0, MAX_SHARED_PLAYERS) : null, tripTitle: sh?.tripTitle ?? '' }); })
      .catch(err => { console.error(err); if (alive) setShared({ code, players: null, tripTitle: '' }); });
    return () => { alive = false; };
  }, [code]);
  const loading = !!code && shared?.code !== code;
  const codeMissing = !!code && !loading && !shared?.players;
  const players = code && shared?.code === code ? shared.players ?? undefined : undefined;
  const tripTitle = (code && shared?.code === code && shared.tripTitle) || 'Ulaa';

  usePageMeta({
    title: pageTitle('Stowaway'),
    description: 'Play Stowaway with your Ulaa trip group: give clues, vote someone offboard, spot the stowaway.',
    path: '/play/stowaway/game',
  });

  return (
    <Layout>
      <section className="relative overflow-hidden bg-gradient-to-b from-dark via-footer to-[#1B130E] text-cream min-h-[70vh]">
        <span className="absolute -top-24 left-1/2 -translate-x-1/2 w-[28rem] h-72 rounded-full bg-primary/35 blur-3xl pointer-events-none" aria-hidden="true" />
        <div className="relative max-w-md mx-auto px-4 sm:px-6 pt-36 pb-16 sm:pt-44 text-center">
          <motion.span
            className="w-16 h-16 mx-auto mb-4 rounded-[22px] bg-gradient-to-br from-[#F0CE7A] to-gold text-dark flex items-center justify-center shadow-[0_14px_36px_rgba(200,150,42,0.45)]"
            animate={reduce ? undefined : { y: [0, -6, 0], rotate: [-3, 3, -3] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            aria-hidden="true"
          >
            <img src={stowawayCat} alt="" className="w-9 h-9 object-contain" draggable={false} />
          </motion.span>
          <h1 className="font-display text-4xl font-extrabold text-white">Stowaway</h1>
          <p className="mt-3 mb-8 text-cream/70 text-sm">Pass the phone around, give your clues and find who sneaked aboard.{players ? ` ${players.length} players are ready.` : ''}</p>
          {loading ? (
            <p role="status" className="text-sm text-cream/70">Getting your game ready…</p>
          ) : (
            <>
              {codeMissing && (
                <p role="status" className="mb-4 text-sm text-[#F0CE7A]">This link has expired or isn't right, so type your names in to play.</p>
              )}
              {/* Opens on the setup screen; closing it leaves this tile to start again. */}
              <StowawayGame key={code ?? ''} defaultOpen players={players} tripTitle={tripTitle} />
            </>
          )}
        </div>
      </section>
    </Layout>
  );
}
