import type { HomeHeroContent } from '../types/types-index';
import { isHeroMediaUrl } from './home-hero';
import desktopFilm from '../assets/home-hero/turquoise-bay-desktop.mp4';
import mobileFilm from '../assets/home-hero/turquoise-bay-mobile.mp4';
import desktopPoster from '../assets/home-hero/turquoise-bay-desktop.jpg';
import mobilePoster from '../assets/home-hero/turquoise-bay-mobile.jpg';

export const BUNDLED_HERO_MEDIA = { desktopFilm, mobileFilm, desktopPoster, mobilePoster };
export function resolveHeroMedia(hero: HomeHeroContent) {
  if (hero.media_source !== 'url') return BUNDLED_HERO_MEDIA;
  const safe = (url: string, fallback: string) => isHeroMediaUrl(url) ? url : fallback;
  const film = safe(hero.video_url, desktopFilm);
  const poster = safe(hero.poster_url, desktopPoster);
  return {
    desktopFilm: film,
    mobileFilm: safe(hero.mobile_video_url, film),
    desktopPoster: poster,
    mobilePoster: safe(hero.mobile_poster_url, poster),
  };
}

export type HeroMedia = ReturnType<typeof resolveHeroMedia>;

// Optional bundled videos 2, 3 and 4. Drop files named hero-2-desktop.mp4,
// hero-2-mobile.mp4, hero-2-desktop.jpg, hero-2-mobile.jpg (and hero-3-…, hero-4-…) into
// src/assets/home-hero/ — they are picked up automatically, no code change.
const OPTIONAL_ASSETS = import.meta.glob('../assets/home-hero/hero-[234]-*.{mp4,jpg}', {
  eager: true, query: '?url', import: 'default',
}) as Record<string, string>;
const optionalAsset = (n: 2 | 3 | 4, name: string) => OPTIONAL_ASSETS[`../assets/home-hero/hero-${n}-${name}`] ?? '';

/** The videos to play, in order. Video 1 always exists; videos 2 to 4 are
 *  included only when switched on and a desktop video is available. */
export function resolveHeroClips(hero: HomeHeroContent): HeroMedia[] {
  const first = resolveHeroMedia(hero);
  const clips: HeroMedia[] = [first];
  for (const [index, extra] of hero.extra_clips.entries()) {
    if (clips.length >= hero.video_count) break;
    const n = (index + 2) as 2 | 3 | 4;
    const film = hero.media_source === 'url'
      ? (isHeroMediaUrl(extra.video_url) ? extra.video_url : '')
      : optionalAsset(n, 'desktop.mp4');
    if (!film) continue;
    const pick = (url: string, bundled: string, fallback: string) =>
      hero.media_source === 'url' ? (isHeroMediaUrl(url) ? url : fallback) : (bundled || fallback);
    const poster = pick(extra.poster_url, optionalAsset(n, 'desktop.jpg'), first.desktopPoster);
    clips.push({
      desktopFilm: film,
      mobileFilm: pick(extra.mobile_video_url, optionalAsset(n, 'mobile.mp4'), film),
      desktopPoster: poster,
      mobilePoster: pick(extra.mobile_poster_url, optionalAsset(n, 'mobile.jpg'), poster),
    });
  }
  return clips;
}
