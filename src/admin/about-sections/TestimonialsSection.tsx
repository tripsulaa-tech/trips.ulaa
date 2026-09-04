import type { AboutContent } from '../../types/types-index';
import { inputClass, labelClass } from './shared';

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
      <h2 className="font-display text-lg font-bold text-dark pb-3 border-b border-background-warm">7 · What Our Girls Say</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="about-testimonials-sub-heading" className={labelClass}>Eyebrow Text</label>
          <p className="text-[11px] text-dark-muted leading-snug mb-1.5">Small script tagline shown above the heading.</p>
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
          <label htmlFor="about-testimonials-heading" className={labelClass}>Main Heading</label>
          <p className="text-[11px] text-dark-muted leading-snug mb-1.5">The big bold heading itself.</p>
          <textarea
            id="about-testimonials-heading"
            value={content.heading}
            onChange={e => setTestimonialsContent('heading', e.target.value)}
            rows={2}
            className={`${inputClass} h-16 resize-none`}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="about-testimonials-subheading" className={labelClass}>Supporting Text</label>
          <p className="text-[11px] text-dark-muted leading-snug mb-1.5">Paragraph shown below the heading.</p>
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
      <p className="text-xs text-dark-muted">
        The testimonial cards themselves come from the Testimonials section of the admin panel.
      </p>
    </div>
  );
}
