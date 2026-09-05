import ContentEditorShell from './ContentEditorShell';
import { useConfirm } from '../components/ui/useConfirm';
import { useAdminHomePage, SECTION_TITLES } from './useAdminHomePage';
import HeroBannerSection from './home-sections/HeroBannerSection';
import WhyUlaaSection from './home-sections/WhyUlaaSection';
import TestimonialsSection from './home-sections/TestimonialsSection';
import InstagramMomentsSection from './home-sections/InstagramMomentsSection';
import FounderSection from './home-sections/FounderSection';
import CtaBannerSection from './home-sections/CtaBannerSection';
import BottomNavSection from './home-sections/BottomNavSection';
import ButtonNamingSection from './home-sections/ButtonNamingSection';

// Replaces the old separate admin pages for Home Hero, Why ULAA,
// Testimonials, Instagram Moments, Founder, the Bottom Nav Bar, and Button
// Naming (routes /admin/home-hero, /admin/why-us, /admin/instagram-moments,
// /admin/testimonials, /admin/founder, /admin/bottom-nav,
// /admin/button-labels — all removed, see AppRouter.tsx) plus a brand new
// CTA Banner tab for what used to be hardcoded copy in CTASection.tsx. This
// is now the only way to edit any home page content — see
// useAdminHomePage.ts for the combined load/save logic and the trade-offs
// of folding Instagram Moments and Testimonials (normally instant-save CRUD
// lists) into a single tabbed Save flow.
export default function AdminHomePage() {
  const confirm = useConfirm();
  const {
    loading, saving, saved, hasUnsavedChanges, handleSave, discardChanges,
    heroContent, setHeroContent,
    whyContent, setWhyContent,
    founderContent, setFounderContent,
    ctaContent, setCtaContent,
    testimonialsSectionContent, setTestimonialsSectionContent,
    galleryImages, setGalleryImages,
    testimonials, setTestimonials,
    bottomNavItems, setBottomNavItems,
    buttonLabels, setButtonLabels,
    activeSection, setSectionRef, tabBarRef, tabButtonRefs, showLeftFade, showRightFade,
    handleTabSelect, pageSearch, setPageSearch, pageSearchNoMatch, scrollBodyRef,
  } = useAdminHomePage();

  const handleDiscard = async () => {
    const ok = await confirm({
      title: 'Discard changes?',
      message: 'This will undo everything since your last save.',
      confirmLabel: 'Discard',
    });
    if (!ok) return;
    discardChanges();
  };

  return (
    <ContentEditorShell
      title="Home Page"
      subtitle="Manage the Hero Banner, Why ULAA, Testimonials, Instagram Moments, Founder, and CTA Banner sections shown on the home page."
      hasUnsavedChanges={hasUnsavedChanges}
      loading={loading}
      searchId="home-page-search"
      searchPlaceholder="Search fields (e.g. heading, review)..."
      pageSearch={pageSearch}
      setPageSearch={setPageSearch}
      pageSearchNoMatch={pageSearchNoMatch}
      tabBarRef={tabBarRef}
      tabButtonRefs={tabButtonRefs}
      tabBarAriaLabel="Home page sections"
      sectionTitles={SECTION_TITLES}
      activeSection={activeSection}
      handleTabSelect={handleTabSelect}
      showLeftFade={showLeftFade}
      showRightFade={showRightFade}
      scrollBodyRef={scrollBodyRef}
      bodyClassName="p-6 space-y-10"
      onSave={handleSave}
      saving={saving}
      saved={saved}
      onSecondaryAction={handleDiscard}
    >
      <HeroBannerSection
        content={heroContent}
        setContent={setHeroContent}
        sectionRef={el => setSectionRef(0, el)}
      />
      <WhyUlaaSection
        content={whyContent}
        setContent={setWhyContent}
        sectionRef={el => setSectionRef(1, el)}
      />
      <TestimonialsSection
        sectionText={testimonialsSectionContent}
        setSectionText={setTestimonialsSectionContent}
        items={testimonials}
        setItems={setTestimonials}
        sectionRef={el => setSectionRef(2, el)}
      />
      <InstagramMomentsSection
        images={galleryImages}
        setImages={setGalleryImages}
        sectionRef={el => setSectionRef(3, el)}
      />
      <FounderSection
        content={founderContent}
        setContent={setFounderContent}
        sectionRef={el => setSectionRef(4, el)}
      />
      <CtaBannerSection
        content={ctaContent}
        setContent={setCtaContent}
        sectionRef={el => setSectionRef(5, el)}
      />
      <BottomNavSection
        items={bottomNavItems}
        setItems={setBottomNavItems}
        sectionRef={el => setSectionRef(6, el)}
      />
      <ButtonNamingSection
        content={buttonLabels}
        setContent={setButtonLabels}
        sectionRef={el => setSectionRef(7, el)}
      />
    </ContentEditorShell>
  );
}
