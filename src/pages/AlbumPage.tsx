import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { Icon } from '@phosphor-icons/react';
import {
  MapPin,
  Calendar,
  Users,
  Images,
  ArrowLeft,
  ShareNetwork as Share2,
  Heart,
} from '@phosphor-icons/react';
import Layout from '../components/layout/Layout';
import SectionTitle from '../components/ui/SectionTitle';
import NotFoundState from '../components/ui/NotFoundState';
import { GalleryGrid } from '../components/ui/GalleryViewer';
import { AlbumSkeleton } from '../components/ui/Skeletons';
import { usePageMeta } from '../hooks/usePageMeta';
import { getCompletedTripBySlug, likeCompletedTrip, unlikeCompletedTrip } from '../services/api';
import { subscribeToTable } from '../services/realtime';
import type { CompletedTrip } from '../types/types-index';
import { formatDate, formatBatchLabel, PLACEHOLDER_IMAGE, getVisitorId } from '../utils/utils-index';
import { fadeUp } from '../utils/animation';

const DEMO_ALBUM: CompletedTrip = {
  id: '1', title: 'Magical Meghalaya',
  destination: 'Meghalaya', slug: 'magical-meghalaya',
  trip_date: '2024-10-15',
  description: 'We explored the wettest place on Earth — living root bridges, crystal clear rivers, and the warmth of Khasi culture.',
  story: `It started with 14 women, two Innova Crystas, and a shared dream to see the living root bridges of Meghalaya before the world discovered them.

The morning we left Guwahati, it was raining — which, we would soon learn, is essentially the default weather of Meghalaya. But rather than dampen spirits, the rain felt like nature's welcome.

Our first stop was Cherrapunji — the wettest place on Earth, and for good reason. Waterfalls erupted from every cliff face. The Seven Sisters Falls was at full throttle, a curtain of white noise that silenced every conversation.

The highlight? The Double Decker Living Root Bridge. A two-hour trek through dense forest, over handmade bamboo bridges, across rushing streams. By the time we saw it — a bridge grown entirely from the roots of a rubber tree over 500 years — there wasn't a dry eye among us.

The nights were spent in a small homestay run by a Khasi grandmother who cooked the most extraordinary rice and smoked pork. She laughed when we told her this was our favorite meal on any Ulaa trip.

Meghalaya reminded us why we travel — not for Instagram, but for the moments that change you.`,
  participants: 14,
  cover_image: 'https://images.unsplash.com/photo-1584464491033-06628f3a6b7b?w=1200&q=80',
  gallery_images: [
    'https://images.unsplash.com/photo-1584464491033-06628f3a6b7b?w=800&q=80',
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80',
    'https://images.unsplash.com/photo-1598091381862-6a65b2a36ab4?w=800&q=80',
    'https://images.unsplash.com/photo-1588668214407-6ea9a6d8c272?w=800&q=80',
    'https://images.unsplash.com/photo-1619546813926-a78fa6372cd2?w=800&q=80',
    'https://images.unsplash.com/photo-1519922639192-e73293ca430e?w=800&q=80',
    'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?w=800&q=80',
    'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=800&q=80',
    'https://images.unsplash.com/photo-1591017403997-beeee1ec6981?w=800&q=80',
  ],
  is_published: true, likes_count: 0, created_at: '', updated_at: '',
};

