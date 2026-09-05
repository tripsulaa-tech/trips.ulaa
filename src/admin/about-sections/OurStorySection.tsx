import { TextAa, TextAlignLeft } from '@phosphor-icons/react';
import ImageUploadField from '../../components/ui/ImageUploadField';
import type { AboutContent } from '../../types/types-index';
import { inputClass, iconLabelClass, helperTextClass } from './shared';

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
      <div className="pb-3 border-b border-background-warm">
        <h2 className="font-display text-lg font-bold text-dark">2 · Our Story</h2>
        <p className="text-xs text-dark-muted mt-1">The photo-and-copy panel introducing ULAA, shown just below the hero.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="about-story-heading" className={iconLabelClass}>
            <TextAa size={14} className="text-primary" aria-hidden="true" />
            Main Heading
          </label>
          <p className={helperTextClass}>The big bold heading itself.</p>
          <textarea
            id="about-story-heading"
            value={content.heading}
            onChange={e => setStory('heading', e.target.value)}
            rows={2}
            className={`${inputClass} resize-none`}
          />
        </div>
        <div>
          <label htmlFor="about-story-description" className={iconLabelClass}>
            <TextAlignLeft size={14} className="text-primary" aria-hidden="true" />
            Description
          </label>
          <p className={helperTextClass}>Paragraph shown below the heading.</p>
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
