import { Heart, Globe, Shield, Compass, Star, Users, MapPin, Award } from 'lucide-react';
import type { AboutContent } from '../types';

// Icons an admin can pick from for a "value" card — keep this in sync with AdminAbout.tsx.
export const ABOUT_VALUE_ICONS: Record<string, typeof Heart> = {
  Heart, Globe, Shield, Compass, Star, Users, MapPin, Award,
};

export const DEFAULT_ABOUT: AboutContent = {
  hero: {
    label: 'Our Story',
    title: 'About ULAA',
    subtitle: 'Unseen. Local. Adventures. Activities. — A girls-only travel revolution.',
  },
  mission: {
    label: 'Our Mission',
    title: 'To make safe, meaningful travel accessible to every Indian woman.',
    text: 'We believe the open road should be available to every woman who dreams of it. ULAA exists to remove the barriers — safety concerns, solo travel anxiety, lack of like-minded company — that stop women from exploring India and the world.',
  },
  vision: {
    label: 'Our Vision',
    title: 'A world where women explore fearlessly.',
    text: 'We envision a future where no woman says "I wish I could travel" — because she knows ULAA has her back, her safety, and her spirit of adventure fully supported.',
  },
  philosophy: {
    label: 'Travel Philosophy',
    quote_line1: 'Travel is not about the destination.',
    quote_line2: "It's about who you become.",
    text: "We don't sell holidays. We create transformations. Every ULAA trip is designed to challenge, inspire, and grow the women who take it. When you return home, you return different — braver, more connected to yourself and to the world.",
  },
  values: [
    { icon: 'Heart', title: 'Safety First', description: 'Every destination, every accommodation, every guide is vetted with safety as the first criteria.' },
    { icon: 'Globe', title: 'Sustainable Travel', description: 'We support local businesses, minimize environmental impact, and leave every place better than we found it.' },
    { icon: 'Shield', title: 'Empowerment', description: 'We believe travel transforms women. Every ULAA trip is designed to push comfort zones and build confidence.' },
    { icon: 'Compass', title: 'Authenticity', description: 'No tourist traps. No generic itineraries. Only real, raw, soulful experiences that stay with you forever.' },
  ],
  timeline: [
    { year: '2020', title: 'The Idea', description: 'Three friends frustrated with unsafe solo travel experiences decided to create something better — a space designed entirely for women.' },
    { year: '2021', title: 'First Trip', description: 'Our first ever ULAA trip: 8 women, 6 days in Coorg. Zero WiFi. Infinite memories. The idea became a movement.' },
    { year: '2022', title: 'Growing Community', description: 'Word spread. 100+ women traveled with us across 10+ destinations. We realized ULAA was more than travel — it was sisterhood.' },
    { year: '2023', title: 'Hidden India', description: "We committed to exploring only hidden, underrated destinations — places that Instagram hadn't found yet. Meghalaya. Spiti. Kutch. The Northeast." },
    { year: '2024', title: 'ULAA Today', description: '500+ women. 50+ trips. 20+ destinations. And a community of fearless explorers who refuse to let the world limit their adventures.' },
  ],
};
