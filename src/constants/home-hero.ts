import type { HomeHeroContent } from '../types/types-index';

// No slides by default — HeroSection.tsx falls back to the bundled static
// hero.webp image until the admin adds photos via /admin/home-hero, so the
// homepage never renders blank.
export const DEFAULT_HOME_HERO: HomeHeroContent = {
  slides: [],
  autoplay: true,
  interval_seconds: 6,
  heading_line1: 'Girls-only',
  heading_highlight: 'travel',
  heading_line2: 'experiences.',
  subheading: 'Discover hidden destinations. Travel safely. Create unforgettable memories with like-minded women.',
};

// Merges data fetched from the DB with DEFAULT_HOME_HERO so a partially
// saved / legacy record never crashes the admin form or the public
// HeroSection (e.g. a missing `slides` array). Shared by
// src/admin/AdminHomeHero.tsx and src/sections/home/HeroSection.tsx so both
// read the exact same DB row the exact same defensive way.
//
// Also backfills per-slide headline text (heading_line1/highlight/line2/
// subheading) from the content-level defaults for any slide saved before
// per-slide headlines existed, so older saved photos keep showing text
// instead of going blank the first time this loads.
export function mergeWithDefaults(data: Partial<HomeHeroContent> | null | undefined): HomeHeroContent {
  const merged: HomeHeroContent = data
    ? {
        ...DEFAULT_HOME_HERO,
        ...data,
        slides: Array.isArray(data.slides) ? data.slides : DEFAULT_HOME_HERO.slides,
      }
    : DEFAULT_HOME_HERO;

  return {
    ...merged,
    slides: merged.slides.map(slide => ({
      ...slide,
      heading_line1: slide.heading_line1 || merged.heading_line1,
      heading_highlight: slide.heading_highlight || merged.heading_highlight,
      heading_line2: slide.heading_line2 || merged.heading_line2,
      subheading: slide.subheading || merged.subheading,
    })),
  };
}
