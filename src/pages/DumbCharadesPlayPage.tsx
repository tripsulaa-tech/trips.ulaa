import { motion, useReducedMotion } from 'framer-motion';
import { FilmSlate } from '@phosphor-icons/react';
import Layout from '../components/layout/Layout';
import DumbCharadesGame from '../components/ui/DumbCharadesGame';
import { usePageMeta } from '../hooks/usePageMeta';
import { pageTitle } from '../constants/site';

// The link an admin shares from Admin -> Games -> "Play Dumb Charades".
// Not listed on /games: only people who are sent the link land here. It is
// team play on one phone and opens on the setup screen.
export default function DumbCharadesPlayPage() {
  const reduce = useReducedMotion();

  usePageMeta({
    title: pageTitle('Dumb Charades'),
    description: 'Play Tamil movie dumb charades with your Ulaa trip group: act it out, guess it, score for your team.',
    path: '/play/dumb-charades',
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
            <FilmSlate size={36} weight="duotone" />
          </motion.span>
          <h1 className="font-display text-4xl font-extrabold text-white">Dumb Charades</h1>
          <p className="mt-3 mb-8 text-cream/70 text-sm">Tamil movies edition. Split into teams, act it out and score.</p>
          {/* Opens on the setup screen; closing it leaves this tile to start again. */}
          <DumbCharadesGame defaultOpen />
        </div>
      </section>
    </Layout>
  );
}
