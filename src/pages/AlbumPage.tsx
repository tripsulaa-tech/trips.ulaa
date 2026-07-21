import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MapPin, Calendar, Users, ArrowLeft, Share2 } from 'lucide-react';
import Layout from '../components/layout/Layout';
import { GalleryGrid } from '../components/ui/Lightbox';
import { getCompletedTripBySlug } from '../services/api';
import type { CompletedTrip } from '../types';
import { formatDate, PLACEHOLDER_IMAGE } from '../utils';

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
  is_published: true, created_at: '', updated_at: '',
};

export default function AlbumPage() {
  const { slug } = useParams<{ slug: string }>();
  const [album, setAlbum] = useState<CompletedTrip | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    getCompletedTripBySlug(slug)
      .then(data => setAlbum(data || DEMO_ALBUM))
      .catch(() => setAlbum(DEMO_ALBUM))
      .finally(() => setLoading(false));
  }, [slug]);

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
        <div className="absolute inset-0 flex flex-col justify-end px-4 sm:px-6 lg:px-8 pb-16 max-w-5xl mx-auto left-0 right-0">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
            <Link to="/completed-trips" className="inline-flex items-center gap-2 text-white/70 hover:text-white text-sm mb-4 transition-colors">
              <ArrowLeft size={16} /> All Albums
            </Link>
            <div className="flex w-fit items-center gap-2 bg-primary text-white text-sm font-button font-semibold px-4 py-1.5 rounded-full mb-3">
              <MapPin size={14} /> {album.destination}
            </div>
            <h1 className="font-display text-4xl md:text-6xl lg:text-7xl font-bold text-white mb-4">{album.title}</h1>
            <div className="flex flex-wrap gap-5 text-white/80 text-sm">
              <span className="flex items-center gap-2"><Calendar size={14} /> {formatDate(album.trip_date, { month: 'long', year: 'numeric' })}</span>
              <span className="flex items-center gap-2"><Users size={14} /> {album.participants} travelers</span>
              <span>{album.gallery_images.length} photos</span>
            </div>
          </motion.div>
        </div>
      </div>

      <div className="relative isolate max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-16">
        {/* Trip Story */}
        {album.story && (
          <section>
            <h2 className="font-display text-3xl font-bold text-dark mb-8">The Story</h2>
            <div className="prose max-w-none">
              {album.story.split('\n\n').map((para, i) => (
                <motion.p
                  key={i}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                  className="text-dark-muted text-lg leading-relaxed mb-6 font-body"
                >
                  {para}
                </motion.p>
              ))}
            </div>
          </section>
        )}

        {/* Gallery */}
        {album.gallery_images.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-8">
              <h2 className="font-display text-3xl font-bold text-dark">Photo Gallery</h2>
              <button
                onClick={() => navigator.share?.({ title: album.title, url: window.location.href })}
                className="flex items-center gap-2 text-sm text-dark-muted hover:text-primary transition-colors cursor-pointer"
              >
                <Share2 size={16} /> Share
              </button>
            </div>
            <GalleryGrid images={album.gallery_images} />
          </section>
        )}
      </div>
    </Layout>
  );
}
