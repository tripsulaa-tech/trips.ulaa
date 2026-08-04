import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, GripVertical, Search } from 'lucide-react';
import AdminLayout from './AdminLayout';
import Button from '../components/ui/Button';
import ImageUploadField from '../components/ui/ImageUploadField';
import MultiImageUploadField from '../components/ui/MultiImageUploadField';
import TripHighlightIconPicker from '../components/ui/TripHighlightIconPicker';
import { getSiteContent, upsertSiteContent, deleteImageByUrl } from '../services/api';
import { DEFAULT_ABOUT, mergeWithDefaults } from '../constants/about';
import { useConfirm } from '../components/ui/useConfirm';
import { collectStorageUrls } from '../utils/utils-index';
import type {
  AboutContent,
  AboutHaveYouEverItem,
  AboutWelcomeItem,
  AboutWhyDifferentCard,
  AboutJourneyStep,
} from '../types/types-index';

// Data fetched from the DB is merged with DEFAULT_ABOUT (see
// mergeWithDefaults in constants/about.ts) so that any section or field
// missing from a partially-saved record (e.g. an older row that predates a
// newly added section) safely falls back to its default instead of being
// `undefined` and crashing the form (e.g. `content.our_story.heading`).

const inputClass =
  'w-full px-3 py-2 rounded-md border-2 border-background-warm bg-background font-body text-dark text-sm focus:border-primary outline-none transition-colors';
const labelClass = 'block text-sm font-medium text-dark mb-1';

// The 7 sections, in order — drives both the tab bar pills and the
// scroll-spy (IntersectionObserver) that keeps the active pill in sync as
// the admin scrolls. Sections themselves stay in one continuous scroll (like
// the Add Trip modal's tab bar) — clicking a pill jumps to that section
// rather than hiding the others.
const SECTION_TITLES = [
  '1 · Hero Banner',
  '2 · Our Story',
  '3 · To Unforgettable Journeys',
  '4 · Why ULAA is Different',
  '5 · Our Community',
  '6 · What Our Girls Say',
  '7 · Your ULAA Journey',
];

