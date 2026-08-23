import { MagnifyingGlass as Search } from '@phosphor-icons/react';
import AdminLayout from './AdminLayout';
import AdminEditorFooter from './AdminEditorFooter';
import { useContentEditorPage } from './useContentEditorPage';
import { DEFAULT_ABOUT, mergeWithDefaults } from '../constants/about';
import { useConfirm } from '../components/ui/useConfirm';
import type {
  AboutContent,
  AboutHaveYouEverItem,
  AboutWelcomeItem,
  AboutWhyDifferentCard,
  AboutJourneyStep,
} from '../types/types-index';
import HeroSection from './about-sections/HeroSection';
import OurStorySection from './about-sections/OurStorySection';
import JourneyIntroSection from './about-sections/JourneyIntroSection';
import WhyDifferentSection from './about-sections/WhyDifferentSection';
import CommunitySection from './about-sections/CommunitySection';
import StatsSection from './about-sections/StatsSection';
import TestimonialsSection from './about-sections/TestimonialsSection';
import JourneySection from './about-sections/JourneySection';

// Data fetched from the DB is merged with DEFAULT_ABOUT (see
// mergeWithDefaults in constants/about.ts) so that any section or field
// missing from a partially-saved record (e.g. an older row that predates a
// newly added section) safely falls back to its default instead of being
// `undefined` and crashing the form (e.g. `content.our_story.heading`).

// The 8 sections, in order — drives both the tab bar pills and the
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
  '6 · Statistics',
  '7 · What Our Girls Say',
  '8 · Your ULAA Journey',
];

export default function AdminAbout() {
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
  } = useContentEditorPage<AboutContent>({
    contentKey: 'about',
    defaultContent: DEFAULT_ABOUT,
    mergeWithDefaults: data => mergeWithDefaults(data as Partial<AboutContent> | null | undefined),
    sectionCount: () => SECTION_TITLES.length,
  });

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
        <div role="status" className="text-center py-16 text-dark-muted">Loading…</div>
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

  const setStats = (field: keyof AboutContent['stats'], value: string) =>
    setContent(p => ({ ...p, stats: { ...p.stats, [field]: value } }));

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
            <label htmlFor="about-search" className="sr-only">Search fields</label>
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-muted pointer-events-none" aria-hidden="true" />
            <input
              id="about-search"
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
            <div ref={tabBarRef} role="tablist" aria-label="About page sections" className="flex gap-2 overflow-x-auto scrollbar-hide">
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
            <p role="alert" className="text-xs text-red-500 px-6 pt-4">No matching field found for "{pageSearch}".</p>
          )}
          <div className="p-6 space-y-8">

        <HeroSection content={content.hero} setHero={setHero} sectionRef={el => { setSectionRef(0, el); }} />
        <OurStorySection content={content.our_story} setStory={setStory} sectionRef={el => { setSectionRef(1, el); }} />
        <JourneyIntroSection
          content={content.journey_intro}
          setJourneyIntro={setJourneyIntro}
          setHYE={setHYE}
          updateHYEItem={updateHYEItem}
          addHYEItem={addHYEItem}
          removeHYEItem={removeHYEItem}
          setWTU={setWTU}
          updateWTUItem={updateWTUItem}
          addWTUItem={addWTUItem}
          removeWTUItem={removeWTUItem}
          sectionRef={el => { setSectionRef(2, el); }}
        />
        <WhyDifferentSection
          content={content.why_different}
          setWHY={setWHY}
          updateWhyCard={updateWhyCard}
          addWhyCard={addWhyCard}
          removeWhyCard={removeWhyCard}
          sectionRef={el => { setSectionRef(3, el); }}
        />
        <CommunitySection content={content.community} setCommunity={setCommunity} sectionRef={el => { setSectionRef(4, el); }} />
        <StatsSection content={content.stats} setStats={setStats} sectionRef={el => { setSectionRef(5, el); }} />
        <TestimonialsSection
          content={content.testimonials}
          setTestimonialsContent={setTestimonialsContent}
          sectionRef={el => { setSectionRef(6, el); }}
        />
        <JourneySection
          content={content.journey}
          setJourney={setJourney}
          updateStep={updateStep}
          addStep={addStep}
          removeStep={removeStep}
          sectionRef={el => { setSectionRef(7, el); }}
        />
          </div>

          {/* ── Sticky footer — blended into and pinned to the bottom of the
              card's own scroll area (not the viewport), same pattern as the
              Add Trip modal's footer. ───────────────────────────────────── */}
          <AdminEditorFooter onSave={handleSave} saving={saving} saved={saved} onSecondaryAction={resetToDefault} />
        </div>
      </div>
    </AdminLayout>
  );
}

