import {
  Plus,
  Trash as Trash2,
  DotsSixVertical as GripVertical,
  Sparkle,
  TextAa,
  TextAlignLeft,
} from '@phosphor-icons/react';
import TripHighlightIconPicker from '../../components/ui/TripHighlightIconPicker';
import type { AboutContent, AboutHaveYouEverItem, AboutWelcomeItem } from '../../types/types-index';
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

export default function JourneyIntroSection({
  content,
  setJourneyIntro,
  setHYE,
  updateHYEItem,
  addHYEItem,
  removeHYEItem,
  setWTU,
  updateWTUItem,
  addWTUItem,
  removeWTUItem,
  sectionRef,
}: {
  content: AboutContent['journey_intro'];
  setJourneyIntro: (field: 'sub_heading' | 'heading' | 'description', value: string) => void;
  setHYE: (field: string, value: unknown) => void;
  updateHYEItem: (i: number, field: keyof AboutHaveYouEverItem, value: string) => void;
  addHYEItem: () => void;
  removeHYEItem: (i: number) => void;
  setWTU: (field: string, value: unknown) => void;
  updateWTUItem: (i: number, field: keyof AboutWelcomeItem, value: string) => void;
  addWTUItem: () => void;
  removeWTUItem: (i: number) => void;
  sectionRef: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div ref={sectionRef} data-section={3} className="scroll-mt-4 space-y-4">
      <div className="pb-3 border-b border-background-warm">
        <h2 className="font-display text-lg font-bold text-dark">3 · To Unforgettable Journeys</h2>
        <p className="text-xs text-dark-muted mt-1">The split "Have You Ever… / Welcome to ULAA" panel bridging the intro and the rest of the page.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="about-journey-intro-sub-heading" className={iconLabelClass}>
            <Sparkle size={14} className="text-primary" aria-hidden="true" />
            Eyebrow Text
          </label>
          <p className={helperTextClass}>Small script tagline shown above the heading.</p>
          <input
            id="about-journey-intro-sub-heading"
            value={content.sub_heading}
            onChange={e => setJourneyIntro('sub_heading', e.target.value)}
            className={inputClass}
            placeholder="From Worries"
          />
        </div>
        <div>
          <label htmlFor="about-journey-intro-heading" className={iconLabelClass}>
            <TextAa size={14} className="text-primary" aria-hidden="true" />
            Main Heading
          </label>
          <p className={helperTextClass}>The big bold heading itself.</p>
          <input
            id="about-journey-intro-heading"
            value={content.heading}
            onChange={e => setJourneyIntro('heading', e.target.value)}
            className={inputClass}
            placeholder="To Unforgettable Journeys"
          />
        </div>
      </div>
      <div>
        <label htmlFor="about-journey-intro-description" className={iconLabelClass}>
          <TextAlignLeft size={14} className="text-primary" aria-hidden="true" />
          Description
        </label>
        <textarea
          id="about-journey-intro-description"
          value={content.description}
          onChange={e => setJourneyIntro('description', e.target.value)}
          rows={2}
          className={`${inputClass} resize-none`}
          placeholder="We turn your travel worries into beautiful experiences."
        />
      </div>

      {/* Live preview of the heading block above the split panel */}
      <div>
        <p className={previewLabelClass}>Live preview</p>
        <div className={previewBoxClass}>
          <span className="font-script text-2xl text-primary">{content.sub_heading || 'From Worries'}</span>
          <span className="font-display text-2xl sm:text-3xl font-bold text-dark leading-tight">{content.heading || 'To Unforgettable Journeys'}</span>
          {content.description && (
            <span className="text-sm text-dark-muted max-w-md leading-relaxed">{content.description}</span>
          )}
        </div>
      </div>

      {/* Have You Ever... (nested) */}
      <div className="border-t border-background-warm pt-4 space-y-3">
        <h3 className="font-display text-sm font-bold text-dark uppercase tracking-wide">
          Have You Ever…
        </h3>
        <div>
          <label htmlFor="about-hye-heading" className={labelClass}>Main Heading</label>
          <p className="text-[11px] text-dark-muted leading-snug mb-1.5">The big bold heading itself.</p>
          <textarea
            id="about-hye-heading"
            value={content.have_you_ever.heading}
            onChange={e => setHYE('heading', e.target.value)}
            rows={2}
            className={`${inputClass} resize-none`}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className={`${labelClass} mb-0`}>Items</label>
            {content.have_you_ever.items.length < 8 && (
              <button
                type="button"
                onClick={addHYEItem}
                className="flex items-center gap-1 text-xs font-medium text-primary border border-primary rounded-md px-2.5 py-1.5 hover:bg-primary/5 transition-colors"
              >
                <Plus size={13} aria-hidden="true" /> Add Item
              </button>
            )}
          </div>
          <p className="text-xs text-dark-muted -mt-1">
            Pick an icon for each item, or leave it unset to use the default rotation.
          </p>
          {content.have_you_ever.items.map((item: AboutHaveYouEverItem, i: number) => (
            <div key={i} className={itemCardClass}>
              <div className={itemCardHeaderClass}>
                <GripVertical size={14} className="text-dark-muted flex-shrink-0" aria-hidden="true" />
                <span className={itemNumberBadgeClass}>{i + 1}</span>
                <span className="text-sm font-semibold text-dark truncate flex-1 min-w-0">
                  {item.text || `Item ${i + 1}`}
                </span>
                <button
                  type="button"
                  onClick={() => removeHYEItem(i)}
                  className="p-1.5 rounded-full text-primary/70 hover:text-primary hover:bg-primary/5 transition-colors flex-shrink-0"
                  aria-label={`Remove ${item.text || `item ${i + 1}`}`}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
              <div className="p-3 flex items-center gap-2">
                <div className="w-40 flex-shrink-0">
                  <TripHighlightIconPicker
                    value={item.icon ?? ''}
                    onChange={key => updateHYEItem(i, 'icon', key)}
                    hintText={item.text}
                  />
                </div>
                <label htmlFor={`about-hye-item-${i}`} className="sr-only">Have You Ever item {i + 1}</label>
                <input
                  id={`about-hye-item-${i}`}
                  value={item.text}
                  onChange={e => updateHYEItem(i, 'text', e.target.value)}
                  className={`${inputClass} flex-1`}
                  placeholder={`Item ${i + 1}`}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Welcome to ULAA (nested) */}
      <div className="border-t border-background-warm pt-4 space-y-3">
        <h3 className="font-display text-sm font-bold text-dark uppercase tracking-wide">
          Welcome to ULAA
        </h3>
        <div>
          <label htmlFor="about-wtu-heading" className={labelClass}>Main Heading</label>
          <p className="text-[11px] text-dark-muted leading-snug mb-1.5">The big bold heading itself.</p>
          <textarea
            id="about-wtu-heading"
            value={content.welcome_to_ulaa.heading}
            onChange={e => setWTU('heading', e.target.value)}
            rows={2}
            className={`${inputClass} resize-none`}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className={`${labelClass} mb-0`}>Feature Items</label>
            {content.welcome_to_ulaa.items.length < 8 && (
              <button
                type="button"
                onClick={addWTUItem}
                className="flex items-center gap-1 text-xs font-medium text-primary border border-primary rounded-md px-2.5 py-1.5 hover:bg-primary/5 transition-colors"
              >
                <Plus size={13} aria-hidden="true" /> Add Item
              </button>
            )}
          </div>
          <p className="text-xs text-dark-muted -mt-1">
            Pick an icon for each item, or leave it unset to use the default rotation.
          </p>
          {content.welcome_to_ulaa.items.map((item: AboutWelcomeItem, i: number) => (
            <div key={i} className={itemCardClass}>
              <div className={itemCardHeaderClass}>
                <GripVertical size={14} className="text-dark-muted flex-shrink-0" aria-hidden="true" />
                <span className={itemNumberBadgeClass}>{i + 1}</span>
                <span className="text-sm font-semibold text-dark truncate flex-1 min-w-0">
                  {item.title || `Item ${i + 1}`}
                </span>
                <button
                  type="button"
                  onClick={() => removeWTUItem(i)}
                  className="p-1.5 rounded-full text-primary/70 hover:text-primary hover:bg-primary/5 transition-colors flex-shrink-0"
                  aria-label={`Remove ${item.title || `item ${i + 1}`}`}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
              <div className="p-3 flex items-center gap-2">
                <div className="w-40 flex-shrink-0">
                  <TripHighlightIconPicker
                    value={item.icon ?? ''}
                    onChange={key => updateWTUItem(i, 'icon', key)}
                    hintText={item.title}
                  />
                </div>
                <label htmlFor={`about-wtu-item-${i}`} className="sr-only">Welcome to ULAA item {i + 1}</label>
                <input
                  id={`about-wtu-item-${i}`}
                  value={item.title}
                  onChange={e => updateWTUItem(i, 'title', e.target.value)}
                  className={`${inputClass} flex-1`}
                  placeholder={`Item ${i + 1}`}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
