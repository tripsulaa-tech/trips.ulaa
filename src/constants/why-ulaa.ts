import type { WhyUlaaContent } from '../types/types-index';

// Placeholder images — replace via /admin/why-us once real trip photos are ready.
const PLACEHOLDER_IMAGE_HOST = 'https://picsum.photos';
const placeholderImage = (seed: string) => `${PLACEHOLDER_IMAGE_HOST}/seed/${seed}/600/800`;

export const DEFAULT_WHY_ULAA: WhyUlaaContent = {
  sub_heading: 'Why Choose Us',
  heading: 'Travel differently.',
  subheading: "Ulaa isn't just a travel company. We're a sisterhood of fearless explorers who believe every woman deserves to see the world safely.",
  features: [
    {
      image: placeholderImage('ulaa-girls-only'),
      title: 'Girls Only',
      description: 'Safe, comfortable, and empowering spaces designed exclusively for women travelers.',
    },
    {
      image: placeholderImage('ulaa-verified-organizers'),
      title: 'Verified Organizers',
      description: 'Every trip is planned and escorted by experienced, verified female trip leaders.',
    },
    {
      image: placeholderImage('ulaa-safe-travel'),
      title: 'Safe Travel',
      description: 'Your safety is our priority. Trusted accommodations, vetted partners, 24/7 support.',
    },
    {
      image: placeholderImage('ulaa-hidden-destinations'),
      title: 'Hidden Destinations',
      description: 'Discover places off the tourist trail — untouched, authentic, and breathtaking.',
    },
    {
      image: placeholderImage('ulaa-small-groups'),
      title: 'Small Groups',
      description: 'Intimate group sizes of 8–15 travelers ensure deeper connections and real experiences.',
    },
    {
      image: placeholderImage('ulaa-local-experiences'),
      title: 'Local Experiences',
      description: 'Support local communities, eat local food, and live like a local at every destination.',
    },
  ],
};