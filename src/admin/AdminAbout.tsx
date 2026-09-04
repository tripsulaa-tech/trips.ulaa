import ContentEditorShell from './ContentEditorShell';
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
    <ContentEditorShell
      title="About Page"
      subtitle="Manage every section of the public About Us page."
      hasUnsavedChanges={hasUnsavedChanges}
      loading={loading}
      searchId="about-search"
      searchPlaceholder="Search fields (e.g. hero heading, journey steps)..."
      pageSearch={pageSearch}
      setPageSearch={setPageSearch}
      pageSearchNoMatch={pageSearchNoMatch}
      tabBarRef={tabBarRef}
      tabButtonRefs={tabButtonRefs}
      tabBarAriaLabel="About page sections"
      sectionTitles={SECTION_TITLES}
      activeSection={activeSection}
      handleTabSelect={handleTabSelect}
      showLeftFade={showLeftFade}
      showRightFade={showRightFade}
      scrollBodyRef={scrollBodyRef}
      scrollClassName="scrollbar-hide"
      onSave={handleSave}
      saving={saving}
      saved={saved}
      onSecondaryAction={resetToDefault}
    >
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
    </ContentEditorShell>
  );
}

