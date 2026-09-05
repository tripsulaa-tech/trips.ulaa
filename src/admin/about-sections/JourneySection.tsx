import { Plus, Trash as Trash2, Sparkle, TextAa, TextAlignLeft } from '@phosphor-icons/react';
import TripHighlightIconPicker from '../../components/ui/TripHighlightIconPicker';
import type { AboutContent, AboutJourneyStep } from '../../types/types-index';
import {
  inputClass,
  labelClass,
  iconLabelClass,
  helperTextClass,
  previewLabelClass,
  previewBoxClass,
  itemCardClass,
  itemCardHeaderClass,
  itemNumberBadgeClass,
} from './shared';

// Soft limits matching the step's footprint on the public page (heading
// text-base, description text-sm capped to a ~200px column).
const HEADING_SOFT_LIMIT = 30;
const DESCRIPTION_SOFT_LIMIT = 85;

export default function JourneySection({
  content,
  setJourney,
  updateStep,
  addStep,
  removeStep,
  sectionRef,
}: {
  content: AboutContent['journey'];
  setJourney: (field: string, value: unknown) => void;
  updateStep: (i: number, field: keyof AboutJourneyStep, value: string) => void;
  addStep: () => void;
  removeStep: (i: number) => void;
  sectionRef: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div ref={sectionRef} data-section={8} className="scroll-mt-4 space-y-4">
      <div className="pb-3 border-b border-background-warm">
        <h2 className="font-display text-lg font-bold text-dark">8 · Your ULAA Journey</h2>
        <p className="text-xs text-dark-muted mt-1">The heading block and up to 10 step cards shown in the closing "Your ULAA Journey" timeline.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="about-journey8-sub-heading" className={iconLabelClass}>
            <Sparkle size={14} className="text-primary" aria-hidden="true" />
            Eyebrow Text
          </label>
          <p className={helperTextClass}>Small script tagline shown above the heading.</p>
          <textarea
            id="about-journey8-sub-heading"
            value={content.sub_heading}
            onChange={e => setJourney('sub_heading', e.target.value)}
            rows={1}
            className={`${inputClass} h-16 resize-none`}
            placeholder="One Step Closer"
          />
        </div>
        <div>
          <label htmlFor="about-journey8-heading" className={iconLabelClass}>
            <TextAa size={14} className="text-primary" aria-hidden="true" />
            Main Heading
          </label>
          <p className={helperTextClass}>The big bold heading itself.</p>
          <textarea
            id="about-journey8-heading"
            value={content.heading}
            onChange={e => setJourney('heading', e.target.value)}
            rows={2}
            className={`${inputClass} h-16 resize-none`}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="about-journey8-subheading" className={iconLabelClass}>
            <TextAlignLeft size={14} className="text-primary" aria-hidden="true" />
            Supporting Text
          </label>
          <p className={helperTextClass}>Paragraph shown below the heading.</p>
          <textarea
            id="about-journey8-subheading"
            value={content.subheading}
            onChange={e => setJourney('subheading', e.target.value)}
            rows={2}
            className={`${inputClass} h-16 resize-none`}
          />
        </div>
      </div>

      {/* Live preview of the heading block */}
      <div>
        <p className={previewLabelClass}>Live preview</p>
        <div className={previewBoxClass}>
          <span className="font-script text-2xl text-primary">{content.sub_heading || 'One Step Closer'}</span>
          <span className="font-display text-2xl sm:text-3xl font-bold text-dark leading-tight">{content.heading || 'Your ULAA Journey'}</span>
          {content.subheading && (
            <span className="text-sm text-dark-muted max-w-md leading-relaxed">{content.subheading}</span>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-background-warm">
          <h3 className="font-display text-base font-bold text-dark">Journey Steps ({content.steps.length}/10)</h3>
          {content.steps.length < 10 && (
            <button
              type="button"
              onClick={addStep}
              className="flex items-center gap-1 text-xs font-medium text-primary border border-primary rounded-md px-2.5 py-1.5 hover:bg-primary/5 transition-colors"
            >
              <Plus size={13} aria-hidden="true" /> Add Step
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {content.steps.map((step: AboutJourneyStep, i: number) => {
            const headingOverLimit = step.heading.length > HEADING_SOFT_LIMIT;
            const descriptionOverLimit = step.description.length > DESCRIPTION_SOFT_LIMIT;

            return (
              <div key={i} className={itemCardClass}>
                <div className={itemCardHeaderClass}>
                  <span className={itemNumberBadgeClass}>{i + 1}</span>
                  <h4 className="font-display text-sm font-bold text-dark truncate flex-1 min-w-0">
                    {step.heading || `Step ${i + 1}`}
                  </h4>
                  <button
                    type="button"
                    onClick={() => removeStep(i)}
                    aria-label={`Remove ${step.heading || `Step ${i + 1}`}`}
                    className="p-1.5 rounded-full text-primary/70 hover:text-primary hover:bg-primary/5 transition-colors flex-shrink-0"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>

                <div className="p-4 space-y-3">
                  <div>
                    <label className={labelClass}>Icon</label>
                    <p className="text-xs text-dark-muted -mt-0.5 mb-1.5">
                      Pick an icon for this step, or leave it unset to use the default rotation.
                    </p>
                    <div className="w-40">
                      <TripHighlightIconPicker
                        value={step.icon ?? ''}
                        onChange={key => updateStep(i, 'icon', key)}
                        hintText={step.heading}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label htmlFor={`about-step-heading-${i}`} className="text-sm font-medium text-dark">Heading</label>
                      <span className={`text-[10px] ${headingOverLimit ? 'text-primary font-medium' : 'text-dark-muted'}`}>
                        {step.heading.length}/{HEADING_SOFT_LIMIT}
                      </span>
                    </div>
                    <textarea
                      id={`about-step-heading-${i}`}
                      value={step.heading}
                      onChange={e => updateStep(i, 'heading', e.target.value)}
                      rows={2}
                      className={`${inputClass} resize-none`}
                    />
                    {headingOverLimit && (
                      <p className="text-[10px] text-primary mt-1">May wrap to two lines in the timeline.</p>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label htmlFor={`about-step-description-${i}`} className="text-sm font-medium text-dark">Description</label>
                      <span className={`text-[10px] ${descriptionOverLimit ? 'text-primary font-medium' : 'text-dark-muted'}`}>
                        {step.description.length}/{DESCRIPTION_SOFT_LIMIT}
                      </span>
                    </div>
                    <textarea
                      id={`about-step-description-${i}`}
                      value={step.description}
                      onChange={e => updateStep(i, 'description', e.target.value)}
                      rows={2}
                      className={`${inputClass} resize-none`}
                    />
                    {descriptionOverLimit && (
                      <p className="text-[10px] text-primary mt-1">Long copy may get clipped on the narrow step column.</p>
                    )}
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
