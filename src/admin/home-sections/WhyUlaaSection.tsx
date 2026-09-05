import ImageUploadField from '../../components/ui/ImageUploadField';
import type { WhyUlaaContent } from '../../types/types-index';
import { FORM_INPUT_CLASS as inputClass } from '../../constants/formStyles';

export default function WhyUlaaSection({
  content,
  setContent,
  sectionRef,
}: {
  content: WhyUlaaContent;
  setContent: React.Dispatch<React.SetStateAction<WhyUlaaContent>>;
  sectionRef: (el: HTMLDivElement | null) => void;
}) {
  const setField = (key: 'sub_heading' | 'heading' | 'subheading', value: string) => {
    setContent(c => ({ ...c, [key]: value }));
  };

  const updateFeature = (index: number, patch: Partial<WhyUlaaContent['features'][number]>) => {
    setContent(c => ({
      ...c,
      features: c.features.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    }));
  };

  return (
    <div ref={sectionRef} data-section={2} className="scroll-mt-4 space-y-8">
      <div className="space-y-4">
        <h2 className="font-display text-lg font-bold text-dark pb-3 border-b border-background-warm">Why ULAA — Section Text</h2>
        <p className="text-xs text-dark-muted -mt-2">The 6 image cards shown in the "Travel differently." section on the home page.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="why-ulaa-sub-heading" className="block text-sm font-medium text-dark mb-1">Eyebrow Text</label>
            <p className="text-[11px] text-dark-muted leading-snug mb-1.5">Small script tagline shown above the heading.</p>
            <textarea
              id="why-ulaa-sub-heading"
              value={content.sub_heading}
              onChange={e => setField('sub_heading', e.target.value)}
              rows={1}
              className={`${inputClass} h-16 resize-none`}
              placeholder="Why Choose Us"
            />
          </div>
          <div>
            <label htmlFor="why-ulaa-heading" className="block text-sm font-medium text-dark mb-1">Main Heading</label>
            <p className="text-[11px] text-dark-muted leading-snug mb-1.5">The big bold heading itself.</p>
            <textarea
              id="why-ulaa-heading"
              value={content.heading}
              onChange={e => setField('heading', e.target.value)}
              rows={1}
              className={`${inputClass} h-16 resize-none`}
              placeholder="Travel differently."
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="why-ulaa-subheading" className="block text-sm font-medium text-dark mb-1">Supporting Text</label>
            <p className="text-[11px] text-dark-muted leading-snug mb-1.5">Paragraph shown below the heading.</p>
            <textarea
              id="why-ulaa-subheading"
              value={content.subheading}
              onChange={e => setField('subheading', e.target.value)}
              rows={2}
              className={`${inputClass} h-16 resize-none`}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {content.features.map((feature, index) => (
          <div key={index} className="space-y-3 p-4 rounded-lg border border-background-warm">
            <h3 className="font-display text-sm font-bold text-dark">Card {index + 1}</h3>
            <ImageUploadField
              label="Image"
              value={feature.image}
              onChange={url => updateFeature(index, { image: url })}
              bucket="ulaa"
              pathPrefix="why-ulaa"
              required
              hint="4:3 landscape, at least 800×600px — shown in a cropped card."
            />
            <div>
              <label htmlFor={`why-ulaa-card-title-${index}`} className="block text-sm font-medium text-dark mb-1">Title</label>
              <input
                id={`why-ulaa-card-title-${index}`}
                value={feature.title}
                onChange={e => updateFeature(index, { title: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor={`why-ulaa-card-description-${index}`} className="block text-sm font-medium text-dark mb-1">Description</label>
              <textarea
                id={`why-ulaa-card-description-${index}`}
                value={feature.description}
                onChange={e => updateFeature(index, { description: e.target.value })}
                rows={2}
                className={`${inputClass} resize-none`}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
