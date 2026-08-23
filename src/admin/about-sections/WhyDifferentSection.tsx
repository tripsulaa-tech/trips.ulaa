import { Plus, Trash as Trash2 } from '@phosphor-icons/react';
import ImageUploadField from '../../components/ui/ImageUploadField';
import type { AboutContent, AboutWhyDifferentCard } from '../../types/types-index';
import { inputClass, labelClass } from './shared';

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
      <h2 className="font-display text-lg font-bold text-dark pb-3 border-b border-background-warm">4 · Why ULAA is Different</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="about-why-diff-sub-heading" className={labelClass}>Sub Heading</label>
          <input
            id="about-why-diff-sub-heading"
            value={content.sub_heading}
            onChange={e => setWHY('sub_heading', e.target.value)}
            className={inputClass}
            placeholder="Beyond the Ordinary"
          />
        </div>
        <div>
          <label htmlFor="about-why-diff-heading" className={labelClass}>Section Heading</label>
          <textarea
            id="about-why-diff-heading"
            value={content.heading}
            onChange={e => setWHY('heading', e.target.value)}
            rows={2}
            className={`${inputClass} resize-none`}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="about-why-diff-subheading" className={labelClass}>Subheading</label>
          <textarea
            id="about-why-diff-subheading"
            value={content.subheading}
            onChange={e => setWHY('subheading', e.target.value)}
            rows={2}
            className={`${inputClass} resize-none`}
          />
        </div>
      </div>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label className={`${labelClass} mb-0`}>Cards (max 6)</label>
          <div className="flex items-center gap-3">
            <span className="text-xs text-dark-muted">{content.cards.length} / 6</span>
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
        </div>
        {content.cards.map((card: AboutWhyDifferentCard, i: number) => (
          <div key={i} className="border border-background-warm rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-dark-muted uppercase tracking-wide">
                Card {i + 1}
              </span>
              <button
                type="button"
                onClick={() => removeWhyCard(i)}
                aria-label={`Remove ${card.heading || `Card ${i + 1}`}`}
                className="p-1 rounded text-primary/70 hover:text-primary hover:bg-primary/5 transition-colors"
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </div>
            <div>
              <label htmlFor={`about-why-card-heading-${i}`} className={labelClass}>Heading</label>
              <textarea
                id={`about-why-card-heading-${i}`}
                value={card.heading}
                onChange={e => updateWhyCard(i, 'heading', e.target.value)}
                rows={2}
                className={`${inputClass} resize-none`}
              />
            </div>
            <div>
              <label htmlFor={`about-why-card-description-${i}`} className={labelClass}>Description</label>
              <textarea
                id={`about-why-card-description-${i}`}
                value={card.description}
                onChange={e => updateWhyCard(i, 'description', e.target.value)}
                rows={2}
                className={`${inputClass} resize-none`}
              />
            </div>
            <ImageUploadField
              label="Card Image (optional)"
              value={card.image ?? ''}
              onChange={url => updateWhyCard(i, 'image', url)}
              bucket="ulaa"
              pathPrefix="about/why-different"
              fileNamePrefix={`card-${i + 1}`}
              hint="Upload a photo, or paste an image URL (e.g. from Unsplash) — it'll show on this card as-is."
              aspectRatio="16/9"
              allowUrl
            />
          </div>
        ))}
      </div>
    </div>
  );
}
