import { Plus, Trash as Trash2, Sparkle, TextAa, TextAlignLeft, Image as ImageIcon } from '@phosphor-icons/react';
import ImageUploadField from '../../components/ui/ImageUploadField';
import type { AboutContent, AboutWhyDifferentCard } from '../../types/types-index';
import {
  inputClass,
  iconLabelClass,
  helperTextClass,
  previewLabelClass,
  previewBoxClass,
  itemCardClass,
  itemCardHeaderClass,
  itemNumberBadgeClass,
} from './shared';

// Soft limits matching the card's real-world footprint on the public page
// (aspect-[4/3] tile, heading text-sm sm:text-base, description text-xs) —
// same treatment as the Home Page editor's Why ULAA cards.
const HEADING_SOFT_LIMIT = 26;
const DESCRIPTION_SOFT_LIMIT = 85;

export default function WhyDifferentSection({
  content,
  setWHY,
  updateWhyCard,
  addWhyCard,
  removeWhyCard,
  sectionRef,
}: {
  content: AboutContent['why_different'];
  setWHY: (field: string, value: unknown) => void;
  updateWhyCard: (i: number, field: keyof AboutWhyDifferentCard, value: string) => void;
  addWhyCard: () => void;
  removeWhyCard: (i: number) => void;
  sectionRef: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div ref={sectionRef} data-section={4} className="scroll-mt-4 space-y-4">
      <div className="pb-3 border-b border-background-warm">
        <h2 className="font-display text-lg font-bold text-dark">4 · Why ULAA is Different</h2>
        <p className="text-xs text-dark-muted mt-1">The heading block and up to 6 photo cards shown in the "Why ULAA is Different" section.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="about-why-diff-sub-heading" className={iconLabelClass}>
            <Sparkle size={14} className="text-primary" aria-hidden="true" />
            Eyebrow Text
          </label>
          <p className={helperTextClass}>Small script tagline shown above the heading.</p>
          <textarea
            id="about-why-diff-sub-heading"
            value={content.sub_heading}
            onChange={e => setWHY('sub_heading', e.target.value)}
            rows={1}
            className={`${inputClass} h-16 resize-none`}
            placeholder="Beyond the Ordinary"
          />
        </div>
        <div>
          <label htmlFor="about-why-diff-heading" className={iconLabelClass}>
            <TextAa size={14} className="text-primary" aria-hidden="true" />
            Main Heading
          </label>
          <p className={helperTextClass}>The big bold heading itself.</p>
          <textarea
            id="about-why-diff-heading"
            value={content.heading}
            onChange={e => setWHY('heading', e.target.value)}
            rows={2}
            className={`${inputClass} h-16 resize-none`}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="about-why-diff-subheading" className={iconLabelClass}>
            <TextAlignLeft size={14} className="text-primary" aria-hidden="true" />
            Supporting Text
          </label>
          <p className={helperTextClass}>Paragraph shown below the heading.</p>
          <textarea
            id="about-why-diff-subheading"
            value={content.subheading}
            onChange={e => setWHY('subheading', e.target.value)}
            rows={2}
            className={`${inputClass} h-16 resize-none`}
          />
        </div>
      </div>

      {/* Live preview of the heading block */}
      <div>
        <p className={previewLabelClass}>Live preview</p>
        <div className={previewBoxClass}>
          <span className="font-script text-2xl text-primary">{content.sub_heading || 'Beyond the Ordinary'}</span>
          <span className="font-display text-2xl sm:text-3xl font-bold text-dark leading-tight">{content.heading || 'Why ULAA is Different'}</span>
          {content.subheading && (
            <span className="text-sm text-dark-muted max-w-md leading-relaxed">{content.subheading}</span>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-background-warm">
          <h3 className="font-display text-base font-bold text-dark">Cards ({content.cards.length}/6)</h3>
          {content.cards.length < 6 && (
            <button
              type="button"
              onClick={addWhyCard}
              className="flex items-center gap-1 text-xs font-medium text-primary border border-primary rounded-md px-2.5 py-1.5 hover:bg-primary/5 transition-colors"
            >
              <Plus size={13} aria-hidden="true" /> Add Card
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {content.cards.map((card: AboutWhyDifferentCard, i: number) => {
            const headingOverLimit = card.heading.length > HEADING_SOFT_LIMIT;
            const descriptionOverLimit = card.description.length > DESCRIPTION_SOFT_LIMIT;

            return (
              <div key={i} className={itemCardClass}>
                <div className={itemCardHeaderClass}>
                  <span className={itemNumberBadgeClass}>{i + 1}</span>
                  <h4 className="font-display text-sm font-bold text-dark truncate flex-1 min-w-0">
                    {card.heading || `Card ${i + 1}`}
                  </h4>
                  <button
                    type="button"
                    onClick={() => removeWhyCard(i)}
                    aria-label={`Remove ${card.heading || `Card ${i + 1}`}`}
                    className="p-1.5 rounded-full text-primary/70 hover:text-primary hover:bg-primary/5 transition-colors flex-shrink-0"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>

                <div className="p-4 grid grid-cols-1 sm:grid-cols-[minmax(0,160px)_1fr] gap-4">
                  <div className="space-y-2">
                    <ImageUploadField
                      label=""
                      value={card.image ?? ''}
                      onChange={url => updateWhyCard(i, 'image', url)}
                      bucket="ulaa"
                      pathPrefix={`about/why-different/card-${i + 1}`}
                      fileNamePrefix={`card-${i + 1}`}
                      aspectRatio="4/3"
                      allowUrl
                    />
                    <p className="flex items-center gap-1 text-[10px] text-dark-muted leading-snug">
                      <ImageIcon size={11} className="flex-shrink-0" aria-hidden="true" />
                      4:3, or paste an image URL (e.g. from Unsplash)
                    </p>
                  </div>

                  <div className="space-y-3 min-w-0">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label htmlFor={`about-why-card-heading-${i}`} className="text-sm font-medium text-dark">Heading</label>
                        <span className={`text-[10px] ${headingOverLimit ? 'text-primary font-medium' : 'text-dark-muted'}`}>
                          {card.heading.length}/{HEADING_SOFT_LIMIT}
                        </span>
                      </div>
                      <textarea
                        id={`about-why-card-heading-${i}`}
                        value={card.heading}
                        onChange={e => updateWhyCard(i, 'heading', e.target.value)}
                        rows={2}
                        className={`${inputClass} resize-none`}
                      />
                      {headingOverLimit && (
                        <p className="text-[10px] text-primary mt-1">May wrap to two lines on the card.</p>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label htmlFor={`about-why-card-description-${i}`} className="text-sm font-medium text-dark">Description</label>
                        <span className={`text-[10px] ${descriptionOverLimit ? 'text-primary font-medium' : 'text-dark-muted'}`}>
                          {card.description.length}/{DESCRIPTION_SOFT_LIMIT}
                        </span>
                      </div>
                      <textarea
                        id={`about-why-card-description-${i}`}
                        value={card.description}
                        onChange={e => updateWhyCard(i, 'description', e.target.value)}
                        rows={2}
                        className={`${inputClass} resize-none`}
                      />
                      {descriptionOverLimit && (
                        <p className="text-[10px] text-primary mt-1">Long copy may get clipped on smaller screens.</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Live preview — mirrors the exact card markup from AboutPage.tsx */}
                <div className="px-4 pb-4">
                  <p className={previewLabelClass}>Live preview</p>
                  <div className="relative w-full max-w-[220px] aspect-[4/3] rounded-lg overflow-hidden border border-background-warm bg-background-warm">
                    {card.image ? (
                      <img src={card.image} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-dark-muted">
                        <ImageIcon size={22} aria-hidden="true" />
                      </div>
                    )}
                    <div className="absolute inset-0" style={{ background: 'rgba(0, 0, 0, 0.4)' }} />
                    <div className="relative h-full flex flex-col justify-end p-3">
                      <p className="font-display text-sm font-bold text-white mb-0.5 leading-tight">
                        {card.heading || 'Card heading'}
                      </p>
                      <p className="text-white/90 text-xs leading-snug line-clamp-2">
                        {card.description || 'Card description goes here.'}
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
