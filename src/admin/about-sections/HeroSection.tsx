import ImageUploadField from '../../components/ui/ImageUploadField';
import type { AboutContent } from '../../types/types-index';
import { inputClass, labelClass } from './shared';

export default function HeroSection({
  content,
  setHero,
  sectionRef,
}: {
  content: AboutContent['hero'];
  setHero: (field: keyof AboutContent['hero'], value: string) => void;
  sectionRef: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div ref={sectionRef} data-section={1} className="scroll-mt-4 space-y-4">
      <h2 className="font-display text-lg font-bold text-dark pb-3 border-b border-background-warm">1 · Hero Banner</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ImageUploadField
          label="Banner Image (Desktop)"
          value={content.image}
          onChange={url => setHero('image', url)}
          bucket="ulaa"
          pathPrefix="about/hero"
          hint="Wide landscape, at least 1920×1080px — shown full-bleed as the page's top banner on tablet & desktop screens."
          allowUrl
        />
        <ImageUploadField
          label="Banner Image (Mobile)"
          value={content.mobile_image}
          onChange={url => setHero('mobile_image', url)}
          bucket="ulaa"
          pathPrefix="about/hero-mobile"
          hint="Tall portrait, at least 1080×1350px — shown on phone screens instead of the desktop banner. Falls back to the desktop banner if left empty."
          allowUrl
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="about-hero-heading" className={labelClass}>Main Heading</label>
          <p className="text-[11px] text-dark-muted leading-snug mb-1.5">The big bold heading itself.</p>
          <textarea
            id="about-hero-heading"
            value={content.heading}
            onChange={e => setHero('heading', e.target.value)}
            rows={2}
            className={`${inputClass} resize-none`}
          />
        </div>
        <div>
          <label htmlFor="about-hero-subheading" className={labelClass}>Supporting Text</label>
          <p className="text-[11px] text-dark-muted leading-snug mb-1.5">Paragraph shown below the heading.</p>
          <textarea
            id="about-hero-subheading"
            value={content.subheading}
            onChange={e => setHero('subheading', e.target.value)}
            rows={2}
            className={`${inputClass} resize-none`}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="about-hero-cta-label" className={labelClass}>CTA Button Label (optional)</label>
          <input
            id="about-hero-cta-label"
            value={content.cta_label}
            onChange={e => setHero('cta_label', e.target.value)}
            className={inputClass}
            placeholder="Explore Trips"
          />
        </div>
        <div>
          <label htmlFor="about-hero-cta-url" className={labelClass}>CTA URL (optional)</label>
          <input
            id="about-hero-cta-url"
            value={content.cta_url}
            onChange={e => setHero('cta_url', e.target.value)}
            className={inputClass}
            placeholder="/trips"
          />
        </div>
      </div>
    </div>
  );
}
