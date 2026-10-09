import { motion, useReducedMotion } from 'framer-motion';
import { GameController } from '@phosphor-icons/react';
import Layout from '../components/layout/Layout';
import TripGames from '../components/ui/TripGames';
import { usePageMeta } from '../hooks/usePageMeta';
import { pageTitle } from '../constants/site';

// The standalone Games section (/games). Trip-agnostic: the games use their
// general theme here. Tapping a game opens it full screen.

export default function GamesPage() {
  const reduce = useReducedMotion();

  usePageMeta({
    title: pageTitle('Games'),
    description: 'Play Ulaa\'s travel games: pack the bag and match the destinations.',
    path: '/games',
  });

  return (
    <Layout>
      <section className="relative overflow-hidden bg-gradient-to-b from-dark via-footer to-[#1B130E] text-cream">
        <span className="absolute -top-24 left-1/2 -translate-x-1/2 w-[28rem] h-72 rounded-full bg-primary/35 blur-3xl pointer-events-none" aria-hidden="true" />
        <span className="absolute -top-10 -right-16 w-56 h-56 rounded-full bg-gold/20 blur-3xl pointer-events-none" aria-hidden="true" />
        <div className="relative max-w-[1344px] mx-auto px-4 sm:px-6 lg:px-8 pt-36 pb-12 sm:pt-44 sm:pb-16 text-center">
          <motion.span
            className="w-16 h-16 mx-auto mb-4 rounded-[22px] bg-gradient-to-br from-[#F0CE7A] to-gold text-dark flex items-center justify-center shadow-[0_14px_36px_rgba(200,150,42,0.45)]"
            animate={reduce ? undefined : { y: [0, -6, 0], rotate: [-3, 3, -3] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            aria-hidden="true"
          >
            <GameController size={36} weight="duotone" />
          </motion.span>
          <h1 className="font-display text-4xl sm:text-5xl font-extrabold text-white">Ulaa Games</h1>
          <p className="mt-3 text-cream/70 text-sm sm:text-base max-w-md mx-auto">
            Short, satisfying games for the wait before your next adventure. Best with sound and vibration on.
          </p>
        </div>
      </section>

      <section className="max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          <TripGames
            tripId="general"
            tripSlug=""
            tripTitle="Ulaa"
            coverImage={null}
            layout="thumb"
          />
        </motion.div>

        <p className="mt-6 text-center text-xs text-dark-muted">Your best scores and name stay on this device.</p>
      </section>
    </Layout>
  );
}
