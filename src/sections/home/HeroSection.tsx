import { useRef, useState, useEffect, useMemo } from 'react';
import { ArrowRight, Pause, Play } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { getSiteContent } from '../../services/api';
import { subscribeToTable } from '../../services/realtime';
import { DEFAULT_HOME_HERO, mergeWithDefaults } from '../../constants/home-hero';
import type { HomeHeroContent } from '../../types/types-index';
import { BUNDLED_HERO_MEDIA, resolveHeroClips } from '../../constants/home-hero-media';
import './home-hero.css';

type Connection = EventTarget & { saveData?: boolean };

export default function HeroSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hero, setHero] = useState<HomeHeroContent>(DEFAULT_HOME_HERO);
  const [settingsReady, setSettingsReady] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const clips = useMemo(() => resolveHeroClips(hero), [hero]);
  const clipsKey = clips.map(c => `${c.desktopFilm}|${c.mobileFilm}`).join('~');
  const [clipIndex, setClipIndex] = useState(0);
  const [failedClips, setFailedClips] = useState<number[]>([]);
  const activeIndex = Math.min(clipIndex, clips.length - 1);
  const media = clips[activeIndex];
  const multiple = clips.length > 1;
  const film = mobile ? media.mobileFilm : media.desktopFilm;
  const [allowAutomaticMotion, setAllowAutomaticMotion] = useState(false);
  const [requestedPlayback, setRequestedPlayback] = useState<boolean | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [inView, setInView] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [hasFrame, setHasFrame] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      getSiteContent<Partial<HomeHeroContent>>('home_hero')
        .then(data => { if (!cancelled) setHero(mergeWithDefaults(data)); })
        .catch(() => {})
        .finally(() => { if (!cancelled) setSettingsReady(true); });
    };
    refresh();
    const unsubscribe = subscribeToTable('site_content', refresh, 'key=eq.home_hero');
    return () => { cancelled = true; unsubscribe(); };
  }, []);

  useEffect(() => {
    // Choose one download per visit. Resizing never downloads a second film.
    setMobile(window.matchMedia('(max-width: 639px)').matches);
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const connection = (navigator as Navigator & { connection?: Connection }).connection;
    const update = () => {
      setAllowAutomaticMotion(!motion.matches && !connection?.saveData);
      setRequestedPlayback(null);
    };
    update();
    motion.addEventListener('change', update);
    connection?.addEventListener('change', update);
    return () => {
      motion.removeEventListener('change', update);
      connection?.removeEventListener('change', update);
    };
  }, []);

  useEffect(() => {
    const updateVisibility = () => setPageVisible(!document.hidden);
    updateVisibility();
    document.addEventListener('visibilitychange', updateVisibility);
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(
      entries => setInView(entries[0].isIntersecting),
      { rootMargin: '-80px 0px 0px 0px' },
    );
    if (sectionRef.current) observer?.observe(sectionRef.current);
    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', updateVisibility);
    };
  }, []);

  // The video list or the on/off switch changed: start again from video 1.
  useEffect(() => {
    setClipIndex(0);
    setFailedClips([]);
    setHasFrame(false);
    setPlaying(false);
    setFailed(false);
    setEnabled(false);
    setRequestedPlayback(null);
  }, [clipsKey, hero.video_enabled]);

  // Moving to the next video fades it in over its still image. A pause or
  // play the visitor chose stays in force.
  useEffect(() => {
    setHasFrame(false);
    setPlaying(false);
  }, [film]);

  useEffect(() => { setPosterFailed(false); }, [media.desktopPoster, media.mobilePoster]);

  function goToClip(index: number) {
    setClipIndex(index);
  }

  function handleEnded() {
    setPlaying(false);
    if (!multiple) return;
    const next = activeIndex + 1;
    if (next < clips.length) goToClip(next);
    else if (hero.loop) goToClip(0);
  }

  function handleError() {
    setPlaying(false);
    const failedNow = [...failedClips, activeIndex];
    setFailedClips(failedNow);
    // Skip a video that cannot load and carry on with the next working one.
    for (let step = 1; step < clips.length; step++) {
      const candidate = (activeIndex + step) % clips.length;
      if (!failedNow.includes(candidate)) { goToClip(candidate); return; }
    }
    setFailed(true);
  }

  const wantsPlayback = requestedPlayback ?? (allowAutomaticMotion && hero.autoplay);
  const shouldPlay = settingsReady && hero.video_enabled && wantsPlayback && inView && pageVisible && !failed;

  useEffect(() => {
    if (shouldPlay && film && !enabled) setEnabled(true);
    const video = videoRef.current;
    if (!video || !enabled) return;
    if (!shouldPlay) {
      video.pause();
      return;
    }
    // Muting before play is required by mobile autoplay policies.
    video.muted = true;
    void video.play().catch(() => {
      // Autoplay may be blocked (e.g. iOS Low Power Mode). The poster and
      // explicit Play control remain available; never hide the hero copy.
    });
    return () => video.pause();
  }, [shouldPlay, film, enabled]);

  function togglePlayback() {
    if (playing) {
      setRequestedPlayback(false);
      videoRef.current?.pause();
    } else {
      setRequestedPlayback(true);
      // Repeat play directly in the gesture if the browser blocked autoplay.
      if (enabled && videoRef.current) {
        videoRef.current.muted = true;
        void videoRef.current.play().catch(() => {});
      }
    }
  }

  return (
    <div className="ulaa-hero-frame">
      <section ref={sectionRef} data-home-hero className="ulaa-home-hero" aria-label="The ULAA experience">
        <picture className="ulaa-hero-poster" aria-hidden="true">
          <source media="(max-width: 639px)" srcSet={posterFailed ? BUNDLED_HERO_MEDIA.mobilePoster : media.mobilePoster} />
          <img src={posterFailed ? BUNDLED_HERO_MEDIA.desktopPoster : media.desktopPoster} alt="" onError={() => setPosterFailed(true)} fetchPriority="high" width={1280} height={720} />
        </picture>
        {hero.video_enabled && enabled && !failed && (
          <video
            key={film}
            ref={videoRef}
            className={`ulaa-hero-film${hasFrame ? ' is-visible' : ''}`}
            src={film}
            muted loop={hero.loop && !multiple} playsInline preload="auto"
            aria-hidden="true" tabIndex={-1}
            onPlaying={() => { setHasFrame(true); setPlaying(true); }}
            onPause={() => setPlaying(false)}
            onEnded={handleEnded}
            onError={handleError}
          />
        )}
        <div className="ulaa-hero-shade" aria-hidden="true" />
        <div className="ulaa-hero-content">
          <div className="ulaa-hero-copy">
            {hero.eyebrow && <p className="ulaa-hero-eyebrow">{hero.eyebrow}</p>}
            <h1 className="ulaa-hero-heading">
              <span>{hero.heading_line1}</span>
              {(hero.heading_highlight || hero.heading_line2) && <span>
                {hero.heading_highlight && <em className="ulaa-hero-highlight">{hero.heading_highlight}</em>}
                {hero.heading_highlight && hero.heading_line2 ? ' ' : ''}{hero.heading_line2}
              </span>}
            </h1>
            {hero.subheading && <p className="ulaa-hero-description">{hero.subheading}</p>}
            <div className="ulaa-hero-actions">
              <Link to="/trips" className="ulaa-hero-explore">{hero.cta_label} <ArrowRight size={18} aria-hidden="true" /></Link>
              {hero.gallery_enabled && <Link to="/completed-trips" className="ulaa-hero-gallery"><Play size={16} aria-hidden="true" />{hero.gallery_label}</Link>}
            </div>
          </div>
        </div>
        <div className="ulaa-hero-toolbar">
          <p>{hero.footer_text}</p>
          <div className="ulaa-hero-controls">
            {multiple && (
              <div className="ulaa-hero-dots" role="group" aria-label="Background videos">
                {clips.map((_, index) => (
                  <button key={index} type="button" className="ulaa-hero-dot" onClick={() => goToClip(index)}
                    aria-label={`Show video ${index + 1} of ${clips.length}`} aria-current={index === activeIndex ? 'true' : undefined}>
                    <span />
                  </button>
                ))}
              </div>
            )}
            {hero.video_enabled && !failed && (
              <button type="button" onClick={togglePlayback} aria-label={playing ? 'Pause background video' : 'Play background video'} title={playing ? 'Pause video' : 'Play video'}>
                {playing ? <Pause size={16} weight="fill" aria-hidden="true" /> : <Play size={16} weight="fill" aria-hidden="true" />}
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
