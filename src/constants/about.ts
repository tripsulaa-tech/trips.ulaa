import type { AboutContent } from '../types/types-index';

export const DEFAULT_ABOUT: AboutContent = {
  // 1. Hero Banner
  hero: {
    image: '',
    heading: 'About ULAA',
    subheading: 'Unseen. Local. Adventures. Activities. — A girls-only travel revolution.',
    cta_label: 'Explore Trips',
    cta_url: '/trips',
  },

  // 2. Our Story
  our_story: {
    heading: 'Our Story',
    description:
      'ULAA was born from a simple frustration — why should women have to compromise their sense of adventure because the world hasn\'t made it safe enough? We set out to change that. Every trip we design puts safety, sisterhood, and soul-level experiences at the centre.',
    image: '',
  },

  // 3. Have You Ever...
  have_you_ever: {
    heading: 'Have You Ever...',
    items: [
      { text: 'Friends cancelled?' },
      { text: 'Worried about safety?' },
      { text: 'Felt too nervous to travel alone?' },
      { text: 'Wanted to explore but had no one to go with?' },
    ],
  },

  // 4. Welcome to Ulaa
  welcome_to_ulaa: {
    heading: 'Welcome to ULAA',
    subheading: 'Your home for safe, soulful, sisterhood travel.',
    items: [
      { icon: '🛡️', title: 'Safety First', description: 'Every destination, accommodation, and guide is vetted with women\'s safety as the top priority.' },
      { icon: '🌿', title: 'Curated Experiences', description: 'No tourist traps. Only real, raw, soulful adventures off the beaten path.' },
      { icon: '👯', title: 'Instant Sisterhood', description: 'Join a group of like-minded women and leave with friendships that last a lifetime.' },
      { icon: '✈️', title: 'Stress-Free Planning', description: 'We handle everything — stays, transport, meals — so you just show up and explore.' },
    ],
  },

  // 5. Why Ulaa is Different
  why_different: {
    heading: 'Why ULAA is Different',
    subheading: 'We\'re not just a travel company. We\'re a movement.',
    cards: [
      { heading: 'Women-Only Safe Spaces', description: 'Every trip is exclusively for women, creating an environment where you can truly let your guard down.' },
      { heading: 'Handpicked Hidden Gems', description: 'We seek out destinations Instagram hasn\'t discovered yet — raw, authentic, and unforgettable.' },
      { heading: 'Small Groups, Big Connections', description: 'Our groups are intentionally small so everyone gets personal attention and real bonds form.' },
      { heading: 'Local & Sustainable', description: 'We partner with local guides, homestays, and businesses to keep travel meaningful and responsible.' },
      { heading: 'Solo-Friendly by Design', description: 'Whether you\'re a seasoned solo traveller or stepping out for the first time, you\'re in the right place.' },
      { heading: 'End-to-End Support', description: 'From the moment you book to the moment you\'re home, our team is with you every step of the way.' },
    ],
  },

  // 6. Our Community
  community: {
    heading: 'Our Community',
    subheading: 'Real women. Real moments. Real magic.',
    photos: [],
  },

  // 7. Statistics
  stats: {
    girls_travelled: 500,
    destinations: 20,
    friendships_made: 1200,
    avg_trip_rating: 4.9,
  },

  // 8. Testimonials section heading
  testimonials_heading: 'What Our Girls Say',

  // 9. Your Ulaa Journey
  journey: {
    heading: 'Your ULAA Journey',
    subheading: 'Every adventure begins with a single step.',
    steps: [
      { heading: 'Discover Your Trip', description: 'Browse our carefully curated calendar of upcoming women-only trips across India and beyond.' },
      { heading: 'Book Your Spot', description: 'Reserve your seat with a simple booking form. Our team confirms within 24 hours.' },
      { heading: 'Prepare & Connect', description: 'Get your trip kit, connect with your travel sisters in our WhatsApp group, and pack your excitement.' },
      { heading: 'Live the Experience', description: 'Arrive, explore, laugh, push boundaries, and soak in every single moment.' },
      { heading: 'Come Home Changed', description: 'Return with new friends, new stories, and a version of yourself you didn\'t know existed.' },
    ],
  },

  // 10. Meet the Founder
  founder: {
    photo: '',
    name: 'Founder Name',
    designation: 'Founder & CEO, ULAA',
    description:
      'A passionate traveller and women\'s safety advocate, our founder started ULAA after one too many trips where she wished she had a trusted community of women to explore with. Her mission: to make the world smaller, safer, and more beautiful — one women-only trip at a time.',
    social_links: [
      { platform: 'Instagram', url: '' },
      { platform: 'LinkedIn', url: '' },
    ],
  },
};
