import MultiImageUploadField from '../../components/ui/MultiImageUploadField';
import type { AboutContent } from '../../types/types-index';
import { inputClass, labelClass } from './shared';

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
      <h2 className="font-display text-lg font-bold text-dark pb-3 border-b border-background-warm">5 · Our Community</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="about-community-sub-heading" className={labelClass}>Sub Heading</label>
          <input
            id="about-community-sub-heading"
            value={content.sub_heading}
            onChange={e => setCommunity('sub_heading', e.target.value)}
            className={inputClass}
            placeholder="Together We Thrive"
          />
        </div>
        <div>
          <label htmlFor="about-community-heading" className={labelClass}>Section Heading</label>
          <textarea
            id="about-community-heading"
            value={content.heading}
            onChange={e => setCommunity('heading', e.target.value)}
            rows={2}
            className={`${inputClass} resize-none`}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="about-community-subheading" className={labelClass}>Subheading</label>
          <textarea
            id="about-community-subheading"
            value={content.subheading}
            onChange={e => setCommunity('subheading', e.target.value)}
            rows={2}
            className={`${inputClass} resize-none`}
          />
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
