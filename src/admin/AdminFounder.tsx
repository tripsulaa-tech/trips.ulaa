import {
  Plus,
  Trash as Trash2,
  MagnifyingGlass as Search,
} from '@phosphor-icons/react';
import AdminLayout from './AdminLayout';
import AdminEditorFooter from './AdminEditorFooter';
import ImageUploadField from '../components/ui/ImageUploadField';
import { COVER_IMAGE_TARGET_SIZE_BYTES } from '../services/api';
import { useContentEditorPage } from './useContentEditorPage';
import { DEFAULT_FOUNDER, mergeFounderWithDefaults } from '../constants/founder';
import { useConfirm } from '../components/ui/useConfirm';
import type { FounderContent, AboutFounderSocialLink } from '../types/types-index';
import { FORM_INPUT_CLASS as inputClass } from '../constants/formStyles';
import { labelClass } from './about-sections/shared';

// This used to be a section inside the About admin page. It's now its own
// tab because the same founder data is shared across three public pages —
// About, Home, and Upcoming Trips (all render the same MeetTheFounder
// component, see src/sections/home/MeetTheFounder.tsx) — rather than being
// About-specific content. Editing it here updates it everywhere at once.

// Only one section today, but kept as a list (like AdminAbout/AdminWhyULAA)
// so the tab bar / scroll-spy code is identical across all three pages —
// adding a second section later is then just adding another entry here.
const SECTION_TITLES = ['Meet the Founder'];

