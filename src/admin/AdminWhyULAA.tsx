import { useState, useEffect, useRef } from 'react';
import {
  MagnifyingGlass as Search,
} from '@phosphor-icons/react';

import AdminLayout from './AdminLayout';
import AdminEditorFooter from './AdminEditorFooter';
import ImageUploadField from '../components/ui/ImageUploadField';
import { getSiteContent, upsertSiteContent, deleteImageByUrl } from '../services/api';
import { DEFAULT_WHY_ULAA } from '../constants/why-ulaa';
import { useConfirm } from '../components/ui/useConfirm';
import { collectStorageUrls } from '../utils/utils-index';
import type { WhyUlaaContent } from '../types/types-index';
import { FORM_INPUT_CLASS as inputClass } from '../constants/formStyles';

export default function AdminWhyULAA() {
  const confirm = useConfirm();
  const [content, setContent] = useState<WhyUlaaContent>(DEFAULT_WHY_ULAA);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Tab bar (pills) + scroll-spy — identical approach to AdminAbout.tsx.
  // Section list is dynamic: "Section Text" plus one entry per feature card.
  const SECTION_TITLES = ['Section Text', ...content.features.map((_, i) => `Card ${i + 1}`)];
  const [activeSection, setActiveSection] = useState(0);
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const tabBarRef = useRef<HTMLDivElement>(null);
  const tabButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const lastActiveRef = useRef(0);
  // Edge fades on the tab bar (matches the Add Trip modal's Tabs.tsx) so
  // it's obvious there are more tabs to scroll to in either direction.
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);
  const suppressObserverRef = useRef(false);
  const suppressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressScrollListenerRef = useRef<(() => void) | null>(null);

  // Page-wide field search (mirrors the Add Trip modal's search field).
  const [pageSearch, setPageSearch] = useState('');
  const [pageSearchNoMatch, setPageSearchNoMatch] = useState(false);
  const scrollBodyRef = useRef<HTMLDivElement>(null);

  const STORAGE_BUCKET = 'ulaa';
  // Same snapshot-diff approach as AdminAbout — see the comment there for
  // why this exists (page-level Save with no modal-close hook to catch
  // orphaned uploads, so this doubles as the navigate-away guard too).
  const savedUrlsRef = useRef<Set<string>>(new Set());
  const savedContentRef = useRef<string>('');

  useEffect(() => {
    getSiteContent<WhyUlaaContent>('why_ulaa')
      .then(data => {
        const resolved = data || DEFAULT_WHY_ULAA;
        setContent(resolved);
        savedUrlsRef.current = collectStorageUrls(resolved, STORAGE_BUCKET);
        savedContentRef.current = JSON.stringify(resolved);
      })
      .catch(() => {
        setContent(DEFAULT_WHY_ULAA);
        savedUrlsRef.current = collectStorageUrls(DEFAULT_WHY_ULAA, STORAGE_BUCKET);
        savedContentRef.current = JSON.stringify(DEFAULT_WHY_ULAA);
      })
      .finally(() => setLoading(false));
  }, []);

  const handlePageSearch = () => {
    const query = pageSearch.trim().toLowerCase();
    const container = scrollBodyRef.current;
    if (!query || !container) {
      setPageSearchNoMatch(false);
      return;
    }
    const candidates = Array.from(container.querySelectorAll<HTMLElement>('label, h2'));
    const match = candidates.find(el => el.textContent?.toLowerCase().includes(query));
    if (!match) {
      setPageSearchNoMatch(true);
      return;
    }
    setPageSearchNoMatch(false);
    const sectionEl = match.closest<HTMLElement>('[data-section]');
    if (sectionEl) setActiveSection(Number(sectionEl.dataset.section) - 1);
    match.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const previousBackground = match.style.backgroundColor;
    const previousTransition = match.style.transition;
    match.style.transition = 'background-color 0.3s ease';
    match.style.backgroundColor = '#FDE9D9';
    setTimeout(() => {
      match.style.backgroundColor = previousBackground;
      match.style.transition = previousTransition;
    }, 1500);
  };

  useEffect(() => {
    const timeout = setTimeout(() => handlePageSearch(), pageSearch.trim() ? 350 : 0);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSearch]);

  // Scrolls the tab bar's own scrollLeft directly (centering the button)
  // instead of the button's native scrollIntoView — scrollIntoView's block
  // dimension considers this page's outer vertical scroll containers too
  // (it can't be scoped to just the tab bar's horizontal axis), which
  // meant a tab scrolled would sometimes settle only partially into view
  // instead of fully. Computing the scrollLeft ourselves touches only the
  // tab bar. Same approach as Tabs.tsx.
  const scrollTabIntoView = (i: number) => {
    const bar = tabBarRef.current;
    const btn = tabButtonRefs.current[i];
    if (!bar || !btn) return;
    const target = btn.offsetLeft - bar.clientWidth / 2 + btn.clientWidth / 2;
    bar.scrollTo({ left: target, behavior: 'smooth' });
  };

  // Keeps the edge fades in sync with the tab bar's scroll position — same
  // approach as Tabs.tsx. Depends on the feature count since SECTION_TITLES
  // (and so the tab bar's scrollWidth) grows/shrinks as cards are added.
  const updateTabFades = () => {
    const el = tabBarRef.current;
    if (!el) return;
    setShowLeftFade(el.scrollLeft > 4);
    setShowRightFade(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    updateTabFades();
    const el = tabBarRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateTabFades);
    const resizeObserver = new ResizeObserver(updateTabFades);
    resizeObserver.observe(el);
    return () => {
      el.removeEventListener('scroll', updateTabFades);
      resizeObserver.disconnect();
    };
  }, [content.features.length]);

  useEffect(() => {
    const container = scrollBodyRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      entries => {
        if (suppressObserverRef.current) return;
        const visible = entries.filter(e => e.isIntersecting);
        if (visible.length === 0) return;
        const topMost = visible.reduce((a, b) => (a.boundingClientRect.top <= b.boundingClientRect.top ? a : b));
        const idx = sectionRefs.current.indexOf(topMost.target as HTMLDivElement);
        if (idx !== -1 && idx !== lastActiveRef.current) {
          lastActiveRef.current = idx;
          setActiveSection(idx);
          scrollTabIntoView(idx);
        }
      },
      { root: container, rootMargin: '0px 0px -65% 0px', threshold: 0 }
    );
    sectionRefs.current.forEach(el => el && observer.observe(el));
    return () => observer.disconnect();
  }, [loading]);

  useEffect(() => () => {
    if (suppressTimeoutRef.current) clearTimeout(suppressTimeoutRef.current);
    if (suppressScrollListenerRef.current) scrollBodyRef.current?.removeEventListener('scroll', suppressScrollListenerRef.current);
  }, []);

  const handleTabSelect = (i: number) => {
    lastActiveRef.current = i;
    setActiveSection(i);
    suppressObserverRef.current = true;
    const container = scrollBodyRef.current;
    if (suppressTimeoutRef.current) clearTimeout(suppressTimeoutRef.current);
    if (suppressScrollListenerRef.current) {
      container?.removeEventListener('scroll', suppressScrollListenerRef.current);
      suppressScrollListenerRef.current = null;
    }
    sectionRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    scrollTabIntoView(i);
    const clearSuppression = () => {
      suppressObserverRef.current = false;
      if (suppressScrollListenerRef.current) {
        container?.removeEventListener('scroll', suppressScrollListenerRef.current);
        suppressScrollListenerRef.current = null;
      }
    };
    const onScroll = () => {
      if (suppressTimeoutRef.current) clearTimeout(suppressTimeoutRef.current);
      suppressTimeoutRef.current = setTimeout(clearSuppression, 150);
    };
    suppressScrollListenerRef.current = onScroll;
    container?.addEventListener('scroll', onScroll);
    suppressTimeoutRef.current = setTimeout(clearSuppression, 150);
  };

  const hasUnsavedChanges = () => JSON.stringify(content) !== savedContentRef.current;

  const updateFeature = (index: number, patch: Partial<WhyUlaaContent['features'][number]>) => {
    setContent(c => ({
      ...c,
      features: c.features.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    }));
  };

  const setField = (key: 'sub_heading' | 'heading' | 'subheading', value: string) => {
    setContent(c => ({ ...c, [key]: value }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await upsertSiteContent('why_ulaa', content);
      const newUrls = collectStorageUrls(content, STORAGE_BUCKET);
      for (const url of savedUrlsRef.current) {
        if (!newUrls.has(url)) deleteImageByUrl(STORAGE_BUCKET, url).catch(() => {});
      }
      savedUrlsRef.current = newUrls;
      savedContentRef.current = JSON.stringify(content);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      alert('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
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

        <div ref={el => { sectionRefs.current[0] = el; }} data-section={1} className="scroll-mt-4 space-y-4">
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
            ref={el => { sectionRefs.current[index + 1] = el; }}
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