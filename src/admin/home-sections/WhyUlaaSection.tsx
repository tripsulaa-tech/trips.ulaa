import { Sparkle, TextAa, TextAlignLeft, Image as ImageIcon } from '@phosphor-icons/react';
import ImageUploadField from '../../components/ui/ImageUploadField';
import type { WhyUlaaContent } from '../../types/types-index';
import { FORM_INPUT_CLASS as inputClass } from '../../constants/formStyles';

// Real card is a 4:3 tile with a dark scrim + title + description stacked at
// the bottom (see WhyULAA.tsx on the live site) — the preview below mirrors
// that exact markup so an admin can trust what they see here without
// bouncing to the homepage to check.
const TITLE_SOFT_LIMIT = 24;
const DESCRIPTION_SOFT_LIMIT = 95;

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
        <div className="pb-3 border-b border-background-warm">
          <h2 className="font-display text-lg font-bold text-dark">Why ULAA — Section Text</h2>
          <p className="text-xs text-dark-muted mt-1">
            The heading block and the 6 image cards shown in the "Travel differently." section on the home page.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="why-ulaa-sub-heading" className="flex items-center gap-1.5 text-sm font-medium text-dark mb-1">
              <Sparkle size={14} className="text-primary" aria-hidden="true" />
              Eyebrow Text
            </label>
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
            <label htmlFor="why-ulaa-heading" className="flex items-center gap-1.5 text-sm font-medium text-dark mb-1">
              <TextAa size={14} className="text-primary" aria-hidden="true" />
              Main Heading
            </label>
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
            <label htmlFor="why-ulaa-subheading" className="flex items-center gap-1.5 text-sm font-medium text-dark mb-1">
              <TextAlignLeft size={14} className="text-primary" aria-hidden="true" />
              Supporting Text
            </label>
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

        {/* Live preview of the heading block, matching SectionTitle on the live site */}
        <div className="rounded-lg bg-cream border border-background-warm px-5 py-6 flex flex-col items-center text-center gap-2">
          <span className="font-script text-2xl text-primary">{content.sub_heading || 'Why Choose Us'}</span>
          <span className="font-display text-2xl sm:text-3xl font-bold text-dark leading-tight">{content.heading || 'Travel differently.'}</span>
          {content.subheading && (
            <span className="text-sm text-dark-muted max-w-md leading-relaxed">{content.subheading}</span>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-background-warm">
          <h2 className="font-display text-lg font-bold text-dark">Cards ({content.features.length})</h2>
          <p className="text-xs text-dark-muted hidden sm:block">Each card's preview mirrors exactly how it looks on the home page.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {content.features.map((feature, index) => {
            const titleOverLimit = feature.title.length > TITLE_SOFT_LIMIT;
            const descriptionOverLimit = feature.description.length > DESCRIPTION_SOFT_LIMIT;

            return (
              <div
                key={index}
                className="rounded-xl border-2 border-background-warm bg-white overflow-hidden hover:border-primary/30 transition-colors"
              >
                <div className="flex items-center gap-2 px-4 py-2.5 bg-background-warm/40 border-b border-background-warm">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-white text-[11px] font-bold flex-shrink-0">
                    {index + 1}
                  </span>
                  <h3 className="font-display text-sm font-bold text-dark truncate">
                    {feature.title || `Card ${index + 1}`}
                  </h3>
                </div>

                <div className="p-4 grid grid-cols-1 sm:grid-cols-[minmax(0,160px)_1fr] gap-4">
                  <div className="space-y-2">
                    <ImageUploadField
                      label=""
                      value={feature.image}
                      onChange={url => updateFeature(index, { image: url })}
                      bucket="ulaa"
                      pathPrefix="why-ulaa"
                      required
                      aspectRatio="4/3"
                    />
                    <p className="flex items-center gap-1 text-[10px] text-dark-muted leading-snug">
                      <ImageIcon size={11} className="flex-shrink-0" aria-hidden="true" />
                      4:3 landscape, at least 800×600px
                    </p>
                  </div>

                  <div className="space-y-3 min-w-0">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label htmlFor={`why-ulaa-card-title-${index}`} className="text-sm font-medium text-dark">Title</label>
                        <span className={`text-[10px] ${titleOverLimit ? 'text-primary font-medium' : 'text-dark-muted'}`}>
                          {feature.title.length}/{TITLE_SOFT_LIMIT}
                        </span>
                      </div>
                      <input
                        id={`why-ulaa-card-title-${index}`}
                        value={feature.title}
                        onChange={e => updateFeature(index, { title: e.target.value })}
                        className={inputClass}
                      />
                      {titleOverLimit && (
                        <p className="text-[10px] text-primary mt-1">May wrap to two lines on the card.</p>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label htmlFor={`why-ulaa-card-description-${index}`} className="text-sm font-medium text-dark">Description</label>
                        <span className={`text-[10px] ${descriptionOverLimit ? 'text-primary font-medium' : 'text-dark-muted'}`}>
                          {feature.description.length}/{DESCRIPTION_SOFT_LIMIT}
                        </span>
                      </div>
                      <textarea
                        id={`why-ulaa-card-description-${index}`}
                        value={feature.description}
                        onChange={e => updateFeature(index, { description: e.target.value })}
                        rows={2}
                        className={`${inputClass} resize-none`}
                      />
                      {descriptionOverLimit && (
                        <p className="text-[10px] text-primary mt-1">Long copy may get clipped on smaller screens.</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Live preview — mirrors the exact card markup from WhyULAA.tsx */}
                <div className="px-4 pb-4">
                  <p className="text-[10px] font-medium text-dark-muted uppercase tracking-wide mb-1.5">Live preview</p>
                  <div className="relative w-full max-w-[220px] aspect-[4/3] rounded-lg overflow-hidden border border-background-warm bg-background-warm">
                    {feature.image ? (
                      <img src={feature.image} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-dark-muted">
                        <ImageIcon size={22} aria-hidden="true" />
                      </div>
                    )}
                    <div className="absolute inset-0" style={{ background: 'rgba(0, 0, 0, 0.4)' }} />
                    <div className="relative h-full flex flex-col justify-end p-3">
                      <p className="font-display text-sm font-bold text-white mb-0.5 leading-tight">
                        {feature.title || 'Card title'}
                      </p>
                      <p className="text-white/90 text-[11px] leading-snug line-clamp-2">
                        {feature.description || 'Card description goes here.'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
