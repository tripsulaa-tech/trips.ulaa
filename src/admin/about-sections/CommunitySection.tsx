import { Sparkle, TextAa, TextAlignLeft } from '@phosphor-icons/react';
import MultiImageUploadField from '../../components/ui/MultiImageUploadField';
import type { AboutContent } from '../../types/types-index';
import { inputClass, iconLabelClass, helperTextClass, previewLabelClass, previewBoxClass } from './shared';

export default function CommunitySection({
  content,
  setCommunity,
  sectionRef,
}: {
  content: AboutContent['community'];
  setCommunity: (field: string, value: unknown) => void;
  sectionRef: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div ref={sectionRef} data-section={5} className="scroll-mt-4 space-y-4">
      <div className="pb-3 border-b border-background-warm">
        <h2 className="font-display text-lg font-bold text-dark">5 · Our Community</h2>
        <p className="text-xs text-dark-muted mt-1">The heading block and photo grid shown in the "Our Community" section.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="about-community-sub-heading" className={iconLabelClass}>
            <Sparkle size={14} className="text-primary" aria-hidden="true" />
            Eyebrow Text
          </label>
          <p className={helperTextClass}>Small script tagline shown above the heading.</p>
          <textarea
            id="about-community-sub-heading"
            value={content.sub_heading}
            onChange={e => setCommunity('sub_heading', e.target.value)}
            rows={1}
            className={`${inputClass} h-16 resize-none`}
            placeholder="Together We Thrive"
          />
        </div>
        <div>
          <label htmlFor="about-community-heading" className={iconLabelClass}>
            <TextAa size={14} className="text-primary" aria-hidden="true" />
            Main Heading
          </label>
          <p className={helperTextClass}>The big bold heading itself.</p>
          <textarea
            id="about-community-heading"
            value={content.heading}
            onChange={e => setCommunity('heading', e.target.value)}
            rows={2}
            className={`${inputClass} h-16 resize-none`}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="about-community-subheading" className={iconLabelClass}>
            <TextAlignLeft size={14} className="text-primary" aria-hidden="true" />
            Supporting Text
          </label>
          <p className={helperTextClass}>Paragraph shown below the heading.</p>
          <textarea
            id="about-community-subheading"
            value={content.subheading}
            onChange={e => setCommunity('subheading', e.target.value)}
            rows={2}
            className={`${inputClass} h-16 resize-none`}
          />
        </div>
      </div>

      {/* Live preview of the heading block */}
      <div>
        <p className={previewLabelClass}>Live preview</p>
        <div className={previewBoxClass}>
          <span className="font-script text-2xl text-primary">{content.sub_heading || 'Together We Thrive'}</span>
          <span className="font-display text-2xl sm:text-3xl font-bold text-dark leading-tight">{content.heading || 'Our Community'}</span>
          {content.subheading && (
            <span className="text-sm text-dark-muted max-w-md leading-relaxed">{content.subheading}</span>
          )}
        </div>
      </div>

      <MultiImageUploadField
        label="Community Photos"
        value={content.photos}
        onChange={photos => setCommunity('photos', photos)}
        bucket="ulaa"
        pathPrefix="about/community"
        hint="Square, at least 600×600px — shown in a cropped grid."
        allowUrl
      />
    </div>
  );
}
