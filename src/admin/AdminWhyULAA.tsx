import ContentEditorShell from './ContentEditorShell';
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

  return (
    <ContentEditorShell
      title="Why ULAA"
      subtitle='Edit the 6 image cards shown in the "Travel differently." section on the home page.'
      hasUnsavedChanges={hasUnsavedChanges}
      loading={loading}
      searchId="why-ulaa-search"
      searchPlaceholder="Search fields (e.g. heading, card title)..."
      pageSearch={pageSearch}
      setPageSearch={setPageSearch}
      pageSearchNoMatch={pageSearchNoMatch}
      tabBarRef={tabBarRef}
      tabButtonRefs={tabButtonRefs}
      tabBarAriaLabel="Why ULAA sections"
      sectionTitles={SECTION_TITLES}
      activeSection={activeSection}
      handleTabSelect={handleTabSelect}
      showLeftFade={showLeftFade}
      showRightFade={showRightFade}
      scrollBodyRef={scrollBodyRef}
      onSave={handleSave}
      saving={saving}
      saved={saved}
      onSecondaryAction={resetToDefault}
    >
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
    </ContentEditorShell>
  );
}