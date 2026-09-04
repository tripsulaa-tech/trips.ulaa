import ImageUploadField from '../../components/ui/ImageUploadField';
import type { AboutContent } from '../../types/types-index';
import { inputClass, labelClass } from './shared';

export default function OurStorySection({
  content,
  setStory,
  sectionRef,
}: {
  content: AboutContent['our_story'];
  setStory: (field: keyof AboutContent['our_story'], value: string) => void;
  sectionRef: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div ref={sectionRef} data-section={2} className="scroll-mt-4 space-y-4">
      <h2 className="font-display text-lg font-bold text-dark pb-3 border-b border-background-warm">2 · Our Story</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="about-story-heading" className={labelClass}>Main Heading</label>
          <p className="text-[11px] text-dark-muted leading-snug mb-1.5">The big bold heading itself.</p>
          <textarea
            id="about-story-heading"
            value={content.heading}
            onChange={e => setStory('heading', e.target.value)}
            rows={2}
            className={`${inputClass} resize-none`}
          />
        </div>
        <div>
          <label htmlFor="about-story-description" className={labelClass}>Description</label>
          <textarea
            id="about-story-description"
            value={content.description}
            onChange={e => setStory('description', e.target.value)}
            rows={4}
            className={`${inputClass} resize-none`}
          />
        </div>
      </div>
      <ImageUploadField
        label="Story Image"
        value={content.image}
        onChange={url => setStory('image', url)}
        bucket="ulaa"
        pathPrefix="about/story"
        hint="Landscape, at least 1000×880px — shown in a cropped rounded panel."
        allowUrl
      />
    </div>
  );
}
