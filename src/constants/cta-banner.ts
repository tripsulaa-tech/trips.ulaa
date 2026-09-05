import type { CtaBannerContent } from '../types/types-index';

// Matches the copy that used to be hardcoded in CTASection.tsx, so nothing
// changes on the live site until an admin actually edits it via the Home
// Page admin's "CTA Banner" tab.
export const DEFAULT_CTA_BANNER: CtaBannerContent = {
  image: 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=1400&q=80',
  eyebrow: 'Your Adventure Awaits',
  heading_line1: 'Ready for your',
  heading_highlight: 'next adventure?',
  subheading: 'Book your seat today. No payment needed — just your passion to explore.',
  primary_label: 'Book Your Seat',
  secondary_label: 'Talk to Us',
};

// Merges data fetched from the DB with DEFAULT_CTA_BANNER so a partially
// saved / legacy record never crashes the admin form or the public
// CTASection (e.g. a missing field). Shared by src/admin/home-sections/
// CtaBannerSection.tsx and src/sections/home/CTASection.tsx so both read
// the exact same DB row the exact same defensive way.
export function mergeWithDefaults(data: Partial<CtaBannerContent> | null | undefined): CtaBannerContent {
  return data ? { ...DEFAULT_CTA_BANNER, ...data } : DEFAULT_CTA_BANNER;
}
