import {
  MagnifyingGlass as Search,
} from '@phosphor-icons/react';

import AdminLayout from './AdminLayout';
import AdminEditorFooter from './AdminEditorFooter';
import ImageUploadField from '../components/ui/ImageUploadField';
import { useContentEditorPage } from './useContentEditorPage';
import { DEFAULT_WHY_ULAA } from '../constants/why-ulaa';
import { useConfirm } from '../components/ui/useConfirm';
import type { WhyUlaaContent } from '../types/types-index';
import { FORM_INPUT_CLASS as inputClass } from '../constants/formStyles';

export default function AdminWhyULAA() {
  const confirm = useConfirm();
  const {
    content,
    setContent,
    loading,
    saving,
    saved,
    activeSection,
    setSectionRef,
    tabBarRef,
    tabButtonRefs,
    showLeftFade,
    showRightFade,
    handleTabSelect,
    pageSearch,
    setPageSearch,
    pageSearchNoMatch,
    scrollBodyRef,
    hasUnsavedChanges,
    handleSave,
  } = useContentEditorPage<WhyUlaaContent>({
    contentKey: 'why_ulaa',
    defaultContent: DEFAULT_WHY_ULAA,
    mergeWithDefaults: data => (data as WhyUlaaContent | null) || DEFAULT_WHY_ULAA,
    // "Section Text" plus one entry per feature card — grows/shrinks as
    // cards are added/removed, so the tab-fade/scroll-spy effects re-run
    // to match (same as the old inline [content.features.length] deps).
    sectionCount: c => 1 + c.features.length,
  });

  // Tab bar labels: "Section Text" plus one entry per feature card.
  const SECTION_TITLES = ['Section Text', ...content.features.map((_, i) => `Card ${i + 1}`)];

  const updateFeature = (index: number, patch: Partial<WhyUlaaContent['features'][number]>) => {
    setContent(c => ({
      ...c,
      features: c.features.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    }));
  };

  const setField = (key: 'sub_heading' | 'heading' | 'subheading', value: string) => {
    setContent(c => ({ ...c, [key]: value }));
  };

  const resetToDefault = async () => {
    const ok = await confirm({
      title: 'Reset to defaults?',
      message: 'This will overwrite your edits below (not saved until you click Save).',
      confirmLabel: 'Reset',
    });
    if (!ok) return;
    setContent(DEFAULT_WHY_ULAA);
  };

  if (loading) {
    return (
      <AdminLayout title="Why ULAA">
        <div role="status" className="text-center py-16 text-dark-muted">Loading...</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Why ULAA" subtitle='Edit the 6 image cards shown in the "Travel differently." section on the home page.' hasUnsavedChanges={hasUnsavedChanges}>
      {/* Same modal-style skeleton as the About Page: bordered card, its own
          scroll area (app-scroll), a pinned search + tab bar up top, and a
          footer that blends into and sticks to the bottom of the card. */}
      <div className="max-w-4xl bg-white rounded-md shadow-warm-lg border border-background-warm max-h-[calc(100vh-160px)] overflow-hidden flex flex-col">
        <div className="p-6 pb-4 border-b border-background-warm flex-shrink-0 space-y-4">
          <div className="relative w-full max-w-xs">
            <label htmlFor="why-ulaa-search" className="sr-only">Search fields</label>
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-muted pointer-events-none" aria-hidden="true" />
            <input
              id="why-ulaa-search"
              type="text"
              value={pageSearch}
              onChange={e => setPageSearch(e.target.value)}
              placeholder="Search fields (e.g. heading, card title)..."
              className="w-full pl-9 pr-3 py-2 rounded-md border-2 border-background-warm bg-background font-body text-dark text-sm focus:border-primary outline-none transition-colors"
            />
          </div>
          <div className="relative">
            <div ref={tabBarRef} role="tablist" aria-label="Why ULAA sections" className="flex gap-2 overflow-x-auto scrollbar-hide">
              {SECTION_TITLES.map((title, i) => (
                <button
                  key={title}
                  ref={el => { tabButtonRefs.current[i] = el; }}
                  type="button"
                  role="tab"
                  aria-selected={activeSection === i}
                  onClick={() => handleTabSelect(i)}
                  className={`shrink-0 px-4 py-2 rounded-md text-sm font-semibold whitespace-nowrap transition-colors ${
                    activeSection === i
                      ? 'bg-primary text-white'
                      : 'bg-background text-dark-muted hover:text-dark'
                  }`}
                >
                  {title}
                </button>
              ))}
            </div>
            {showLeftFade && (
              <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white to-transparent" />
            )}
            {showRightFade && (
              <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white to-transparent" />
            )}
          </div>
        </div>

        <div ref={scrollBodyRef} className="app-scroll overflow-y-auto flex-1 min-h-0">
          {pageSearchNoMatch && (
            <p role="alert" className="text-xs text-red-500 px-6 pt-4">No matching field found for "{pageSearch}".</p>
          )}
          <div className="p-6 space-y-8">

        <div ref={el => { setSectionRef(0, el); }} data-section={1} className="scroll-mt-4 space-y-4">
          <h2 className="font-display text-lg font-bold text-dark pb-3 border-b border-background-warm">Section Text</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="why-ulaa-sub-heading" className="block text-sm font-medium text-dark mb-1">Sub Heading</label>
              <input
                id="why-ulaa-sub-heading"
                value={content.sub_heading}
                onChange={e => setField('sub_heading', e.target.value)}
                className={inputClass}
                placeholder="Why Choose Us"
              />
            </div>
            <div>
              <label htmlFor="why-ulaa-heading" className="block text-sm font-medium text-dark mb-1">Section Heading</label>
              <input
                id="why-ulaa-heading"
                value={content.heading}
                onChange={e => setField('heading', e.target.value)}
                className={inputClass}
                placeholder="Travel differently."
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="why-ulaa-subheading" className="block text-sm font-medium text-dark mb-1">Subheading</label>
              <textarea
                id="why-ulaa-subheading"
                value={content.subheading}
                onChange={e => setField('subheading', e.target.value)}
                rows={2}
                className={`${inputClass} resize-none`}
              />
            </div>
          </div>
        </div>

        {content.features.map((feature, index) => (
          <div
            key={index}
            ref={el => { setSectionRef(index + 1, el); }}
            data-section={index + 2}
            className="scroll-mt-4 space-y-4"
          >
            <h2 className="font-display text-lg font-bold text-dark pb-3 border-b border-background-warm">Card {index + 1}</h2>
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

          {/* Sticky footer — blended into and pinned to the bottom of the
              card's own scroll area, same pattern as the Add Trip modal. */}
          <AdminEditorFooter onSave={handleSave} saving={saving} saved={saved} onSecondaryAction={resetToDefault} />
        </div>
      </div>
    </AdminLayout>
  );
}