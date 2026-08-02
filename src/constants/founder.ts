import type { FounderContent } from '../types/types-index';

// Single shared source for "Meet the Founder" data, stored under the
// 'founder' site_content key (see src/admin/AdminFounder.tsx). Consumed by
// the Home page, About page, and Upcoming Trips page — all three render the
// same MeetTheFounder component (src/sections/home/MeetTheFounder.tsx)
// against this same data, so there's exactly one place to edit it and no
// risk of the sections drifting out of sync.
export const DEFAULT_FOUNDER: FounderContent = {
  photo: '',
  name: 'Founder Name',
  designation: 'Founder & CEO, ULAA',
  description:
    'A passionate traveller and women\'s safety advocate, our founder started ULAA after one too many trips where she wished she had a trusted community of women to explore with. Her mission: to make the world smaller, safer, and more beautiful — one women-only trip at a time.',
  social_links: [
    { platform: 'Instagram', url: '' },
    { platform: 'LinkedIn', url: '' },
  ],
};

// Merges data fetched from the DB with DEFAULT_FOUNDER so a partially-saved
// or legacy record (e.g. missing social_links) safely falls back instead of
// crashing the admin form or any of the public pages that render it.
export function mergeFounderWithDefaults(data: Partial<FounderContent> | null | undefined): FounderContent {
  if (!data) return DEFAULT_FOUNDER;
  return { ...DEFAULT_FOUNDER, ...data };
}
