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
  Check,
  ArrowDown,
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
import { DEMO_ALBUM } from '../dev/demoData';

import { pageTitle } from '../constants/site';
import { safeHref } from '../utils/safeUrl';
// A description shorter than this is a one-liner (often just the title again),
// so it renders as a plain line instead of a full "Adventure Recap" block.
const RECAP_MIN_CHARS = 120;

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
  // Brief "Link copied" confirmation for browsers without the native share sheet.
  const [copied, setCopied] = useState(false);

  // Falls back to a generic title/description while the album is still
  // loading (or if the slug doesn't resolve), then swaps in the album's
  // own once it arrives — so sharing an album link renders that album's
  // title and cover photo instead of the site-wide default.
  usePageMeta({
    title: pageTitle(album ? album.title : 'Completed Trips'),
    description: album?.description,
    image: album?.cover_image,
    path: `/completed-trips/${slug ?? ''}`,
  });

  useEffect(() => {
    if (!slug) return;
    getCompletedTripBySlug(slug)
      // An unknown slug (or a failed request) leaves `album` null, which
      // renders the not-found state below. The sample album is dev-only.
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

  const handleShare = async () => {
    if (!album) return;
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: album.title, url });
      } catch {
        /* share sheet dismissed — nothing to do */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — nothing sensible to fall back to */
    }
  };

  const scrollToGallery = (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById('gallery')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  const META_STATS: { Icon: Icon; label: string; value: string | null; short?: string; jumpToGallery?: boolean }[] = [
    {
      Icon: Calendar,
      label: 'Trip date',
      value: formatDate(album.trip_date, { day: 'numeric', month: 'long', year: 'numeric' }),
      short: formatDate(album.trip_date, { day: 'numeric', month: 'short', year: 'numeric' }),
    },
    { Icon: Users, label: 'Travelers', value: album.participants ? `${album.participants}` : null },
    { Icon: Images, label: 'Photos', value: album.gallery_images.length ? `${album.gallery_images.length}` : null, jumpToGallery: true },
  ];

  return (
    <Layout>
      {/* ---------------------------------------------------------------
          Hero — the cover photo carries the page, so the overlay is kept
          to a bottom-weighted scrim (title legibility) plus a light top
          scrim so the sticky navbar doesn't float over a bright sky.
         --------------------------------------------------------------- */}
      <section className="relative h-[60vh] min-h-[440px] md:h-[70vh] md:min-h-[560px] lg:h-[calc(100svh-4rem)] lg:min-h-[640px] lg:max-h-[900px] overflow-hidden">
        <img
          src={album.cover_image || PLACEHOLDER_IMAGE}
          alt={album.title}
          className="absolute inset-0 w-full h-full object-cover"
          loading="eager"
          fetchPriority="high"
        />
        {/* Scrim: heavy at the bottom and still strong through the middle, so the location line and title stay readable on bright, busy covers. */}
        <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(45,33,24,0.92)_0%,rgba(45,33,24,0.6)_40%,rgba(45,33,24,0.2)_72%,rgba(45,33,24,0.22)_100%)] lg:bg-[linear-gradient(to_top,rgba(45,33,24,0.85)_0%,rgba(45,33,24,0.45)_30%,rgba(45,33,24,0.08)_58%,rgba(45,33,24,0.12)_100%)]" />
        {/* Soft fade into the page so the photo doesn't end on a hard edge behind the card. */}
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-24 lg:h-14 bg-gradient-to-t from-background to-transparent" />

        {/* Controls — solid white circles (readable on any cover, matches the
            app's solid cards) pinned to the top so they stay off the faces.
            pt-24 = the fixed navbar (h-20) + 16px: the hero starts at the very
            top of the page, underneath the navbar, so anything higher is hidden. */}
        <div className="absolute inset-x-0 top-0 z-10 px-4 sm:px-6 lg:px-8">
          <div className="max-w-[1344px] mx-auto pt-24 flex items-center justify-between gap-3">
            <Link
              to="/completed-trips"
              onClick={() => {
                // Tell the albums grid to restore the scroll position the
                // user was at instead of landing back at the top.
                sessionStorage.setItem('ulaa:restoreScroll:/completed-trips', '1');
              }}
              aria-label="Back to all albums"
              className="group inline-flex items-center justify-center gap-2 h-10 w-10 sm:w-auto sm:px-4 rounded-full bg-white text-dark-muted shadow-warm hover:bg-background transition-colors text-xs font-button font-bold uppercase tracking-[0.14em]"
            >
              <ArrowLeft size={18} weight="bold" className="transition-transform group-hover:-translate-x-0.5" />
              <span className="hidden sm:inline">All Albums</span>
            </Link>

            <div className="flex items-center gap-2">
              <button
                onClick={toggleLike}
                disabled={likeBusy}
                aria-pressed={liked}
                aria-label={liked ? 'Unlike this album' : 'Like this album'}
                className={`inline-flex items-center justify-center gap-1.5 h-10 min-w-10 rounded-full bg-white shadow-warm hover:bg-background text-sm font-button font-bold tabular-nums transition-all active:scale-[0.94] cursor-pointer disabled:opacity-70 disabled:cursor-default ${
                  album.likes_count > 0 ? 'px-3.5' : 'px-0'
                } ${liked ? 'text-red-500' : 'text-dark-muted'}`}
              >
                <motion.span
                  key={liked ? 'liked' : 'idle'}
                  initial={{ scale: liked ? 0.5 : 1 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 14 }}
                  className="inline-flex"
                >
                  <Heart size={19} weight={liked ? 'fill' : 'bold'} />
                </motion.span>
                {/* A "0" reads as unpopular — only show the count once there is one. */}
                {album.likes_count > 0 && album.likes_count}
              </button>
              <button
                onClick={handleShare}
                aria-label={copied ? 'Link copied' : 'Share this album'}
                aria-live="polite"
                className={`inline-flex items-center justify-center gap-1.5 h-10 min-w-10 rounded-full bg-white shadow-warm hover:bg-background text-sm font-button font-bold transition-all active:scale-[0.94] cursor-pointer ${
                  copied ? 'px-3.5 text-primary' : 'px-0 text-dark-muted'
                }`}
              >
                {copied ? <Check size={19} weight="bold" /> : <Share2 size={19} weight="bold" />}
                {copied && <span>Copied</span>}
              </button>
            </div>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 px-5 sm:px-6 lg:px-8">
          <div className="max-w-[1344px] mx-auto pb-20 sm:pb-24">
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
              {/* Eyebrow — location + batch as plain text, no badges. */}
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-white text-[13px] sm:text-base font-button font-bold uppercase tracking-[0.12em] [text-shadow:0_1px_10px_rgba(0,0,0,0.65)]">
                <a
                  href={safeHref(album.map_url) || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(album.destination)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 hover:text-white underline-offset-4 hover:underline"
                >
                  <MapPin size={18} weight="fill" className="text-primary-light drop-shadow-[0_1px_4px_rgba(0,0,0,0.5)]" /> {album.destination}
                </a>
                {album.batch && (
                  <>
                    <span aria-hidden="true" className="text-white/70">·</span>
                    <span>{formatBatchLabel(album.batch)}</span>
                  </>
                )}
              </div>

              <h1 className="font-display text-[2.5rem] sm:text-6xl lg:text-7xl font-bold tracking-tight text-white leading-[1.02] mt-3 max-w-4xl [text-shadow:0_2px_28px_rgba(0,0,0,0.4)]">
                {album.title}
              </h1>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Meta card — straddles the photo's bottom edge. One compact row of
          facts: an even three-column strip with hairline dividers. The
          Photos cell doubles as a jump link to the gallery. */}
      <div className="relative z-10 px-4 sm:px-6 lg:px-8 -mt-12 sm:-mt-14">
        <div className="max-w-[1344px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="rounded-xl bg-white ring-1 ring-black/5 shadow-warm-lg px-4 py-4 sm:w-fit sm:px-8 sm:py-5"
          >
            <div className="grid grid-flow-col auto-cols-fr sm:auto-cols-auto divide-x divide-background-warm">
              {META_STATS.map(({ Icon, label, value, short, jumpToGallery }) => {
                if (value === null) return null;
                const cellClass = 'flex flex-col items-center justify-center text-center gap-1.5 px-1.5 sm:flex-row sm:gap-3 sm:px-8 sm:first:pl-0 sm:last:pr-0';
                const inner = (
                  <>
                    <span className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                      <Icon size={19} />
                    </span>
                    <span className="leading-tight sm:text-left">
                      <span className="block text-[11px] sm:text-xs font-button font-semibold uppercase tracking-[0.1em] text-dark-muted/70">
                        {label}
                      </span>
                      <span className="mt-0.5 flex items-center justify-center sm:justify-start gap-1 font-bold text-dark group-hover:text-primary transition-colors text-[15px] sm:text-base whitespace-nowrap">
                        {short ? (
                          <>
                            <span className="sm:hidden">{short}</span>
                            <span className="hidden sm:inline">{value}</span>
                          </>
                        ) : value}
                        {jumpToGallery && <ArrowDown size={13} weight="bold" className="text-primary transition-transform group-hover:translate-y-0.5" aria-hidden="true" />}
                      </span>
                    </span>
                  </>
                );
                return jumpToGallery ? (
                  <a
                    key={label}
                    href="#gallery"
                    onClick={scrollToGallery}
                    aria-label={`${value} photos — jump to gallery`}
                    className={`${cellClass} group`}
                  >
                    {inner}
                  </a>
                ) : (
                  <div key={label} className={cellClass}>{inner}</div>
                );
              })}
            </div>
          </motion.div>
        </div>
      </div>

      <div className="relative isolate px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="max-w-[1344px] mx-auto space-y-16 sm:space-y-20">

          {/* Description — a real recap gets the full heading block; a
              one-liner is shown as a plain line so it doesn't cost ~200px. */}
          {album.description && (
            album.description.length >= RECAP_MIN_CHARS ? (
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
            ) : (
              <motion.p {...fadeUp()} className="text-dark-muted text-lg leading-relaxed font-body max-w-2xl">
                {album.description}
              </motion.p>
            )
          )}

          {/* Gallery — before the story: the photos are why people open an album. */}
          {album.gallery_images.length > 0 && (
            <section id="gallery" className="scroll-mt-24">
              <motion.div {...fadeUp()} className="mb-7 sm:mb-9">
                <SectionTitle
                  variant="plain"
                  align="left"
                  size="lg"
                  label="Gallery"
                  title="Relive the Journey"
                  rule
                />
              </motion.div>
              <GalleryGrid images={album.gallery_images} fallbackLocation={album.destination} />
            </section>
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
