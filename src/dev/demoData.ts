/**
 * Development-only sample content.
 *
 * Used so the UI can be previewed locally before the database has any rows.
 * In production builds every export below is empty / null, so real visitors
 * never see invented trips, albums, testimonials or stock gallery photos —
 * an empty database or a failed request shows a proper empty / not-found
 * state instead.
 */
import type { CompletedTrip, Testimonial } from '../types/types-index';

const RAW_COMPLETED: CompletedTrip[] = [
  {
    id: '1', title: 'Magical Meghalaya', destination: 'Meghalaya',
    slug: 'magical-meghalaya', trip_date: '2024-10-15',
    description: 'We explored the wettest place on Earth — living root bridges, crystal clear rivers, and the warmth of Khasi culture.',
    participants: 14, cover_image: 'https://images.unsplash.com/photo-1584464491033-06628f3a6b7b?w=600&q=80',
    gallery_images: ['https://images.unsplash.com/photo-1584464491033-06628f3a6b7b?w=800&q=80', 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80'],
    is_published: true, likes_count: 0, created_at: '', updated_at: '',
  },
  {
    id: '2', title: 'Ladakh on Wheels', destination: 'Ladakh, J&K',
    slug: 'ladakh-on-wheels', trip_date: '2024-08-20',
    description: 'An epic road journey through the world\'s highest motorable passes — where the sky meets the earth.',
    participants: 10, cover_image: 'https://images.unsplash.com/photo-1598091381862-6a65b2a36ab4?w=600&q=80',
    gallery_images: [],
    is_published: true, likes_count: 0, created_at: '', updated_at: '',
  },
  {
    id: '3', title: 'Andaman Island Hopping', destination: 'Andaman Islands',
    slug: 'andaman-island-hopping', trip_date: '2024-06-10',
    description: 'Pristine beaches, bioluminescent waters, and snorkeling through coral gardens with our fearless Ulaa women.',
    participants: 12, cover_image: 'https://images.unsplash.com/photo-1519922639192-e73293ca430e?w=600&q=80',
    gallery_images: [],
    is_published: true, likes_count: 0, created_at: '', updated_at: '',
  },
  {
    id: '4', title: 'Rajasthan Royal Route', destination: 'Rajasthan',
    slug: 'rajasthan-royal-route', trip_date: '2024-03-05',
    description: 'Palaces, sand dunes, camel rides at sunset, and the rich heritage of India\'s most colorful state.',
    participants: 16, cover_image: 'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?w=600&q=80',
    gallery_images: [],
    is_published: true, likes_count: 0, created_at: '', updated_at: '',
  },
  {
    id: '5', title: 'Coorg Monsoon Retreat', destination: 'Coorg, Karnataka',
    slug: 'coorg-monsoon', trip_date: '2024-07-22',
    description: 'Dancing in the rain, misty coffee estates, and the lush magic of Coorg during the monsoon season.',
    participants: 10, cover_image: 'https://images.unsplash.com/photo-1563911302283-d2bc129e7570?w=600&q=80',
    gallery_images: [],
    is_published: true, likes_count: 0, created_at: '', updated_at: '',
  },
  {
    id: '6', title: 'Uttarakhand Spiritual Trail', destination: 'Uttarakhand',
    slug: 'uttarakhand-spiritual', trip_date: '2024-05-01',
    description: 'Rishikesh yoga, Haridwar aarti, and trekking through the Garhwal Himalayas on this soulful journey.',
    participants: 13, cover_image: 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=600&q=80',
    gallery_images: [],
    is_published: true, likes_count: 0, created_at: '', updated_at: '',
  },
];

const RAW_ALBUM: CompletedTrip = {
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

const RAW_TESTIMONIALS: Testimonial[] = [
  {
    id: '1', name: 'Priya Sharma', rating: 5, destination: 'Spiti Valley',
    review: 'Ulaa completely changed how I travel. I went from being someone who never traveled alone to summiting passes at 15,000 feet. The sisterhood is real — these trips gave me lifelong friends and a new version of myself.',
    photo: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&q=80',
    is_published: true, sort_order: 1, created_at: '',
  },
  {
    id: '2', name: 'Ananya Krishnan', rating: 5, destination: 'Kerala Backwaters',
    review: 'As someone who was skeptical about group travel, Ulaa proved me completely wrong. Small groups, thoughtful itineraries, and an organizer who genuinely cares. Already booked my second trip!',
    photo: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=200&q=80',
    is_published: true, sort_order: 2, created_at: '',
  },
  {
    id: '3', name: 'Meera Nair', rating: 5, destination: 'Meghalaya',
    review: 'The hidden gems Ulaa finds are unreal. Places I didn\'t even know existed. And the safety and comfort they provide makes you forget all your worries. Pure magic, every single time.',
    photo: 'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=200&q=80',
    is_published: true, sort_order: 3, created_at: '',
  },
  {
    id: '4', name: 'Ritu Agarwal', rating: 5, destination: 'Andaman Islands',
    review: 'I travelled solo for the first time ever on a Ulaa trip and it was the best decision of my life. The team is professional, the destinations are stunning, and the women you meet become family.',
    photo: 'https://images.unsplash.com/photo-1519699047748-de8e457a634e?w=200&q=80',
    is_published: true, sort_order: 4, created_at: '',
  },
];

const RAW_GALLERY = [
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=500&q=80',
  'https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?w=400&q=80',
  'https://images.unsplash.com/photo-1619546813926-a78fa6372cd2?w=500&q=80',
  'https://images.unsplash.com/photo-1598091381862-6a65b2a36ab4?w=400&q=80',
  'https://images.unsplash.com/photo-1584464491033-06628f3a6b7b?w=500&q=80',
  'https://images.unsplash.com/photo-1519922639192-e73293ca430e?w=400&q=80',
  'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?w=500&q=80',
  'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=400&q=80',
  'https://images.unsplash.com/photo-1591017403997-beeee1ec6981?w=500&q=80',
];

const DEV = import.meta.env.DEV;

export const DEMO_COMPLETED: CompletedTrip[] = DEV ? RAW_COMPLETED : [];
export const DEMO_ALBUM: CompletedTrip | null = DEV ? RAW_ALBUM : null;
export const DEMO_TESTIMONIALS: Testimonial[] = DEV ? RAW_TESTIMONIALS : [];
export const DEMO_GALLERY_IMAGES: string[] = DEV ? RAW_GALLERY : [];