export default function AdminFounder() {
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
  } = useContentEditorPage<FounderContent>({
    contentKey: 'founder',
    defaultContent: DEFAULT_FOUNDER,
    mergeWithDefaults: data => mergeFounderWithDefaults(data as Partial<FounderContent> | null | undefined),
    sectionCount: () => SECTION_TITLES.length,
  });

  const setFounder = (field: keyof FounderContent, value: unknown) =>
    setContent(p => ({ ...p, [field]: value }));

  const updateSocial = (i: number, field: keyof AboutFounderSocialLink, value: string) => {
    const links: AboutFounderSocialLink[] = content.social_links.map(
      (l: AboutFounderSocialLink, idx: number) => (idx === i ? { ...l, [field]: value } : l),
    );
    setFounder('social_links', links);
  };
  const addSocial = () =>
    setFounder('social_links', [...content.social_links, { platform: '', url: '' }]);
  const removeSocial = (i: number) =>
    setFounder('social_links', content.social_links.filter((_: unknown, idx: number) => idx !== i));

  const resetToDefault = async () => {
    const ok = await confirm({
      title: 'Reset to defaults?',
      message: 'This will overwrite your edits (not saved until you click Save).',
      confirmLabel: 'Reset',
    });
    if (!ok) return;
    setContent(DEFAULT_FOUNDER);
  };

  if (loading) {
    return (
      <AdminLayout title="Founder">
        <div role="status" className="text-center py-16 text-dark-muted">Loading…</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Founder"
      subtitle="Manage the Meet the Founder content shown on the About, Home, and Upcoming Trips pages."
      hasUnsavedChanges={hasUnsavedChanges}
    >
      {/* Same modal-style skeleton as the About Page: bordered card, its own
          scroll area (app-scroll), a pinned search + tab bar up top, and a
          footer that blends into and sticks to the bottom of the card. */}
      <div className="max-w-4xl bg-white rounded-md shadow-warm-lg border border-background-warm max-h-[calc(100vh-160px)] overflow-hidden flex flex-col">
        <div className="p-6 pb-4 border-b border-background-warm flex-shrink-0 space-y-4">
          <div className="relative w-full max-w-xs">
            <label htmlFor="founder-search" className="sr-only">Search fields</label>
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-muted pointer-events-none" aria-hidden="true" />
            <input
              id="founder-search"
              type="text"
              value={pageSearch}
              onChange={e => setPageSearch(e.target.value)}
              placeholder="Search fields (e.g. name, social links)..."
              className="w-full pl-9 pr-3 py-2 rounded-md border-2 border-background-warm bg-background font-body text-dark text-sm focus:border-primary outline-none transition-colors"
            />
          </div>
          <div className="relative">
            <div ref={tabBarRef} role="tablist" aria-label="Founder sections" className="flex gap-2 overflow-x-auto scrollbar-hide">
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
          <div className="p-6">

        <div ref={el => { setSectionRef(0, el); }} data-section={1} className="scroll-mt-4 space-y-4">
          <h2 className="font-display text-lg font-bold text-dark pb-3 border-b border-background-warm">Meet the Founder</h2>
          <p className="text-xs text-dark-muted -mt-2">
            This single source is shown on the About page, the Home page, and the Upcoming Trips page — edit it once here and it updates everywhere.
          </p>
          <ImageUploadField
            label="Founder Photo"
            value={content.photo}
            onChange={url => setFounder('photo', url)}
            bucket="ulaa"
            pathPrefix="founder"
            maxSizeBytes={COVER_IMAGE_TARGET_SIZE_BYTES}
            hint="Square, at least 600×600px, with the face centered."
            allowUrl
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="founder-name" className={labelClass}>Name</label>
              <input
                id="founder-name"
                value={content.name}
                onChange={e => setFounder('name', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="founder-designation" className={labelClass}>Designation</label>
              <input
                id="founder-designation"
                value={content.designation}
                onChange={e => setFounder('designation', e.target.value)}
                className={inputClass}
                placeholder="Founder & CEO, ULAA"
              />
            </div>
          </div>
          <div>
            <label htmlFor="founder-description" className={labelClass}>About / Description</label>
            <textarea
              id="founder-description"
              value={content.description}
              onChange={e => setFounder('description', e.target.value)}
              rows={4}
              className={`${inputClass} resize-none`}
            />
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className={`${labelClass} mb-0`}>Social Links</label>
              <button
                type="button"
                onClick={addSocial}
                className="flex items-center gap-1 text-xs font-medium text-primary border border-primary rounded-md px-2.5 py-1.5 hover:bg-primary/5 transition-colors"
              >
                <Plus size={13} aria-hidden="true" /> Add Link
              </button>
            </div>
            <p className="text-xs text-dark-muted -mt-1">
              Full URLs work best, but a bare username (e.g. "justjini_") also works for Instagram, LinkedIn, Facebook, X, YouTube, TikTok, and Pinterest. For WhatsApp, enter a phone number with country code (e.g. "919876543210"). For Mail/Gmail, enter the email address.
            </p>
            {content.social_links.map((link: AboutFounderSocialLink, i: number) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-36 flex-shrink-0">
                  <label htmlFor={`founder-social-platform-${i}`} className="sr-only">Social link {i + 1} platform</label>
                  <input
                    id={`founder-social-platform-${i}`}
                    value={link.platform}
                    onChange={e => updateSocial(i, 'platform', e.target.value)}
                    className={inputClass}
                    placeholder="Instagram"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <label htmlFor={`founder-social-url-${i}`} className="sr-only">{link.platform || `Social link ${i + 1}`} URL or username</label>
                  <input
                    id={`founder-social-url-${i}`}
                    value={link.url}
                    onChange={e => updateSocial(i, 'url', e.target.value)}
                    className={inputClass}
                    placeholder="justjini_ or https://instagram.com/justjini_"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeSocial(i)}
                  aria-label={`Remove ${link.platform || `social link ${i + 1}`}`}
                  className="p-1.5 rounded text-primary/70 hover:text-primary hover:bg-primary/5 transition-colors flex-shrink-0"
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </div>

          </div>

          {/* Sticky footer — blended into and pinned to the bottom of the
              card's own scroll area, same pattern as the Add Trip modal. */}
          <AdminEditorFooter onSave={handleSave} saving={saving} saved={saved} onSecondaryAction={resetToDefault} />
        </div>
      </div>
    </AdminLayout>
  );
}
