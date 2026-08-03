import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Search } from 'lucide-react';
import AdminLayout from './AdminLayout';
import Button from '../components/ui/Button';
import ImageUploadField from '../components/ui/ImageUploadField';
import { getSiteContent, upsertSiteContent, deleteImageByUrl, COVER_IMAGE_TARGET_SIZE_BYTES } from '../services/api';
import { DEFAULT_FOUNDER, mergeFounderWithDefaults } from '../constants/founder';
import { useConfirm } from '../components/ui/useConfirm';
import { collectStorageUrls } from '../utils/utils-index';
import type { FounderContent, AboutFounderSocialLink } from '../types/types-index';

// This used to be a section inside the About admin page. It's now its own
// tab because the same founder data is shared across three public pages —
// About, Home, and Upcoming Trips (all render the same MeetTheFounder
// component, see src/sections/home/MeetTheFounder.tsx) — rather than being
// About-specific content. Editing it here updates it everywhere at once.

const inputClass =
  'w-full px-3 py-2 rounded-md border-2 border-background-warm bg-background font-body text-dark text-sm focus:border-primary outline-none transition-colors';
const labelClass = 'block text-sm font-medium text-dark mb-1';

// Only one section today, but kept as a list (like AdminAbout/AdminWhyULAA)
// so the tab bar / scroll-spy code is identical across all three pages —
// adding a second section later is then just adding another entry here.
const SECTION_TITLES = ['Meet the Founder'];

export default function AdminFounder() {
  const confirm = useConfirm();
  const [content, setContent] = useState<FounderContent>(DEFAULT_FOUNDER);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Tab bar (pills) + scroll-spy — identical approach to AdminAbout.tsx.
  const [activeSection, setActiveSection] = useState(0);
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const tabBarRef = useRef<HTMLDivElement>(null);
  const tabButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const lastActiveRef = useRef(0);
  const suppressObserverRef = useRef(false);
  const suppressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressScrollListenerRef = useRef<(() => void) | null>(null);

  // Page-wide field search (mirrors the Add Trip modal's search field).
  const [pageSearch, setPageSearch] = useState('');
  const [pageSearchNoMatch, setPageSearchNoMatch] = useState(false);
  const scrollBodyRef = useRef<HTMLDivElement>(null);

  const STORAGE_BUCKET = 'ulaa';
  // Same snapshot-diff approach as AdminAbout/AdminWhyULAA — see the
  // comment in AdminAbout for why this exists.
  const savedUrlsRef = useRef<Set<string>>(new Set());
  const savedContentRef = useRef<string>('');

  useEffect(() => {
    getSiteContent<Partial<FounderContent>>('founder')
      .then(data => {
        const merged = mergeFounderWithDefaults(data);
        setContent(merged);
        savedUrlsRef.current = collectStorageUrls(merged, STORAGE_BUCKET);
        savedContentRef.current = JSON.stringify(merged);
      })
      .catch(() => {
        setContent(DEFAULT_FOUNDER);
        savedUrlsRef.current = collectStorageUrls(DEFAULT_FOUNDER, STORAGE_BUCKET);
        savedContentRef.current = JSON.stringify(DEFAULT_FOUNDER);
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

  // Uses 'nearest' rather than centering the tab, so clicking a tab only
  // scrolls the pill bar the minimum amount needed — tabs before it stay
  // visible instead of being pushed off-screen by a full re-center.
  const scrollTabIntoView = (i: number) => {
    tabButtonRefs.current[i]?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
  };

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

  const handleSave = async () => {
    try {
      setSaving(true);
      await upsertSiteContent('founder', content);
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
      message: 'This will overwrite your edits (not saved until you click Save).',
      confirmLabel: 'Reset',
    });
    if (!ok) return;
    setContent(DEFAULT_FOUNDER);
  };

  if (loading) {
    return (
      <AdminLayout title="Founder">
        <div className="text-center py-16 text-dark-muted">Loading…</div>
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
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-muted pointer-events-none" />
            <input
              type="text"
              value={pageSearch}
              onChange={e => setPageSearch(e.target.value)}
              placeholder="Search fields (e.g. name, social links)..."
              className="w-full pl-9 pr-3 py-2 rounded-md border-2 border-background-warm bg-background font-body text-dark text-sm focus:border-primary outline-none transition-colors"
            />
          </div>
          <div ref={tabBarRef} className="flex gap-2 overflow-x-auto scrollbar-hide">
            {SECTION_TITLES.map((title, i) => (
              <button
                key={title}
                ref={el => { tabButtonRefs.current[i] = el; }}
                type="button"
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
        </div>

        <div ref={scrollBodyRef} className="app-scroll overflow-y-auto flex-1 min-h-0">
          {pageSearchNoMatch && (
            <p className="text-xs text-red-500 px-6 pt-4">No matching field found for "{pageSearch}".</p>
          )}
          <div className="p-6">

        <div ref={el => { sectionRefs.current[0] = el; }} data-section={1} className="scroll-mt-4 space-y-4">
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
              <label className={labelClass}>Name</label>
              <input
                value={content.name}
                onChange={e => setFounder('name', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Designation</label>
              <input
                value={content.designation}
                onChange={e => setFounder('designation', e.target.value)}
                className={inputClass}
                placeholder="Founder & CEO, ULAA"
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>About / Description</label>
            <textarea
              value={content.description}
              onChange={e => setFounder('description', e.target.value)}
              rows={4}
              className={`${inputClass} resize-none`}
            />
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className={`${labelClass} mb-0`}>Social Links</label>
              <Button variant="outline" size="sm" onClick={addSocial}>
                <Plus size={14} /> Add Link
              </Button>
            </div>
            <p className="text-xs text-dark-muted -mt-1">
              Full URLs work best, but a bare username (e.g. "justjini_") also works for Instagram, LinkedIn, Facebook, X, YouTube, TikTok, and Pinterest. For WhatsApp, enter a phone number with country code (e.g. "919876543210"). For Mail/Gmail, enter the email address.
            </p>
            {content.social_links.map((link: AboutFounderSocialLink, i: number) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-36 flex-shrink-0">
                  <input
                    value={link.platform}
                    onChange={e => updateSocial(i, 'platform', e.target.value)}
                    className={inputClass}
                    placeholder="Instagram"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <input
                    value={link.url}
                    onChange={e => updateSocial(i, 'url', e.target.value)}
                    className={inputClass}
                    placeholder="justjini_ or https://instagram.com/justjini_"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeSocial(i)}
                  className="p-1.5 rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

          </div>

          {/* Sticky footer — blended into and pinned to the bottom of the
              card's own scroll area, same pattern as the Add Trip modal. */}
          <div className="sticky bottom-0 flex items-center gap-3 bg-white border-t border-background-warm px-6 py-4 rounded-b-md">
            <Button variant="primary" size="md" className="sm:flex-1" onClick={handleSave} loading={saving}>
              Save
            </Button>
            <Button variant="outline" size="md" className="sm:flex-1" onClick={resetToDefault}>
              Reset to Default
            </Button>
            {saved && <span className="text-sm text-green-600 font-medium">Saved!</span>}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
