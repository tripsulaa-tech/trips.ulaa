import type { HomeHeroClip, HomeHeroContent } from '../types/types-index';

const EMPTY_CLIP: HomeHeroClip = { video_url: '', mobile_video_url: '', poster_url: '', mobile_poster_url: '' };

export const DEFAULT_HOME_HERO: HomeHeroContent = {
  schema_version: 3,
  video_enabled: true,
  autoplay: true,
  loop: true,
  video_count: 1,
  extra_clips: [{ ...EMPTY_CLIP }, { ...EMPTY_CLIP }, { ...EMPTY_CLIP }],
  media_source: 'assets',
  video_url: '',
  mobile_video_url: '',
  poster_url: '',
  mobile_poster_url: '',
  eyebrow: '',
  heading_line1: 'Girls-only',
  heading_highlight: 'travel',
  heading_line2: 'experiences.',
  subheading: 'Discover hidden destinations. Travel safely. Create unforgettable memories with like-minded women.',
  cta_label: 'Explore Trips',
  gallery_enabled: true,
  gallery_label: 'View Gallery',
  footer_text: '',
};

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, fallback: string) => typeof value === 'string' ? value : fallback;
const flag = (value: unknown, fallback: boolean) => typeof value === 'boolean' ? value : fallback;
const clip = (value: unknown): HomeHeroClip => {
  const data = object(value);
  return {
    video_url: text(data.video_url, '').trim(),
    mobile_video_url: text(data.mobile_video_url, '').trim(),
    poster_url: text(data.poster_url, '').trim(),
    mobile_poster_url: text(data.mobile_poster_url, '').trim(),
  };
};

/** Normalize saved content and session drafts. Old slide copy is migrated once;
 *  no carousel fields are written back by the new editor. */
export function mergeWithDefaults(value: unknown): HomeHeroContent {
  const data = object(value);
  const defaults = DEFAULT_HOME_HERO;
  if (data.schema_version !== 2 && data.schema_version !== 3) {
    const slides = Array.isArray(data.slides) ? data.slides : [];
    const active = slides.map(object).find(slide => slide.active === true);
    const old = { ...data, ...active };
    const first = text(old.heading_line1, 'Girls-only');
    const highlight = text(old.heading_highlight, 'travel');
    const second = text(old.heading_line2, 'experiences.');
    const original = first === 'Girls-only' && highlight === 'travel' && second === 'experiences.';
    const description = text(old.subheading, '');
    return {
      ...defaults,
      autoplay: flag(data.autoplay, true),
      heading_line1: original ? defaults.heading_line1 : first,
      heading_highlight: original ? defaults.heading_highlight : highlight,
      heading_line2: original ? defaults.heading_line2 : second,
      subheading: !description || description === 'Discover hidden destinations. Travel safely. Create unforgettable memories with like-minded women.'
        ? defaults.subheading : description,
    };
  }
  // Upgrade the previous cinematic defaults to the requested reference copy,
  // without overwriting custom copy, media URLs or playback settings.
  const priorDefault = data.schema_version === 2
    && data.heading_line1 === 'Extraordinary places.' && data.heading_line2 === 'Your kind of company.';
  const priorReference = data.schema_version === 2
    && data.heading_line1 === 'Girls-only' && data.heading_line2 === 'travel experiences.';
  return {
    schema_version: 3,
    video_enabled: flag(data.video_enabled, defaults.video_enabled),
    autoplay: flag(data.autoplay, defaults.autoplay),
    loop: flag(data.loop, defaults.loop),
    video_count: data.video_count === 2 || data.video_count === 3 || data.video_count === 4 ? data.video_count : 1,
    extra_clips: [0, 1, 2].map(i => clip(Array.isArray(data.extra_clips) ? data.extra_clips[i] : null)) as HomeHeroContent['extra_clips'],
    media_source: data.media_source === 'url' ? 'url' : 'assets',
    video_url: text(data.video_url, '').trim(),
    mobile_video_url: text(data.mobile_video_url, '').trim(),
    poster_url: text(data.poster_url, '').trim(),
    mobile_poster_url: text(data.mobile_poster_url, '').trim(),
    eyebrow: priorDefault && data.eyebrow === 'Curated journeys for women' ? '' : text(data.eyebrow, defaults.eyebrow),
    heading_line1: priorDefault ? defaults.heading_line1 : text(data.heading_line1, defaults.heading_line1),
    heading_highlight: priorDefault || priorReference ? defaults.heading_highlight : text(data.heading_highlight, data.schema_version === 2 ? '' : defaults.heading_highlight),
    heading_line2: priorDefault || priorReference ? defaults.heading_line2 : text(data.heading_line2, defaults.heading_line2),
    subheading: priorDefault && data.subheading === 'Beautiful escapes. Shared with women who get you.' ? defaults.subheading : text(data.subheading, defaults.subheading),
    cta_label: text(data.cta_label, defaults.cta_label),
    gallery_enabled: flag(data.gallery_enabled, defaults.gallery_enabled),
    gallery_label: text(data.gallery_label, defaults.gallery_label),
    footer_text: priorDefault && data.footer_text === 'A little further from ordinary.' ? '' : text(data.footer_text, defaults.footer_text),
  };
}

export function isHeroMediaUrl(value: string): boolean {
  if (!value || /[\\\s]/.test(value)) return false;
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; }
  catch { return false; }
}

export function validateHomeHero(hero: HomeHeroContent): string | null {
  if (!hero.heading_line1.trim()) return 'Enter the hero headline before saving.';
  if (!hero.cta_label.trim()) return 'Enter the Explore button label before saving.';
  if (hero.gallery_enabled && !hero.gallery_label.trim()) return 'Enter the Gallery button label before saving.';
  if (hero.media_source !== 'url') return null;
  // Video 1 plus any extra videos that are switched on.
  const clips: [string, HomeHeroClip][] = [
    ['Video 1', { video_url: hero.video_url, mobile_video_url: hero.mobile_video_url, poster_url: hero.poster_url, mobile_poster_url: hero.mobile_poster_url }],
    ...hero.extra_clips.slice(0, hero.video_count - 1).map((c, i): [string, HomeHeroClip] => [`Video ${i + 2}`, c]),
  ];
  for (const [name, c] of clips) {
    if (hero.video_enabled && !c.video_url.trim()) return `${name}: add a desktop video URL, or choose bundled assets.`;
    if (!c.poster_url.trim()) return `${name}: add a desktop still-image URL for loading and reduced-motion visitors.`;
    const fields: [string, string][] = [
      ['Desktop video', c.video_url], ['Mobile video', c.mobile_video_url],
      ['Desktop still image', c.poster_url], ['Mobile still image', c.mobile_poster_url],
    ];
    for (const [label, url] of fields) {
      if (url && !isHeroMediaUrl(url)) return `${name} · ${label}: use an HTTPS URL or a site path starting with /.`;
    }
  }
  return null;
}
