import { useState } from 'react';
import type { HomeHeroClip, HomeHeroContent } from '../../types/types-index';
import { FORM_INPUT_CLASS as inputClass } from '../../constants/formStyles';
import Select from '../../components/ui/Select';
import { DEFAULT_HOME_HERO } from '../../constants/home-hero';
import { resolveHeroClips } from '../../constants/home-hero-media';

export default function HeroBannerSection({ content, setContent, sectionRef }: {
  content: HomeHeroContent;
  setContent: React.Dispatch<React.SetStateAction<HomeHeroContent>>;
  sectionRef: (el: HTMLDivElement | null) => void;
}) {
  const [mobilePreview, setMobilePreview] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const clips = resolveHeroClips(content);
  const media = clips[Math.min(previewIndex, clips.length - 1)];
  const film = mobilePreview ? media.mobileFilm : media.desktopFilm;
  const poster = mobilePreview ? media.mobilePoster : media.desktopPoster;
  const update = <K extends keyof HomeHeroContent>(key: K, value: HomeHeroContent[K]) => {
    setContent(current => ({ ...current, [key]: value }));
    setPreviewError(false);
  };
  const updateExtra = (index: 0 | 1 | 2, key: keyof HomeHeroClip, value: string) => {
    setContent(current => {
      const extra = [...current.extra_clips] as HomeHeroContent['extra_clips'];
      extra[index] = { ...extra[index], [key]: value };
      return { ...current, extra_clips: extra };
    });
    setPreviewError(false);
  };
  const field = (key: 'eyebrow' | 'heading_line1' | 'heading_line2' | 'heading_highlight' | 'gallery_label' | 'cta_label' | 'footer_text', label: string, max: number) => (
    <div key={key}>
      <label htmlFor={`hero-${key}`} className="block text-sm font-medium text-dark mb-1">{label}</label>
      <input id={`hero-${key}`} value={content[key]} onChange={event => update(key, event.target.value)} maxLength={max} className={inputClass} />
    </div>
  );

  return (
    <div ref={sectionRef} data-section={1} className="scroll-mt-4 space-y-8">
      <section className="space-y-4" aria-labelledby="hero-motion-title">
        <h2 id="hero-motion-title" className="font-display text-lg font-bold text-dark pb-3 border-b border-background-warm">Video hero</h2>
        <p className="text-sm text-dark-muted">Up to four films play one after another, each with a still-image fallback. Changes go live when you save this page.</p>
        <div>
          <label htmlFor="hero-video-count" className="block text-sm font-medium text-dark mb-1">Number of videos</label>
          <Select inputId="hero-video-count" value={content.video_count}
            onChange={count => { update('video_count', count as 1 | 2 | 3 | 4); setPreviewIndex(0); }}
            options={[
              { value: 1, label: '1 video' },
              { value: 2, label: '2 videos — play one after another' },
              { value: 3, label: '3 videos — play one after another' },
              { value: 4, label: '4 videos — play one after another' },
            ]} />
          {content.video_count > 1 && <p className="text-xs text-dark-muted mt-1">Each video plays to the end, then the next one fades in. “Loop video” repeats the whole set. Visitors get dots to jump between videos.</p>}
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-4">
          {([
            ['video_enabled', 'Show video background'],
            ['autoplay', 'Play automatically'],
            ['loop', 'Loop video'],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm font-medium text-dark">
              <input type="checkbox" checked={content[key]} disabled={key !== 'video_enabled' && !content.video_enabled}
                onChange={event => update(key, event.target.checked)} className="w-4 h-4 accent-primary" />
              {label}
            </label>
          ))}
        </div>
        <p className="text-xs text-dark-muted">Turning video off shows the still image. Reduced-motion and data-saving preferences prevent autoplay; visitors can choose Play.</p>
      </section>

      <section className="space-y-4" aria-labelledby="hero-media-title">
        <h2 id="hero-media-title" className="font-display text-lg font-bold text-dark pb-3 border-b border-background-warm">Video and still images</h2>
        <div>
          <label htmlFor="hero-media-source" className="block text-sm font-medium text-dark mb-1">Media source</label>
          <Select inputId="hero-media-source" value={content.media_source}
            onChange={source => update('media_source', source as 'assets' | 'url')}
            options={[
              { value: 'assets', label: 'Bundled website assets' },
              { value: 'url', label: 'Hosted video and image URLs' },
            ]} />
        </div>
        {content.media_source === 'assets' ? (
          <div className="rounded-lg bg-background-warm/60 p-4 text-sm text-dark space-y-2">
            <p>The homepage uses the desktop and mobile videos included with your website.</p>
            <p>To change video 1, replace the two MP4s and matching JPG stills in <code className="break-all">src/assets/home-hero/</code>, keeping their filenames, then rebuild and deploy.</p>
            {content.video_count > 1 && (
              <p>For video 2{content.video_count > 3 ? ', 3 and 4' : content.video_count > 2 ? ' and 3' : ''}, add <code className="break-all">hero-2-desktop.mp4</code>, <code className="break-all">hero-2-mobile.mp4</code>, <code className="break-all">hero-2-desktop.jpg</code>, <code className="break-all">hero-2-mobile.jpg</code>{content.video_count > 2 ? ` (and the same four files named hero-3-…${content.video_count > 3 ? ' and hero-4-…' : ''})` : ''} to that folder, then rebuild and deploy. A video without its desktop MP4 is skipped.</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-dark-muted">Paste direct HTTPS file URLs or paths from your website. Use MP4 (H.264) for broad device support. YouTube and Vimeo page links are not video files.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {([
                ['video_url', 'Desktop video URL', 'Required when video is on. Landscape 16:9.'],
                ['mobile_video_url', 'Mobile video URL', 'Optional portrait 9:16. Blank uses the desktop video.'],
                ['poster_url', 'Desktop still-image URL', 'Required. Use a frame matching the video, in JPG or WebP.'],
                ['mobile_poster_url', 'Mobile still-image URL', 'Optional portrait crop. Blank uses the desktop still.'],
              ] as const).map(([key, label, hint]) => (
                <div key={key}>
                  <label htmlFor={`hero-${key}`} className="block text-sm font-medium text-dark mb-1">{label}</label>
                  <input id={`hero-${key}`} type="text" inputMode="url" value={content[key]} placeholder="https://… or /media/…"
                    onChange={event => update(key, event.target.value)} className={inputClass} />
                  <p className="text-xs text-dark-muted mt-1">{hint}</p>
                </div>
              ))}
            </div>
            {content.extra_clips.slice(0, content.video_count - 1).map((extra, index) => (
              <div key={index} className="space-y-3 pt-2">
                <h3 className="font-display text-base font-bold text-dark">Video {index + 2}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {([
                    ['video_url', 'Desktop video URL', 'Required. Landscape 16:9. Blank skips this video.'],
                    ['mobile_video_url', 'Mobile video URL', 'Optional portrait 9:16. Blank uses the desktop video.'],
                    ['poster_url', 'Desktop still-image URL', 'Required. Use a frame matching the video.'],
                    ['mobile_poster_url', 'Mobile still-image URL', 'Optional portrait crop. Blank uses the desktop still.'],
                  ] as const).map(([key, label, hint]) => (
                    <div key={key}>
                      <label htmlFor={`hero-extra${index}-${key}`} className="block text-sm font-medium text-dark mb-1">{label}</label>
                      <input id={`hero-extra${index}-${key}`} type="text" inputMode="url" value={extra[key]} placeholder="https://… or /media/…"
                        onChange={event => updateExtra(index as 0 | 1 | 2, key, event.target.value)} className={inputClass} />
                      <p className="text-xs text-dark-muted mt-1">{hint}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <p className="text-xs text-dark-muted">Use a short, silent 10–15 second clip. Aim for under 5 MB on desktop and under 2 MB on mobile. Preview both before saving.</p>
          </div>
        )}
      </section>

      <section className="space-y-4" aria-labelledby="hero-copy-title">
        <h2 id="hero-copy-title" className="font-display text-lg font-bold text-dark pb-3 border-b border-background-warm">Hero text</h2>
        <button type="button" className="text-sm font-medium text-primary underline underline-offset-4" onClick={() => setContent(current => ({
          ...current,
          eyebrow: DEFAULT_HOME_HERO.eyebrow,
          heading_line1: DEFAULT_HOME_HERO.heading_line1,
          heading_highlight: DEFAULT_HOME_HERO.heading_highlight,
          heading_line2: DEFAULT_HOME_HERO.heading_line2,
          subheading: DEFAULT_HOME_HERO.subheading,
          cta_label: DEFAULT_HOME_HERO.cta_label,
          gallery_enabled: DEFAULT_HOME_HERO.gallery_enabled,
          gallery_label: DEFAULT_HOME_HERO.gallery_label,
          footer_text: DEFAULT_HOME_HERO.footer_text,
        }))}>Restore original hero text and buttons</button>
        {field('eyebrow', 'Small introduction (optional)', 70)}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {field('heading_line1', 'Headline — first line', 80)}
          {field('heading_highlight', 'Orange italic word (optional)', 40)}
          {field('heading_line2', 'Second line — after the orange word', 80)}
        </div>
        <div>
          <label htmlFor="hero-subheading" className="block text-sm font-medium text-dark mb-1">Supporting text (optional)</label>
          <textarea id="hero-subheading" value={content.subheading} rows={2} maxLength={220} onChange={event => update('subheading', event.target.value)} className={inputClass} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {field('cta_label', 'Explore button label', 32)}
          {field('gallery_label', 'Gallery button label', 32)}
          {field('footer_text', 'Bottom caption (optional)', 80)}
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-dark"><input type="checkbox" checked={content.gallery_enabled} onChange={event => update('gallery_enabled', event.target.checked)} className="w-4 h-4 accent-primary" />Show View Gallery button</label>
        <p className="text-xs text-dark-muted">Explore opens Upcoming Trips; View Gallery opens Completed Trips. Short headlines give the scenery more space, especially on mobile.</p>
      </section>

      <section className="space-y-3" aria-labelledby="hero-preview-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="hero-preview-title" className="font-display text-lg font-bold text-dark">Preview</h2>
          <div className="flex gap-2" role="group" aria-label="Preview screen size">
            {[false, true].map(mobile => (
              <button key={String(mobile)} type="button" aria-pressed={mobilePreview === mobile}
                onClick={() => { setMobilePreview(mobile); setPreviewError(false); }}
                className={`px-3 py-2 text-sm rounded-md border ${mobilePreview === mobile ? 'bg-primary text-white border-primary' : 'border-background-warm text-dark'}`}>
                {mobile ? 'Mobile' : 'Desktop'}
              </button>
            ))}
          </div>
        </div>
        {clips.length > 1 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Preview video">
            {clips.map((_, index) => (
              <button key={index} type="button" aria-pressed={previewIndex === index}
                onClick={() => { setPreviewIndex(index); setPreviewError(false); }}
                className={`px-3 py-2 text-sm rounded-md border ${previewIndex === index ? 'bg-primary text-white border-primary' : 'border-background-warm text-dark'}`}>
                Video {index + 1}
              </button>
            ))}
          </div>
        )}
        <div className={`relative overflow-hidden rounded-lg bg-dark mx-auto ${mobilePreview ? 'max-w-sm aspect-[9/16]' : 'w-full aspect-video'}`}>
          {content.video_enabled ? (
            <video key={film} src={film} poster={poster} controls muted playsInline loop={content.loop && clips.length === 1} preload="none"
              onError={() => setPreviewError(true)} aria-label={`${mobilePreview ? 'Mobile' : 'Desktop'} hero video preview`}
              className="absolute inset-0 w-full h-full object-cover" />
          ) : <img src={poster} alt="Hero still-image preview" onError={() => setPreviewError(true)} className="absolute inset-0 w-full h-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent pointer-events-none" />
          <div className={`absolute left-5 right-5 bottom-16 text-white pointer-events-none ${mobilePreview ? '' : 'sm:left-8 sm:right-8'}`}>
            {content.eyebrow && <p className="text-2xs uppercase tracking-widest mb-3">{content.eyebrow}</p>}
            <p className="font-display text-xl sm:text-3xl font-bold leading-[1.15] break-words"><span className="block">{content.heading_line1}</span><span className="block"><em className="text-secondary italic">{content.heading_highlight}</em>{content.heading_highlight && content.heading_line2 ? ' ' : ''}{content.heading_line2}</span></p>
            {content.subheading && <p className="text-xs mt-3 max-w-md">{content.subheading}</p>}
            <div className="flex flex-wrap gap-3 mt-4 font-button font-semibold text-xs"><span className="inline-block bg-primary text-white rounded-md px-4 py-2">{content.cta_label} →</span>{content.gallery_enabled && <span className="inline-block border border-white/40 rounded-md px-4 py-2">▷ {content.gallery_label}</span>}</div>
          </div>
        </div>
        {previewError && <p role="alert" className="text-sm text-danger-fg">This media could not load. Check that its URL opens a public video or image file.</p>}
        <p className="text-xs text-dark-muted">Press Play to check the footage. This scaled preview shows your unsaved text; the homepage adapts spacing to the visitor’s screen.</p>
      </section>
    </div>
  );
}