export default function AdminAbout() {
  const confirm = useConfirm();
  const [content, setContent] = useState<AboutContent>(DEFAULT_ABOUT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Tab bar (pills): sections stay in one continuous scroll — clicking a
  // pill scrolls to that section, and the active pill updates automatically
  // as the admin scrolls past each one (same behavior as the Add Trip
  // modal's own tab bar / Tabs.tsx).
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

  // Page-wide field search (mirrors the Add Trip modal's search field) —
  // scans every label/section-heading in the page, scrolls the first match
  // into view with a brief highlight flash.
  const [pageSearch, setPageSearch] = useState('');
  const [pageSearchNoMatch, setPageSearchNoMatch] = useState(false);
  const scrollBodyRef = useRef<HTMLDivElement>(null);

  const STORAGE_BUCKET = 'ulaa';
  // Snapshot of every storage URL present in `content` as of the last
  // successful load or save. Compared against the live set on save (to
  // find newly-uploaded images that got swapped out again before saving)
  // and exposed to AdminLayout via hasUnsavedChanges so navigating away
  // mid-edit — the actual gap this is fixing — prompts a confirmation
  // instead of silently discarding an in-progress upload/edit.
  const savedUrlsRef = useRef<Set<string>>(new Set());
  const savedContentRef = useRef<string>('');

  useEffect(() => {
    getSiteContent<Partial<AboutContent>>('about')
      .then(data => {
        const merged = mergeWithDefaults(data);
        setContent(merged);
        savedUrlsRef.current = collectStorageUrls(merged, STORAGE_BUCKET);
        savedContentRef.current = JSON.stringify(merged);
      })
      .catch(() => {
        setContent(DEFAULT_ABOUT);
        savedUrlsRef.current = collectStorageUrls(DEFAULT_ABOUT, STORAGE_BUCKET);
        savedContentRef.current = JSON.stringify(DEFAULT_ABOUT);
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

  // Scroll-spy: highlights whichever section pill matches what's currently
  // at the top of the scroll area, same approach as Tabs.tsx. Scrolls the
  // tab bar's own scrollLeft directly (centering the button) instead of
  // the button's native scrollIntoView — scrollIntoView's block dimension
  // considers this page's outer vertical scroll containers too (it can't
  // be scoped to just the tab bar's horizontal axis), which meant a tab
  // scrolled would sometimes settle only partially into view instead of
  // fully. Computing the scrollLeft ourselves touches only the tab bar.
  const scrollTabIntoView = (i: number) => {
    const bar = tabBarRef.current;
    const btn = tabButtonRefs.current[i];
    if (!bar || !btn) return;
    const target = btn.offsetLeft - bar.clientWidth / 2 + btn.clientWidth / 2;
    bar.scrollTo({ left: target, behavior: 'smooth' });
  };

  // Keeps the edge fades in sync with the tab bar's scroll position —
  // same approach as Tabs.tsx.
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
  }, []);

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
    // Re-enable the scroll-spy once scrolling has actually gone idle,
    // rather than after a fixed delay. A fixed delay that's shorter than a
    // long jump's scroll duration (e.g. last section back to the first, on
    // a page this tall) lets the observer catch an intermediate section
    // mid-scroll and immediately snap the active tab back to it — which is
    // what made clicking an earlier (left-side) tab appear to bounce back
    // to the right.
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
    // Fallback in case no scroll event fires at all (e.g. already at the target).
    suppressTimeoutRef.current = setTimeout(clearSuppression, 150);
  };

  const hasUnsavedChanges = () => JSON.stringify(content) !== savedContentRef.current;

  const handleSave = async () => {
    try {
      setSaving(true);
      await upsertSiteContent('about', content);
      // Any image that was in the previously-saved content but isn't in
      // what we just saved (e.g. swapped for a new upload, or removed)
      // is now truly orphaned — clean it up best-effort.
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
    setContent(DEFAULT_ABOUT);
  };

  if (loading) {
    return (
      <AdminLayout title="About Page">
        <div className="text-center py-16 text-dark-muted">Loading…</div>
      </AdminLayout>
    );
  }

  // ── section field setters ──────────────────────────────────────────────────

  const setHero = (field: keyof AboutContent['hero'], value: string) =>
    setContent(p => ({ ...p, hero: { ...p.hero, [field]: value } }));

  const setStory = (field: keyof AboutContent['our_story'], value: string) =>
    setContent(p => ({ ...p, our_story: { ...p.our_story, [field]: value } }));

  const setJourneyIntro = (field: 'sub_heading' | 'heading' | 'description', value: string) =>
    setContent(p => ({ ...p, journey_intro: { ...p.journey_intro, [field]: value } }));

  const setHYE = (field: string, value: unknown) =>
    setContent(p => ({
      ...p,
      journey_intro: {
        ...p.journey_intro,
        have_you_ever: { ...p.journey_intro.have_you_ever, [field]: value },
      },
    }));

  const setWTU = (field: string, value: unknown) =>
    setContent(p => ({
      ...p,
      journey_intro: {
        ...p.journey_intro,
        welcome_to_ulaa: { ...p.journey_intro.welcome_to_ulaa, [field]: value },
      },
    }));

  const setWHY = (field: string, value: unknown) =>
    setContent(p => ({ ...p, why_different: { ...p.why_different, [field]: value } }));

  const setCommunity = (field: string, value: unknown) =>
    setContent(p => ({ ...p, community: { ...p.community, [field]: value } }));

  const setJourney = (field: string, value: unknown) =>
    setContent(p => ({ ...p, journey: { ...p.journey, [field]: value } }));

  const setTestimonialsContent = (field: keyof AboutContent['testimonials'], value: string) =>
    setContent(p => ({ ...p, testimonials: { ...p.testimonials, [field]: value } }));

  // ── have_you_ever items ────────────────────────────────────────────────────

  const updateHYEItem = (i: number, field: keyof AboutHaveYouEverItem, value: string) => {
    const items: AboutHaveYouEverItem[] = content.journey_intro.have_you_ever.items.map(
      (item: AboutHaveYouEverItem, idx: number) => (idx === i ? { ...item, [field]: value } : item),
    );
    setHYE('items', items);
  };
  const addHYEItem = () => {
    if (content.journey_intro.have_you_ever.items.length >= 8) return;
    setHYE('items', [...content.journey_intro.have_you_ever.items, { text: '', icon: '' }]);
  };
  const removeHYEItem = (i: number) => {
    if (content.journey_intro.have_you_ever.items.length <= 1) return;
    setHYE('items', content.journey_intro.have_you_ever.items.filter((_: unknown, idx: number) => idx !== i));
  };

  // ── welcome_to_ulaa items ──────────────────────────────────────────────────

  const updateWTUItem = (i: number, field: keyof AboutWelcomeItem, value: string) => {
    const items: AboutWelcomeItem[] = content.journey_intro.welcome_to_ulaa.items.map(
      (item: AboutWelcomeItem, idx: number) => (idx === i ? { ...item, [field]: value } : item),
    );
    setWTU('items', items);
  };
  const addWTUItem = () => {
    if (content.journey_intro.welcome_to_ulaa.items.length >= 8) return;
    setWTU('items', [...content.journey_intro.welcome_to_ulaa.items, { icon: '', title: '', description: '' }]);
  };
  const removeWTUItem = (i: number) => {
    if (content.journey_intro.welcome_to_ulaa.items.length <= 1) return;
    setWTU('items', content.journey_intro.welcome_to_ulaa.items.filter((_: unknown, idx: number) => idx !== i));
  };

  // ── why_different cards ────────────────────────────────────────────────────

  const updateWhyCard = (i: number, field: keyof AboutWhyDifferentCard, value: string) => {
    const cards: AboutWhyDifferentCard[] = content.why_different.cards.map(
      (c: AboutWhyDifferentCard, idx: number) => (idx === i ? { ...c, [field]: value } : c),
    );
    setWHY('cards', cards);
  };
  const addWhyCard = () => {
    if (content.why_different.cards.length >= 6) return;
    setWHY('cards', [...content.why_different.cards, { heading: '', description: '', image: '' }]);
  };
  const removeWhyCard = (i: number) => {
    if (content.why_different.cards.length <= 1) return;
    setWHY('cards', content.why_different.cards.filter((_: unknown, idx: number) => idx !== i));
  };

  // ── journey steps ──────────────────────────────────────────────────────────

  const updateStep = (i: number, field: keyof AboutJourneyStep, value: string) => {
    const steps: AboutJourneyStep[] = content.journey.steps.map(
      (s: AboutJourneyStep, idx: number) => (idx === i ? { ...s, [field]: value } : s),
    );
    setJourney('steps', steps);
  };
  const addStep = () => {
    if (content.journey.steps.length >= 10) return;
    setJourney('steps', [...content.journey.steps, { heading: '', description: '', icon: '' }]);
  };
  const removeStep = (i: number) => {
    if (content.journey.steps.length <= 1) return;
    setJourney('steps', content.journey.steps.filter((_: unknown, idx: number) => idx !== i));
  };

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <AdminLayout title="About Page" subtitle="Manage every section of the public About Us page." hasUnsavedChanges={hasUnsavedChanges}>
      {/* Modal-style card: bordered white card with its own scroll area (the
          thicker "app-scroll" scrollbar), a pinned search bar + tab bar up
          top, and a footer that blends into and sticks to the bottom of the
          card while the sections scroll — same skeleton as the Add Trip
          popup, just without the overlay since this is a full page. */}
      <div className="max-w-4xl bg-white rounded-md shadow-warm-lg border border-background-warm max-h-[calc(100vh-160px)] overflow-hidden flex flex-col">
        <div className="p-6 pb-4 border-b border-background-warm flex-shrink-0 space-y-4">
          <div className="relative w-full max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-muted pointer-events-none" />
            <input
              type="text"
              value={pageSearch}
              onChange={e => setPageSearch(e.target.value)}
              placeholder="Search fields (e.g. hero heading, journey steps)..."
              className="w-full pl-9 pr-3 py-2 rounded-md border-2 border-background-warm bg-background font-body text-dark text-sm focus:border-primary outline-none transition-colors"
            />
          </div>
          {/* Tab bar — jumps to a section rather than hiding the others
              (everything stays in one continuous scroll below), same
              behavior as the Add Trip modal's own tab bar. */}
          <div className="relative">
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
                  {title.replace(/^\d+ · /, '')}
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
            <p className="text-xs text-red-500 px-6 pt-4">No matching field found for "{pageSearch}".</p>
          )}
          <div className="p-6 space-y-8">

        <div ref={el => { sectionRefs.current[0] = el; }} data-section={1} className="scroll-mt-4 space-y-4">
          <h2 className="font-display text-lg font-bold text-dark pb-3 border-b border-background-warm">1 · Hero Banner</h2>
          <ImageUploadField
            label="Banner Image (Desktop)"
            value={content.hero.image}
            onChange={url => setHero('image', url)}
            bucket="ulaa"
            pathPrefix="about/hero"
            hint="Wide landscape, at least 1920×1080px — shown full-bleed as the page's top banner on tablet & desktop screens."
            allowUrl
          />
          <ImageUploadField
            label="Banner Image (Mobile)"
            value={content.hero.mobile_image}
            onChange={url => setHero('mobile_image', url)}
            bucket="ulaa"
            pathPrefix="about/hero-mobile"
            hint="Tall portrait, at least 1080×1350px — shown on phone screens instead of the desktop banner. Falls back to the desktop banner if left empty."
            allowUrl
          />
          <div>
            <label className={labelClass}>Heading</label>
            <textarea
              value={content.hero.heading}
              onChange={e => setHero('heading', e.target.value)}
              rows={2}
              className={`${inputClass} resize-none`}
            />
          </div>
          <div>
            <label className={labelClass}>Subheading</label>
            <textarea
              value={content.hero.subheading}
              onChange={e => setHero('subheading', e.target.value)}
              rows={2}
              className={`${inputClass} resize-none`}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>CTA Button Label (optional)</label>
              <input
                value={content.hero.cta_label}
                onChange={e => setHero('cta_label', e.target.value)}
                className={inputClass}
                placeholder="Explore Trips"
              />
            </div>
            <div>
              <label className={labelClass}>CTA URL (optional)</label>
              <input
                value={content.hero.cta_url}
                onChange={e => setHero('cta_url', e.target.value)}
                className={inputClass}
                placeholder="/trips"
              />
            </div>
          </div>
        </div>
        <div ref={el => { sectionRefs.current[1] = el; }} data-section={2} className="scroll-mt-4 space-y-4">
          <h2 className="font-display text-lg font-bold text-dark pb-3 border-b border-background-warm">2 · Our Story</h2>
          <div>
            <label className={labelClass}>Section Heading</label>
            <textarea
              value={content.our_story.heading}
              onChange={e => setStory('heading', e.target.value)}
              rows={2}
              className={`${inputClass} resize-none`}
            />
          </div>
          <div>
            <label className={labelClass}>Description</label>
            <textarea
              value={content.our_story.description}
              onChange={e => setStory('description', e.target.value)}
              rows={4}
              className={`${inputClass} resize-none`}
            />
          </div>
          <ImageUploadField
            label="Story Image"
            value={content.our_story.image}
            onChange={url => setStory('image', url)}
            bucket="ulaa"
            pathPrefix="about/story"
            hint="Landscape, at least 1000×880px — shown in a cropped rounded panel."
            allowUrl
          />
        </div>
        <div ref={el => { sectionRefs.current[2] = el; }} data-section={3} className="scroll-mt-4 space-y-4">
          <h2 className="font-display text-lg font-bold text-dark pb-3 border-b border-background-warm">3 · To Unforgettable Journeys</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Sub Heading</label>
              <input
                value={content.journey_intro.sub_heading}
                onChange={e => setJourneyIntro('sub_heading', e.target.value)}
                className={inputClass}
                placeholder="From Worries"
              />
            </div>
            <div>
              <label className={labelClass}>Heading</label>
              <input
                value={content.journey_intro.heading}
                onChange={e => setJourneyIntro('heading', e.target.value)}
                className={inputClass}
                placeholder="To Unforgettable Journeys"
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>Description</label>
            <textarea
              value={content.journey_intro.description}
              onChange={e => setJourneyIntro('description', e.target.value)}
              rows={2}
              className={`${inputClass} resize-none`}
              placeholder="We turn your travel worries into beautiful experiences."
            />
          </div>

          {/* Have You Ever... (nested) */}
          <div className="border-t border-background-warm pt-4 space-y-3">
            <h3 className="font-display text-sm font-bold text-dark uppercase tracking-wide">
              Have You Ever…
            </h3>
            <div>
              <label className={labelClass}>Section Heading</label>
              <textarea
                value={content.journey_intro.have_you_ever.heading}
                onChange={e => setHYE('heading', e.target.value)}
                rows={2}
                className={`${inputClass} resize-none`}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className={`${labelClass} mb-0`}>Items</label>
                {content.journey_intro.have_you_ever.items.length < 8 && (
                  <button
                    type="button"
                    onClick={addHYEItem}
                    className="flex items-center gap-1 text-xs font-medium text-primary border border-primary rounded-md px-2.5 py-1.5 hover:bg-primary/5 transition-colors"
                  >
                    <Plus size={13} /> Add Item
                  </button>
                )}
              </div>
              <p className="text-xs text-dark-muted -mt-1">
                Pick an icon for each item, or leave it unset to use the default rotation.
              </p>
              {content.journey_intro.have_you_ever.items.map((item: AboutHaveYouEverItem, i: number) => (
                <div key={i} className="flex items-center gap-2">
                  <GripVertical size={16} className="text-dark-muted flex-shrink-0" />
                  <div className="w-40 flex-shrink-0">
                    <TripHighlightIconPicker
                      value={item.icon ?? ''}
                      onChange={key => updateHYEItem(i, 'icon', key)}
                      hintText={item.text}
                    />
                  </div>
                  <input
                    value={item.text}
                    onChange={e => updateHYEItem(i, 'text', e.target.value)}
                    className={`${inputClass} flex-1`}
                    placeholder={`Item ${i + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => removeHYEItem(i)}
                    className="p-1.5 rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    title="Remove"
                  >
                    <Trash2 size={15} />
                  </button>
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
              <label className={labelClass}>Section Heading</label>
              <textarea
                value={content.journey_intro.welcome_to_ulaa.heading}
                onChange={e => setWTU('heading', e.target.value)}
                rows={2}
                className={`${inputClass} resize-none`}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className={`${labelClass} mb-0`}>Feature Items</label>
                {content.journey_intro.welcome_to_ulaa.items.length < 8 && (
                  <button
                    type="button"
                    onClick={addWTUItem}
                    className="flex items-center gap-1 text-xs font-medium text-primary border border-primary rounded-md px-2.5 py-1.5 hover:bg-primary/5 transition-colors"
                  >
                    <Plus size={13} /> Add Item
                  </button>
                )}
              </div>
              <p className="text-xs text-dark-muted -mt-1">
                Pick an icon for each item, or leave it unset to use the default rotation.
              </p>
              {content.journey_intro.welcome_to_ulaa.items.map((item: AboutWelcomeItem, i: number) => (
                <div key={i} className="flex items-center gap-2">
                  <GripVertical size={16} className="text-dark-muted flex-shrink-0" />
                  <div className="w-40 flex-shrink-0">
                    <TripHighlightIconPicker
                      value={item.icon ?? ''}
                      onChange={key => updateWTUItem(i, 'icon', key)}
                      hintText={item.title}
                    />
                  </div>
                  <input
                    value={item.title}
                    onChange={e => updateWTUItem(i, 'title', e.target.value)}
                    className={`${inputClass} flex-1`}
                    placeholder={`Item ${i + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => removeWTUItem(i)}
                    className="p-1.5 rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    title="Remove"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div ref={el => { sectionRefs.current[3] = el; }} data-section={4} className="scroll-mt-4 space-y-4">
          <h2 className="font-display text-lg font-bold text-dark pb-3 border-b border-background-warm">4 · Why ULAA is Different</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Sub Heading</label>
              <input
                value={content.why_different.sub_heading}
                onChange={e => setWHY('sub_heading', e.target.value)}
                className={inputClass}
                placeholder="Beyond the Ordinary"
              />
            </div>
            <div>
              <label className={labelClass}>Section Heading</label>
              <textarea
                value={content.why_different.heading}
                onChange={e => setWHY('heading', e.target.value)}
                rows={2}
                className={`${inputClass} resize-none`}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Subheading</label>
              <textarea
                value={content.why_different.subheading}
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
                <span className="text-xs text-dark-muted">{content.why_different.cards.length} / 6</span>
                {content.why_different.cards.length < 6 && (
                  <button
                    type="button"
                    onClick={addWhyCard}
                    className="flex items-center gap-1 text-xs font-medium text-primary border border-primary rounded-md px-2.5 py-1.5 hover:bg-primary/5 transition-colors"
                  >
                    <Plus size={13} /> Add Card
                  </button>
                )}
              </div>
            </div>
            {content.why_different.cards.map((card: AboutWhyDifferentCard, i: number) => (
              <div key={i} className="border border-background-warm rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-dark-muted uppercase tracking-wide">
                    Card {i + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeWhyCard(i)}
                    className="p-1 rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div>
                  <label className={labelClass}>Heading</label>
                  <textarea
                    value={card.heading}
                    onChange={e => updateWhyCard(i, 'heading', e.target.value)}
                    rows={2}
                    className={`${inputClass} resize-none`}
                  />
                </div>
                <div>
                  <label className={labelClass}>Description</label>
                  <textarea
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
        <div ref={el => { sectionRefs.current[4] = el; }} data-section={5} className="scroll-mt-4 space-y-4">
          <h2 className="font-display text-lg font-bold text-dark pb-3 border-b border-background-warm">5 · Our Community</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Sub Heading</label>
              <input
                value={content.community.sub_heading}
                onChange={e => setCommunity('sub_heading', e.target.value)}
                className={inputClass}
                placeholder="Together We Thrive"
              />
            </div>
            <div>
              <label className={labelClass}>Section Heading</label>
              <textarea
                value={content.community.heading}
                onChange={e => setCommunity('heading', e.target.value)}
                rows={2}
                className={`${inputClass} resize-none`}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Subheading</label>
              <textarea
                value={content.community.subheading}
                onChange={e => setCommunity('subheading', e.target.value)}
                rows={2}
                className={`${inputClass} resize-none`}
              />
            </div>
          </div>
          <MultiImageUploadField
            label="Community Photos"
            value={content.community.photos}
            onChange={photos => setCommunity('photos', photos)}
            bucket="ulaa"
            pathPrefix="about/community"
            hint="Square, at least 600×600px — shown in a cropped grid."
            allowUrl
          />
        </div>
        <div ref={el => { sectionRefs.current[5] = el; }} data-section={6} className="scroll-mt-4 space-y-4">
          <h2 className="font-display text-lg font-bold text-dark pb-3 border-b border-background-warm">6 · What Our Girls Say</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Sub Heading</label>
              <input
                value={content.testimonials.sub_heading}
                onChange={e => setTestimonialsContent('sub_heading', e.target.value)}
                className={inputClass}
                placeholder="Stories That Inspire"
              />
            </div>
            <div>
              <label className={labelClass}>Section Heading</label>
              <textarea
                value={content.testimonials.heading}
                onChange={e => setTestimonialsContent('heading', e.target.value)}
                rows={2}
                className={`${inputClass} resize-none`}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Subheading</label>
              <textarea
                value={content.testimonials.subheading}
                onChange={e => setTestimonialsContent('subheading', e.target.value)}
                rows={2}
                className={`${inputClass} resize-none`}
                placeholder="Real stories. Real experiences."
              />
            </div>
          </div>
          <p className="text-xs text-dark-muted">
            The testimonial cards themselves come from the Testimonials section of the admin panel.
          </p>
        </div>
        <div ref={el => { sectionRefs.current[6] = el; }} data-section={7} className="scroll-mt-4 space-y-4">
          <h2 className="font-display text-lg font-bold text-dark pb-3 border-b border-background-warm">7 · Your ULAA Journey</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Sub Heading</label>
              <input
                value={content.journey.sub_heading}
                onChange={e => setJourney('sub_heading', e.target.value)}
                className={inputClass}
                placeholder="One Step Closer"
              />
            </div>
            <div>
              <label className={labelClass}>Section Heading</label>
              <textarea
                value={content.journey.heading}
                onChange={e => setJourney('heading', e.target.value)}
                rows={2}
                className={`${inputClass} resize-none`}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Subheading</label>
              <textarea
                value={content.journey.subheading}
                onChange={e => setJourney('subheading', e.target.value)}
                rows={2}
                className={`${inputClass} resize-none`}
              />
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className={`${labelClass} mb-0`}>Journey Steps</label>
              {content.journey.steps.length < 10 && (
                <button
                  type="button"
                  onClick={addStep}
                  className="flex items-center gap-1 text-xs font-medium text-primary border border-primary rounded-md px-2.5 py-1.5 hover:bg-primary/5 transition-colors"
                >
                  <Plus size={13} /> Add Step
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {content.journey.steps.map((step: AboutJourneyStep, i: number) => (
                <div key={i} className="border border-background-warm rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-dark-muted uppercase tracking-wide">
                      Step {i + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeStep(i)}
                      className="p-1 rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={14} />
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
                    <label className={labelClass}>Heading</label>
                    <textarea
                      value={step.heading}
                      onChange={e => updateStep(i, 'heading', e.target.value)}
                      rows={2}
                      className={`${inputClass} resize-none`}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Description</label>
                    <textarea
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
          </div>

          {/* ── Sticky footer — blended into and pinned to the bottom of the
              card's own scroll area (not the viewport), same pattern as the
              Add Trip modal's footer. ───────────────────────────────────── */}
          <div className="sticky bottom-0 flex items-center gap-3 bg-white border-t border-background-warm px-6 py-4 rounded-b-md">
            <Button variant="primary" size="md" className="sm:flex-1 max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]" onClick={handleSave} loading={saving}>
              Save
            </Button>
            <Button variant="outline" size="md" className="sm:flex-1 max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]" onClick={resetToDefault}>
              Reset to Default
            </Button>
            {saved && <span className="text-sm text-green-600 font-medium">Saved!</span>}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