export default function AlbumPage() {
  const { slug } = useParams<{ slug: string }>();
  const [album, setAlbum] = useState<CompletedTrip | null>(null);
  const [loading, setLoading] = useState(true);
  // The like COUNT lives server-side on completed_trips.likes_count,
  // derived from real rows in completed_trip_likes (one per visitor per
  // trip — see like_completed_trip/unlike_completed_trip in api.ts). The
  // DB itself enforces "one like per visitor" via that table's primary
  // key; localStorage here only remembers this device's own visitor_id and
  // its last-known liked state, purely to drive the button's filled/
  // outline look on load — it's not what's doing the enforcing anymore.
  const [liked, setLiked] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);

  // Falls back to a generic title/description while the album is still
  // loading (or if the slug doesn't resolve), then swaps in the album's
  // own once it arrives — so sharing an album link renders that album's
  // title and cover photo instead of the site-wide default.
  usePageMeta({
    title: album ? `${album.title} | Ulaa Trips` : 'Completed Trips | Ulaa Trips',
    description: album?.description,
    image: album?.cover_image,
    path: `/completed-trips/${slug ?? ''}`,
  });

  useEffect(() => {
    if (!slug) return;
    getCompletedTripBySlug(slug)
      .then(data => setAlbum(data || DEMO_ALBUM))
      .catch(() => setAlbum(DEMO_ALBUM))
      .finally(() => setLoading(false));
  }, [slug]);

  // Live likes — as soon as *any* visitor (including this one, from another
  // tab) likes/unlikes this album, likes_count is recomputed server-side and
  // pushed here via Realtime, so everyone currently viewing the album sees
  // the count update immediately without refreshing. Scoped to this album's
  // id only, and only wired up once we know that id.
  useEffect(() => {
    if (!album?.id) return;
    const unsubscribe = subscribeToTable<{ likes_count: number }>(
      'completed_trips',
      (payload) => {
        const newCount = (payload.new as { likes_count?: number } | undefined)?.likes_count;
        if (typeof newCount === 'number') {
          setAlbum(a => (a ? { ...a, likes_count: newCount } : a));
        }
      },
      `id=eq.${album.id}`
    );
    return unsubscribe;
  }, [album?.id]);

  // Reads this device's previously-stored liked state once the album has
  // loaded (or changed). Adjusted during render rather than in an effect —
  // localStorage.getItem is synchronous, so there's no need for an effect
  // just to avoid an extra cascading render.
  const [prevLikedAlbumId, setPrevLikedAlbumId] = useState<string | null>(null);
  if (album && album.id !== prevLikedAlbumId) {
    setPrevLikedAlbumId(album.id);
    setLiked(localStorage.getItem(`ulaa_liked_album_${album.id}`) === '1');
  }

  const toggleLike = async () => {
    if (!album || likeBusy) return;
    const wasLiked = liked;
    const next = !wasLiked;
    const visitorId = getVisitorId();
    // Optimistic update — flip the button and count immediately, roll back
    // if the request fails.
    setLiked(next);
    setAlbum(a => a && { ...a, likes_count: Math.max(0, a.likes_count + (next ? 1 : -1)) });
    setLikeBusy(true);
    try {
      const newCount = next
        ? await likeCompletedTrip(album.id, visitorId)
        : await unlikeCompletedTrip(album.id, visitorId);
      setAlbum(a => a && { ...a, likes_count: newCount });
      if (next) {
        localStorage.setItem(`ulaa_liked_album_${album.id}`, '1');
      } else {
        localStorage.removeItem(`ulaa_liked_album_${album.id}`);
      }
    } catch {
      // Roll back on failure so the button/count don't lie about what's
      // actually saved.
      setLiked(wasLiked);
      setAlbum(a => a && { ...a, likes_count: Math.max(0, a.likes_count + (next ? -1 : 1)) });
    } finally {
      setLikeBusy(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <AlbumSkeleton />
      </Layout>
    );
  }

  if (!album) {
    return (
      <Layout>
        <NotFoundState
          icon={<Images size={28} />}
          title="Album not found"
          message="This album may have been removed or the link is out of date. Browse our other travel stories instead."
          actionLabel="Back to All Albums"
          actionTo="/completed-trips"
          onActionClick={() => sessionStorage.setItem('ulaa:restoreScroll:/completed-trips', '1')}
        />
      </Layout>
    );
  }

  // The hero's fact row, assembled once so the card below can render it in
  // a single pass and skip any stat this album doesn't have.
  const META_STATS: { Icon: Icon; label: string; value: string | null }[] = [
    { Icon: Calendar, label: 'Trip date', value: formatDate(album.trip_date, { day: 'numeric', month: 'long', year: 'numeric' }) },
    { Icon: Users, label: 'Travelers', value: album.participants ? `${album.participants}` : null },
    { Icon: Images, label: 'Photos', value: album.gallery_images.length ? `${album.gallery_images.length}` : null },
  ];

  return (
    <Layout>
      {/* ---------------------------------------------------------------
          Hero — the cover photo carries the page, so the overlay is kept
          to a bottom-weighted scrim (title legibility) plus a light top
          scrim so the sticky navbar doesn't float over a bright sky.
         --------------------------------------------------------------- */}
      <section className="relative h-[62vh] min-h-[440px] md:h-[72vh] md:min-h-[560px] overflow-hidden">
        <img
          src={album.cover_image || PLACEHOLDER_IMAGE}
          alt={album.title}
          className="absolute inset-0 w-full h-full object-cover"
          loading="eager"
          fetchPriority="high"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-dark/60 via-dark/10 to-dark/85" />

        <div className="absolute inset-x-0 bottom-0">
          <div className="max-w-[1344px] mx-auto px-4 sm:px-6 lg:px-8 pb-14 sm:pb-20">
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
              <Link
                to="/completed-trips"
                onClick={() => {
                  // Tell the albums grid to restore the scroll position the
                  // user was at instead of landing back at the top.
                  sessionStorage.setItem('ulaa:restoreScroll:/completed-trips', '1');
                }}
                className="group inline-flex items-center gap-2 rounded-full bg-white/15 backdrop-blur-md border border-white/25 text-white/90 hover:text-white hover:bg-white/25 text-xs font-button font-semibold uppercase tracking-[0.15em] px-4 py-2 transition-colors"
              >
                <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-0.5" /> All Albums
              </Link>

              <div className="flex flex-wrap items-center gap-2.5 mt-5">
                <a
                  href={album.map_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(album.destination)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary text-white text-xs sm:text-sm font-button font-semibold px-3.5 py-1.5 hover:bg-primary-dark transition-colors"
                >
                  <MapPin size={14} weight="fill" /> {album.destination}
                </a>
                {album.batch && (
                  <span className="inline-flex items-center rounded-full bg-white/15 backdrop-blur-md border border-white/30 text-white text-xs sm:text-sm font-button font-semibold px-3.5 py-1.5">
                    {formatBatchLabel(album.batch)}
                  </span>
                )}
              </div>

              <h1 className="font-display text-4xl sm:text-5xl lg:text-7xl font-bold text-white leading-[1.05] mt-4 max-w-4xl">
                {album.title}
              </h1>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Meta bar — lifted out of the hero into a card that straddles the
          photo's bottom edge, so the trip's facts and the like/share
          actions sit together in one place instead of being split between
          the hero and the gallery heading. */}
      <div className="relative z-10 px-4 sm:px-6 lg:px-8 -mt-9 sm:-mt-11">
        <div className="max-w-[1344px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="rounded-2xl bg-white border border-background-warm shadow-warm-lg px-5 sm:px-8 py-5 flex flex-wrap items-center justify-between gap-x-8 gap-y-5"
          >
            <div className="flex flex-wrap items-center gap-x-6 sm:gap-x-10 gap-y-4">
              {META_STATS.map(({ Icon, label, value }) => value !== null && (
                <div key={label} className="flex items-center gap-3">
                  <span className="w-9 h-9 shrink-0 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    <Icon size={18} />
                  </span>
                  <span className="leading-tight">
                    <span className="block text-[11px] font-button font-semibold uppercase tracking-[0.12em] text-dark-muted/60">
                      {label}
                    </span>
                    <span className="block font-semibold text-dark text-sm sm:text-base">{value}</span>
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={toggleLike}
                disabled={likeBusy}
                aria-label={liked ? 'Unlike this album' : 'Like this album'}
                className={`inline-flex items-center gap-2 h-10 px-4 rounded-full border text-sm font-button font-semibold transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-default ${
                  liked
                    ? 'border-red-200 bg-red-50 text-red-500'
                    : 'border-background-warm text-dark-muted hover:border-red-200 hover:text-red-500'
                }`}
              >
                <Heart size={17} className={liked ? 'fill-red-500' : ''} />
                {album.likes_count}
              </button>
              <button
                onClick={() => navigator.share?.({ title: album.title, url: window.location.href })}
                aria-label="Share this album"
                className="inline-flex items-center gap-2 h-10 px-4 rounded-full border border-background-warm text-dark-muted text-sm font-button font-semibold hover:border-primary hover:text-primary transition-colors cursor-pointer"
              >
                <Share2 size={17} />
                <span className="hidden sm:inline">Share</span>
              </button>
            </div>
          </motion.div>
        </div>
      </div>

      <div className="relative isolate px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="max-w-[1344px] mx-auto space-y-16 sm:space-y-20">

          {/* Adventure Recap — heading and copy side by side, so the recap
              reads as a standfirst rather than another stacked block. */}
          {album.description && (
            <motion.section {...fadeUp()} className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-10">
              <div className="md:col-span-4">
                <SectionTitle
                  variant="plain"
                  align="left"
                  size="lg"
                  label="In short"
                  title="Adventure Recap"
                  rule
                />
              </div>
              <p className="md:col-span-8 text-dark-muted text-lg sm:text-xl leading-relaxed font-body">
                {album.description}
              </p>
            </motion.section>
          )}

          {/* The Story — narrow measure, drop cap on the opening paragraph
              and a hairline rule down the left so a long read stays a read
              instead of a wall of text. */}
          {album.story && (
            <motion.section {...fadeUp()} className="max-w-3xl">
              <SectionTitle
                variant="plain"
                align="left"
                size="lg"
                label="How it went"
                title="The Story"
                titleClassName="mb-8"
              />
              <div className="border-l-2 border-background-warm pl-6 sm:pl-8 space-y-6">
                {album.story.split('\n\n').map((para, i) => (
                  <p
                    key={i}
                    className={`text-dark-muted text-lg leading-relaxed font-body ${
                      i === 0
                        ? 'first-letter:float-left first-letter:font-display first-letter:font-bold first-letter:text-primary first-letter:text-6xl first-letter:leading-[0.85] first-letter:mr-3 first-letter:mt-1'
                        : ''
                    }`}
                  >
                    {para}
                  </p>
                ))}
              </div>
            </motion.section>
          )}

          {/* Gallery */}
          {album.gallery_images.length > 0 && (
            <section>
              <motion.div {...fadeUp()} className="mb-7 sm:mb-9">
                <SectionTitle
                  variant="plain"
                  align="left"
                  size="lg"
                  label={`${album.gallery_images.length} photos`}
                  title="Relive the Journey"
                  rule
                />
              </motion.div>
              <GalleryGrid images={album.gallery_images} fallbackLocation={album.destination} />
            </section>
          )}

          {/* Tail nav — the page used to stop dead at the last photo. */}
          <div className="pt-2">
            <Link
              to="/completed-trips"
              onClick={() => sessionStorage.setItem('ulaa:restoreScroll:/completed-trips', '1')}
              className="group inline-flex items-center gap-2 text-primary font-button font-semibold text-sm hover:text-primary-dark transition-colors"
            >
              <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-1" />
              Back to all albums
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}
