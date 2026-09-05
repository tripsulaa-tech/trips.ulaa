import { Sparkle, TextAa, TextAlignLeft } from '@phosphor-icons/react';
import type { AboutContent } from '../../types/types-index';
import { inputClass, iconLabelClass, helperTextClass, previewLabelClass, previewBoxClass } from './shared';

export default function TestimonialsSection({
  content,
  setTestimonialsContent,
  sectionRef,
}: {
  content: AboutContent['testimonials'];
  setTestimonialsContent: (field: keyof AboutContent['testimonials'], value: string) => void;
  sectionRef: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div ref={sectionRef} data-section={7} className="scroll-mt-4 space-y-4">
      <div className="pb-3 border-b border-background-warm">
        <h2 className="font-display text-lg font-bold text-dark">7 · What Our Girls Say</h2>
        <p className="text-xs text-dark-muted mt-1">The heading block shown above the testimonial cards.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="about-testimonials-sub-heading" className={iconLabelClass}>
            <Sparkle size={14} className="text-primary" aria-hidden="true" />
            Eyebrow Text
          </label>
          <p className={helperTextClass}>Small script tagline shown above the heading.</p>
          <textarea
            id="about-testimonials-sub-heading"
            value={content.sub_heading}
            onChange={e => setTestimonialsContent('sub_heading', e.target.value)}
            rows={1}
            className={`${inputClass} h-16 resize-none`}
            placeholder="Stories That Inspire"
          />
        </div>
        <div>
          <label htmlFor="about-testimonials-heading" className={iconLabelClass}>
            <TextAa size={14} className="text-primary" aria-hidden="true" />
            Main Heading
          </label>
          <p className={helperTextClass}>The big bold heading itself.</p>
          <textarea
            id="about-testimonials-heading"
            value={content.heading}
            onChange={e => setTestimonialsContent('heading', e.target.value)}
            rows={2}
            className={`${inputClass} h-16 resize-none`}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="about-testimonials-subheading" className={iconLabelClass}>
            <TextAlignLeft size={14} className="text-primary" aria-hidden="true" />
            Supporting Text
          </label>
          <p className={helperTextClass}>Paragraph shown below the heading.</p>
          <textarea
            id="about-testimonials-subheading"
            value={content.subheading}
            onChange={e => setTestimonialsContent('subheading', e.target.value)}
            rows={2}
            className={`${inputClass} h-16 resize-none`}
            placeholder="Real stories. Real experiences."
          />
        </div>
      </div>

      {/* Live preview of the heading block */}
      <div>
        <p className={previewLabelClass}>Live preview</p>
        <div className={previewBoxClass}>
          <span className="font-script text-2xl text-primary">{content.sub_heading || 'Stories That Inspire'}</span>
          <span className="font-display text-2xl sm:text-3xl font-bold text-dark leading-tight">{content.heading || 'What Our Girls Say'}</span>
          {content.subheading && (
            <span className="text-sm text-dark-muted max-w-md leading-relaxed">{content.subheading}</span>
          )}
        </div>
      </div>

      <p className="text-xs text-dark-muted flex items-center gap-1.5 bg-background-warm/60 rounded-md px-3 py-2">
        The testimonial cards themselves come from the Testimonials section of the admin panel.
      </p>
    </div>
  );
}
