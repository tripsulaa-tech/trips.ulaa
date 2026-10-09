import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Sparkle } from '@phosphor-icons/react';
import Layout from '../components/layout/Layout';
import TruthOrDareGame from '../components/ui/TruthOrDareGame';
import { cleanName } from '../components/ui/gameUi';
import { usePageMeta } from '../hooks/usePageMeta';
import { pageTitle } from '../constants/site';

// The link an admin shares from Admin -> Games -> "Play Truth or Dare".
// Not listed on /games: only people who are sent the link land here. It is
// pass-and-play on one phone. The admin's chosen players ride in the URL
// fragment (#p=[...]) as display names only, so the setup screen opens already
// filled in; a link without them opens a blank game to type names into.
const MAX_SHARED_PLAYERS = 40;

function playersFromHash(hash: string): string[] | undefined {
  try {
    const raw = new URLSearchParams(hash.replace(/^#/, '')).get('p');
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return undefined;
    const names = parsed.filter((n): n is string => typeof n === 'string').map(cleanName).filter(Boolean).slice(0, MAX_SHARED_PLAYERS);
    return names.length >= 2 ? names : undefined;
  } catch {
    return undefined;
  }
}

export default function TruthOrDarePlayPage() {
  const reduce = useReducedMotion();
  const { hash } = useLocation();
  const players = useMemo(() => playersFromHash(hash), [hash]);

  usePageMeta({
    title: pageTitle('Truth or Dare'),
    description: 'Play Truth or Dare with your Ulaa trip group: spin the bottle, flip a card, earn points.',
    path: '/play/truth-or-dare',
  });

  return (
    <Layout>
      <section className="relative overflow-hidden bg-gradient-to-b from-dark via-footer to-[#1B130E] text-cream min-h-[70vh]">
        <span className="absolute -top-24 left-1/2 -translate-x-1/2 w-[28rem] h-72 rounded-full bg-primary/35 blur-3xl pointer-events-none" aria-hidden="true" />
        <div className="relative max-w-md mx-auto px-4 sm:px-6 pt-36 pb-16 sm:pt-44 text-center">
          <motion.span
            className="w-16 h-16 mx-auto mb-4 rounded-[22px] bg-gradient-to-br from-secondary to-primary text-white flex items-center justify-center shadow-[0_14px_36px_rgba(168,90,42,0.5)]"
            animate={reduce ? undefined : { y: [0, -6, 0], rotate: [-3, 3, -3] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            aria-hidden="true"
          >
            <Sparkle size={36} weight="duotone" />
          </motion.span>
          <h1 className="font-display text-4xl font-extrabold text-white">Truth or Dare</h1>
          <p className="mt-3 mb-8 text-cream/70 text-sm">Pass the phone around, spin to pick who is next, and flip a card if you dare.{players ? ` ${players.length} players are ready.` : ''}</p>
          {/* With players in the link it goes straight to the first spin; a blank link opens setup. Closing it leaves this tile to start again. */}
          <TruthOrDareGame key={hash} defaultOpen players={players} maxPlayers={MAX_SHARED_PLAYERS} />
        </div>
      </section>
    </Layout>
  );
}
