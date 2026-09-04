import { Plus, Trash as Trash2 } from '@phosphor-icons/react';
import TripHighlightIconPicker from '../../components/ui/TripHighlightIconPicker';
import type { AboutContent, AboutJourneyStep } from '../../types/types-index';
import { inputClass, labelClass } from './shared';

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
      <h2 className="font-display text-lg font-bold text-dark pb-3 border-b border-background-warm">8 · Your ULAA Journey</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="about-journey8-sub-heading" className={labelClass}>Eyebrow Text</label>
          <p className="text-[11px] text-dark-muted leading-snug mb-1.5">Small script tagline shown above the heading.</p>
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
          <label htmlFor="about-journey8-heading" className={labelClass}>Main Heading</label>
          <p className="text-[11px] text-dark-muted leading-snug mb-1.5">The big bold heading itself.</p>
          <textarea
            id="about-journey8-heading"
            value={content.heading}
            onChange={e => setJourney('heading', e.target.value)}
            rows={2}
            className={`${inputClass} h-16 resize-none`}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="about-journey8-subheading" className={labelClass}>Supporting Text</label>
          <p className="text-[11px] text-dark-muted leading-snug mb-1.5">Paragraph shown below the heading.</p>
          <textarea
            id="about-journey8-subheading"
            value={content.subheading}
            onChange={e => setJourney('subheading', e.target.value)}
            rows={2}
            className={`${inputClass} h-16 resize-none`}
          />
        </div>
      </div>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label className={`${labelClass} mb-0`}>Journey Steps</label>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {content.steps.map((step: AboutJourneyStep, i: number) => (
            <div key={i} className="border border-background-warm rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-dark-muted uppercase tracking-wide">
                  Step {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeStep(i)}
                  aria-label={`Remove ${step.heading || `Step ${i + 1}`}`}
                  className="p-1 rounded text-primary/70 hover:text-primary hover:bg-primary/5 transition-colors"
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
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
                <label htmlFor={`about-step-heading-${i}`} className={labelClass}>Heading</label>
                <textarea
                  id={`about-step-heading-${i}`}
                  value={step.heading}
                  onChange={e => updateStep(i, 'heading', e.target.value)}
                  rows={2}
                  className={`${inputClass} resize-none`}
                />
              </div>
              <div>
                <label htmlFor={`about-step-description-${i}`} className={labelClass}>Description</label>
                <textarea
                  id={`about-step-description-${i}`}
                  value={step.description}
                  onChange={e => updateStep(i, 'description', e.target.value)}
                  rows={2}
                  className={`${inputClass} resize-none`}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
