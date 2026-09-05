import ImageUploadField from '../../components/ui/ImageUploadField';
import type { CtaBannerContent } from '../../types/types-index';
import { FORM_INPUT_CLASS as inputClass } from '../../constants/formStyles';
import { labelClass } from '../about-sections/shared';

export default function CtaBannerSection({
  content,
  setContent,
  sectionRef,
}: {
  content: CtaBannerContent;
  setContent: React.Dispatch<React.SetStateAction<CtaBannerContent>>;
  sectionRef: (el: HTMLDivElement | null) => void;
}) {
  const setField = <K extends keyof CtaBannerContent>(key: K, value: CtaBannerContent[K]) =>
    setContent(c => ({ ...c, [key]: value }));

  return (
    <div ref={sectionRef} data-section={6} className="scroll-mt-4 space-y-4">
      <h2 className="font-display text-lg font-bold text-dark pb-3 border-b border-background-warm">CTA Banner</h2>
      <p className="text-xs text-dark-muted -mt-2">
        The "Ready for your next adventure?" banner at the very bottom of the home page.
      </p>
      <ImageUploadField
        label="Background Image"
        value={content.image}
        onChange={url => setField('image', url)}
        bucket="ulaa"
        pathPrefix="cta-banner"
        hint="Wide landscape, at least 1400×700px — shown with a dark gradient overlay."
        allowUrl
      />
      <div>
        <label htmlFor="cta-eyebrow" className={labelClass}>Eyebrow Text</label>
        <p className="text-[11px] text-dark-muted leading-snug mb-1.5">Small script tagline shown above the heading.</p>
        <input
          id="cta-eyebrow"
          value={content.eyebrow}
          onChange={e => setField('eyebrow', e.target.value)}
          className={inputClass}
          placeholder="Your Adventure Awaits"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="cta-heading-1" className={labelClass}>Heading — Line 1</label>
          <input
            id="cta-heading-1"
            value={content.heading_line1}
            onChange={e => setField('heading_line1', e.target.value)}
            className={inputClass}
            placeholder="Ready for your"
          />
        </div>
        <div>
          <label htmlFor="cta-heading-highlight" className={labelClass}>Heading — Highlighted Line</label>
          <p className="text-[11px] text-dark-muted leading-snug mb-1.5">Rendered in the accent color + italic.</p>
          <input
            id="cta-heading-highlight"
            value={content.heading_highlight}
            onChange={e => setField('heading_highlight', e.target.value)}
            className={inputClass}
            placeholder="next adventure?"
          />
        </div>
      </div>
      <div>
        <label htmlFor="cta-subheading" className={labelClass}>Supporting Text</label>
        <textarea
          id="cta-subheading"
          value={content.subheading}
          onChange={e => setField('subheading', e.target.value)}
          rows={2}
          className={`${inputClass} resize-none`}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="cta-primary-label" className={labelClass}>Primary Button Label</label>
          <p className="text-[11px] text-dark-muted leading-snug mb-1.5">Links to /trips.</p>
          <input
            id="cta-primary-label"
            value={content.primary_label}
            onChange={e => setField('primary_label', e.target.value)}
            className={inputClass}
            placeholder="Book Your Seat"
          />
        </div>
        <div>
          <label htmlFor="cta-secondary-label" className={labelClass}>Secondary Button Label</label>
          <p className="text-[11px] text-dark-muted leading-snug mb-1.5">Links to /contact.</p>
          <input
            id="cta-secondary-label"
            value={content.secondary_label}
            onChange={e => setField('secondary_label', e.target.value)}
            className={inputClass}
            placeholder="Talk to Us"
          />
        </div>
      </div>
      {/* Live preview — same classes as the actual banner (see CTASection.tsx). */}
      <div className="rounded-lg bg-dark px-6 py-8 text-center">
        <span className="inline-block text-secondary font-script font-medium text-lg mb-2">{content.eyebrow}</span>
        <p className="font-display text-2xl font-bold leading-tight text-white mb-2">
          {content.heading_line1}
          <br />
          <span className="text-secondary italic">{content.heading_highlight}</span>
        </p>
        <p className="text-xs text-white/80 max-w-sm mx-auto">{content.subheading}</p>
      </div>
    </div>
  );
}
