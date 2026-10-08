import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { GameController, Compass, MapPin, Sparkle } from '@phosphor-icons/react';
import Layout from '../components/layout/Layout';
import TripGames from '../components/ui/TripGames';
import { haptic } from '../components/ui/haptics';
import { getUpcomingTrips } from '../services/api';
import { usePageMeta } from '../hooks/usePageMeta';
import { pageTitle } from '../constants/site';
import type { UpcomingTrip } from '../types/types-index';

// The standalone Games section (/games). Games used to live on the Coming
// Soon trip cards; now they have a home of their own. Visitors can optionally
// pick one of our trips to theme the games around (Pack the bag's items, the
// share text), or just play with the general "next Ulaa trip" theme.

const GENERAL = {
  id: 'general',
  slug: '',
  title: 'your next Ulaa trip',
  cover_image: null as string | null,
};

export default function GamesPage() {
  const reduce = useReducedMotion();
  const [trips, setTrips] = useState<UpcomingTrip[]>([]);
  const [pickedId, setPickedId] = useState<string>(GENERAL.id);

  usePageMeta({
    title: pageTitle('Games'),
    description: 'Play Ulaa\'s travel games: pack the bag, match the destinations and spot the stowaway with friends.',
    path: '/games',
  });

  useEffect(() => {
    let alive = true;
    getUpcomingTrips()
      .then(data => { if (alive) setTrips(data.slice(0, 8)); })
      .catch(() => { /* general theme only */ });
    return () => { alive = false; };
  }, []);

  const ctx = useMemo(() => {
    const t = trips.find(x => x.id === pickedId);
    return t ? { id: t.id, slug: t.slug, title: t.title, cover_image: t.cover_image ?? null } : GENERAL;
  }, [trips, pickedId]);

  const pick = (id: string) => { if (id !== pickedId) { haptic('select'); setPickedId(id); } };
  const chip = (active: boolean) =>
    `shrink-0 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-button font-semibold border transition duration-150 active:scale-95 touch-manipulation [-webkit-tap-highlight-color:transparent] ${
      active ? 'bg-primary text-white border-primary shadow-[0_6px_16px_rgba(168,90,42,0.35)]' : 'bg-white text-dark border-background-warm hover:border-primary/40'
    }`;

  return (
    <Layout>
      <section className="relative overflow-hidden bg-gradient-to-b from-dark via-footer to-[#1B130E] text-cream">
        <span className="absolute -top-24 left-1/2 -translate-x-1/2 w-[28rem] h-72 rounded-full bg-primary/35 blur-3xl pointer-events-none" aria-hidden="true" />
        <span className="absolute -top-10 -right-16 w-56 h-56 rounded-full bg-gold/20 blur-3xl pointer-events-none" aria-hidden="true" />
        <div className="relative max-w-[1344px] mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-12 sm:pt-20 sm:pb-16 text-center">
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

      <section className="max-w-xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="flex items-center gap-2 mb-3 text-xs font-bold uppercase tracking-[0.16em] text-dark-muted">
          <Compass size={16} weight="duotone" className="text-primary" aria-hidden="true" /> Play themed around
        </div>
        <div
          className="-mx-4 px-4 sm:mx-0 sm:px-0 flex gap-2 overflow-x-auto pb-2 snap-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="radiogroup"
          aria-label="Game theme"
        >
          <button type="button" role="radio" aria-checked={pickedId === GENERAL.id} onClick={() => pick(GENERAL.id)} className={`${chip(pickedId === GENERAL.id)} snap-start`}>
            <Sparkle size={14} weight="fill" aria-hidden="true" /> Any adventure
          </button>
          {trips.map(t => (
            <button key={t.id} type="button" role="radio" aria-checked={pickedId === t.id} onClick={() => pick(t.id)} className={`${chip(pickedId === t.id)} snap-start max-w-[16rem]`}>
              <MapPin size={14} weight="fill" aria-hidden="true" className="shrink-0" />
              <span className="truncate">{t.title}</span>
            </button>
          ))}
        </div>

        <motion.div
          key={ctx.id}
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="mt-5"
        >
          <TripGames
            tripId={ctx.id}
            tripSlug={ctx.slug}
            tripTitle={ctx.title}
            coverImage={ctx.cover_image}
            layout="page"
          />
        </motion.div>

        <p className="mt-6 text-center text-xs text-dark-muted">Your best scores and name stay on this device.</p>
      </section>
    </Layout>
  );
}
