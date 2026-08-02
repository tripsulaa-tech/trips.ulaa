import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MapPin, Calendar, Users, Images, ArrowLeft, Share2, Heart } from 'lucide-react';
import Layout from '../components/layout/Layout';
import { getCompletedTripBySlug, likeCompletedTrip, unlikeCompletedTrip } from '../services/api';
import type { CompletedTrip } from '../types/types-index';
import { formatDate, formatBatchLabel, PLACEHOLDER_IMAGE, getVisitorId } from '../utils/utils-index';

const DEMO_ALBUM: CompletedTrip = {
  id: '1', title: 'Magical Meghalaya',
  destination: 'Meghalaya', slug: 'magical-meghalaya',
  trip_date: '2024-10-15',
  description: 'We explored the wettest place on Earth — living root bridges, crystal clear rivers, and the warmth of Khasi culture.',
  story: `It started with 14 women, two Innova Crystas, and a shared dream to see the living root bridges of Meghalaya before the world discovered them.

The morning we left Guwahati, it was raining — which, we would soon learn, is essentially the default weather of Meghalaya. But rather than dampen spirits, the rain felt like nature's welcome.

Our first stop was Cherrapunji — the wettest place on Earth, and for good reason. Waterfalls erupted from every cliff face. The Seven Sisters Falls was at full throttle, a curtain of white noise that silenced every conversation.

The highlight? The Double Decker Living Root Bridge. A two-hour trek through dense forest, over handmade bamboo bridges, across rushing streams. By the time we saw it — a bridge grown entirely from the roots of a rubber tree over 500 years — there wasn't a dry eye among us.

The nights were spent in a small homestay run by a Khasi grandmother who cooked the most extraordinary rice and smoked pork. She laughed when we told her this was our favorite meal on any ULAA trip.

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

  useEffect(() => {
    if (!slug) return;
    getCompletedTripBySlug(slug)
      .then(data => setAlbum(data || DEMO_ALBUM))
      .catch(() => setAlbum(DEMO_ALBUM))
      .finally(() => setLoading(false));
  }, [slug]);

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
        <div className="h-screen flex items-center justify-center">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!album) {
    return (
      <Layout>
        <div className="min-h-screen flex flex-col items-center justify-center">
          <p className="font-display text-3xl text-dark-muted">Album not found.</p>
          <Link to="/completed-trips" className="mt-4 text-primary hover:underline">← Back to Trips</Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Hero Banner */}
      <div className="relative h-[60vh] md:h-[75vh] overflow-hidden">
        <img
          src={album.cover_image || PLACEHOLDER_IMAGE}
          alt={album.title}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-dark/30 via-dark/20 to-dark/90" />
        <div className="absolute inset-0 flex flex-col justify-end px-4 sm:px-6 lg:px-8 pb-16 max-w-[1344px] mx-auto left-0 right-0">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
            <Link to="/completed-trips" className="inline-flex items-center gap-2 text-white/70 hover:text-white text-sm mb-4 transition-colors">
              <ArrowLeft size={16} /> All Albums
            </Link>
            <a
              href={album.map_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(album.destination)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-fit items-center gap-2 bg-white/15 backdrop-blur-md border border-white/30 text-white text-sm font-button font-semibold px-4 py-1.5 rounded-md mb-3 hover:bg-white/25 transition-colors"
            >
              <MapPin size={14} /> {album.destination}
            </a>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <h1 className="font-display text-4xl md:text-6xl lg:text-7xl font-bold text-white">{album.title}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-white/80 text-sm">
              <span className="flex items-center gap-1.5"><Calendar size={14} /> {formatDate(album.trip_date, { month: 'long', year: 'numeric' })}</span>
              <span className="w-px h-4 bg-white/30" />
              <span className="flex items-center gap-1.5"><Users size={14} /> {album.participants} travelers</span>
              {album.gallery_images.length > 0 && (
                <>
                  <span className="w-px h-4 bg-white/30" />
                  <span className="flex items-center gap-1.5"><Images size={14} /> {album.gallery_images.length} photos</span>
                </>
              )}
              {album.batch && (
                <>
                  <span className="w-px h-4 bg-white/30" />
                  <span className="shrink-0 bg-white/15 backdrop-blur-md border border-white/30 text-white text-sm font-button font-semibold px-3 py-1.5 rounded-md">
                    {formatBatchLabel(album.batch)}
                  </span>
                </>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      <div className="relative isolate px-4 sm:px-6 lg:px-8 py-16">
        <div className="max-w-[1344px] mx-auto space-y-16">
        {/* Trip Story */}
        {album.story && (
          <section>
            <h2 className="font-display text-3xl font-bold text-dark mb-8">The Story</h2>
            <div className="prose max-w-none">
              {album.story.split('\n\n').map((para, i) => (
                <motion.p
                  key={i}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="text-dark-muted text-lg leading-relaxed mb-6 font-body"
                >
                  {para}
                </motion.p>
              ))}
            </div>
          </section>
        )}

        {/* Adventure Recap */}
        {album.description && (
          <section>
            <h2 className="font-display text-3xl font-bold text-dark mb-6">Adventure Recap</h2>
            <p className="text-dark-muted text-lg leading-relaxed font-body">{album.description}</p>
          </section>
        )}

        {/* Gallery */}
        {album.gallery_images.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-8">
              <h2 className="font-display text-3xl font-bold text-dark">Relive the Journey</h2>
              <div className="flex items-center gap-4">
                <button
                  onClick={toggleLike}
                  disabled={likeBusy}
                  aria-label={liked ? 'Unlike this album' : 'Like this album'}
                  className={`flex items-center gap-2 text-sm transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-default ${
                    liked ? 'text-red-500' : 'text-dark-muted hover:text-red-500'
                  }`}
                >
                  <Heart size={16} className={liked ? 'fill-red-500' : ''} />
                  {liked ? 'Liked' : 'Like'}{album.likes_count > 0 ? ` (${album.likes_count})` : ''}
                </button>
                <button
                  onClick={() => navigator.share?.({ title: album.title, url: window.location.href })}
                  className="flex items-center gap-2 text-sm text-dark-muted hover:text-primary transition-colors cursor-pointer"
                >
                  <Share2 size={16} /> Share
                </button>
              </div>
            </div>
            <div className="masonry-grid">
              {album.gallery_images.map((img, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.45, delay: Math.min(i, 12) * 0.04, ease: [0.22, 1, 0.36, 1] }}
                  className="masonry-item rounded-xl overflow-hidden"
                >
                  <img
                    src={img}
                    alt={`${album.title} ${i + 1}`}
                    loading="lazy"
                    className="w-full object-cover"
                  />
                </motion.div>
              ))}
            </div>
          </section>
        )}
        </div>
      </div>
    </Layout>
  );
}
