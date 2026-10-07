import { useState, useEffect, useRef, useMemo } from 'react';
import { useSectionTabChrome } from './useSectionTabChrome';
import {
  getSiteContent, upsertSiteContent, deleteImageByUrl, getStoragePathFromUrl, deleteImage,
  getGalleryImages, addGalleryImage, deleteGalleryImage, updateGalleryFeatured, updateGalleryOrder,
  getAllTestimonialsAdmin, createTestimonial, updateTestimonial, deleteTestimonial,
} from '../services/api';
import { collectStorageUrls } from '../utils/utils-index';
import { lookupDraft, stableStringify, useDraftKeeper, discardDraft } from '../hooks/useSessionDraft';
import { DEFAULT_HOME_HERO, mergeWithDefaults as mergeHero } from '../constants/home-hero';
import { DEFAULT_WHY_ULAA } from '../constants/why-ulaa';
import { DEFAULT_FOUNDER, mergeFounderWithDefaults } from '../constants/founder';
import { DEFAULT_CTA_BANNER, mergeWithDefaults as mergeCta } from '../constants/cta-banner';
import { DEFAULT_TESTIMONIALS_SECTION } from '../constants/testimonials-section';
import { DEFAULT_BOTTOM_NAV_ITEMS } from '../constants/bottomNav';
import { DEFAULT_BUTTON_LABELS } from '../constants/buttonLabels';
import type {
  HomeHeroContent, WhyUlaaContent, FounderContent, CtaBannerContent,
  TestimonialsSectionContent, GalleryImage, Testimonial, BottomNavItemConfig, ButtonLabelsConfig,
} from '../types/types-index';
import { STORAGE_BUCKET } from '../constants/storage';
import { useAlert } from '../components/ui/useAlert';
import { useConfirm } from '../components/ui/useConfirm';


// The public homepage's real section order (see src/pages/HomePage.tsx) —
// Upcoming Trips and Completed Trips are skipped here since those are
// auto-pulled from the Trips/Albums tables, not editable content. Bottom
// Nav Bar and Button Naming are tacked on at the end — neither is a
// homepage section (Bottom Nav Bar is mobile-only chrome, Button Naming
// drives the trip-page CTA buttons), but both are folded in here per the
// same "one place to edit everything" direction as the rest of this page.
export const SECTION_TITLES = [
  'Hero Banner',
  'Why Ulaa',
  'Testimonials',
  'Instagram Moments',
  'Meet the Founder',
  'CTA Banner',
  'Bottom Nav Bar',
  'Button Naming',
];

// Instagram Moments and Testimonials are normally full CRUD list managers
// (upload/delete/reorder/feature, each action saving instantly — see the
// old AdminGallery.tsx / AdminTestimonials.tsx). Folded into this page's
// single tabbed Save flow, every add/remove/reorder/feature/publish edit
// below only mutates local state — nothing is written to the `gallery` or
// `testimonials` tables until the page's own Save button is clicked, same
// as every other section here. Photo uploads themselves still happen
// immediately on file select (there's no way to preview a photo otherwise,
// and this matches how Home Hero photos already work) — only the
// database row create/update/delete is deferred.
interface UseAdminHomePageResult {
  loading: boolean;
  saving: boolean;
  saved: boolean;
  hasUnsavedChanges: () => boolean;
  handleSave: () => Promise<void>;
  discardChanges: () => void;
  /** A kept draft is on hold because the saved version changed after it was started. */
  draftOnHold: boolean;
  restoreHeldDraft: () => void;
  discardHeldDraft: () => void;

  heroContent: HomeHeroContent;
  setHeroContent: React.Dispatch<React.SetStateAction<HomeHeroContent>>;
  whyContent: WhyUlaaContent;
  setWhyContent: React.Dispatch<React.SetStateAction<WhyUlaaContent>>;
  founderContent: FounderContent;
  setFounderContent: React.Dispatch<React.SetStateAction<FounderContent>>;
  ctaContent: CtaBannerContent;
  setCtaContent: React.Dispatch<React.SetStateAction<CtaBannerContent>>;
  testimonialsSectionContent: TestimonialsSectionContent;
  setTestimonialsSectionContent: React.Dispatch<React.SetStateAction<TestimonialsSectionContent>>;
  galleryImages: GalleryImage[];
  setGalleryImages: React.Dispatch<React.SetStateAction<GalleryImage[]>>;
  testimonials: Testimonial[];
  setTestimonials: React.Dispatch<React.SetStateAction<Testimonial[]>>;
  bottomNavItems: BottomNavItemConfig[];
  setBottomNavItems: React.Dispatch<React.SetStateAction<BottomNavItemConfig[]>>;
  buttonLabels: ButtonLabelsConfig;
  setButtonLabels: React.Dispatch<React.SetStateAction<ButtonLabelsConfig>>;

  // Tab bar / scroll-spy chrome — same shape as useContentEditorPage's,
  // fixed to SECTION_TITLES.length since this page's section list never
  // grows/shrinks with the data (unlike Why Ulaa's feature cards).
  activeSection: number;
  setSectionRef: (index: number, el: HTMLDivElement | null) => void;
  tabBarRef: React.RefObject<HTMLDivElement | null>;
  tabButtonRefs: React.RefObject<(HTMLButtonElement | null)[]>;
  showLeftFade: boolean;
  showRightFade: boolean;
  handleTabSelect: (i: number) => void;
  pageSearch: string;
  setPageSearch: (value: string) => void;
  pageSearchNoMatch: boolean;
  scrollBodyRef: React.RefObject<HTMLDivElement | null>;
}

/** Everything this page edits, as one object — the unit that is kept as a draft and compared
 *  against the saved version. */
interface HomeState {
  hero: HomeHeroContent; why: WhyUlaaContent; founder: FounderContent; cta: CtaBannerContent;
  testimonialsSection: TestimonialsSectionContent; gallery: GalleryImage[]; items: Testimonial[];
  bottomNav: BottomNavItemConfig[]; buttonLabels: ButtonLabelsConfig;
}

const DRAFT_KEY = 'home-page';

/** Reads the saved version of every part of the page from the database. */
async function fetchSavedHomeState(): Promise<HomeState> {
  const [heroData, whyData, founderData, ctaData, testimonialsSectionData, bottomNavData, buttonLabelsData, gallery, items] = await Promise.all([
    getSiteContent<Partial<HomeHeroContent>>('home_hero'),
    getSiteContent<Partial<WhyUlaaContent>>('why_ulaa'),
    getSiteContent<Partial<FounderContent>>('founder'),
    getSiteContent<Partial<CtaBannerContent>>('cta_banner'),
    getSiteContent<Partial<TestimonialsSectionContent>>('testimonials_section'),
    getSiteContent<BottomNavItemConfig[]>('bottom_nav'),
    getSiteContent<Partial<ButtonLabelsConfig>>('button_labels'),
    getGalleryImages(),
    getAllTestimonialsAdmin(),
  ]);
  return {
    hero: mergeHero(heroData),
    why: (whyData as WhyUlaaContent | null) || DEFAULT_WHY_ULAA,
    founder: mergeFounderWithDefaults(founderData),
    cta: mergeCta(ctaData),
    testimonialsSection: { ...DEFAULT_TESTIMONIALS_SECTION, ...testimonialsSectionData },
    bottomNav: bottomNavData && bottomNavData.length > 0 ? bottomNavData : DEFAULT_BOTTOM_NAV_ITEMS,
    buttonLabels: buttonLabelsData?.primaryCta ? (buttonLabelsData as ButtonLabelsConfig) : DEFAULT_BUTTON_LABELS,
    gallery,
    items,
  };
}

function makeTempId() {
  return `new-${crypto.randomUUID()}`;
}

export function useAdminHomePage(): UseAdminHomePageResult {
  const alert = useAlert();
  const confirm = useConfirm();
  const [heroContent, setHeroContent] = useState<HomeHeroContent>(DEFAULT_HOME_HERO);
  const [whyContent, setWhyContent] = useState<WhyUlaaContent>(DEFAULT_WHY_ULAA);
  const [founderContent, setFounderContent] = useState<FounderContent>(DEFAULT_FOUNDER);
  const [ctaContent, setCtaContent] = useState<CtaBannerContent>(DEFAULT_CTA_BANNER);
  const [testimonialsSectionContent, setTestimonialsSectionContent] = useState<TestimonialsSectionContent>(DEFAULT_TESTIMONIALS_SECTION);
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [bottomNavItems, setBottomNavItems] = useState<BottomNavItemConfig[]>(DEFAULT_BOTTOM_NAV_ITEMS);
  const [buttonLabels, setButtonLabels] = useState<ButtonLabelsConfig>(DEFAULT_BUTTON_LABELS);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Snapshots as of the last successful load/save, for the unsaved-changes
  // guard and for diffing which gallery/testimonial rows actually changed.
  const savedContentRef = useRef<string>('');
  const savedUrlsRef = useRef<Set<string>>(new Set());
  const originalGalleryRef = useRef<GalleryImage[]>([]);
  const originalTestimonialsRef = useRef<Testimonial[]>([]);
  // Full snapshot of the last-loaded/last-saved state, for the "Discard
  // changes" secondary action — deep-cloned on every read so callers can't
  // mutate it by reference.
  const savedStateRef = useRef<HomeState | null>(null);

  const snapshot = (
    hero: HomeHeroContent, why: WhyUlaaContent, founder: FounderContent, cta: CtaBannerContent,
    testimonialsSection: TestimonialsSectionContent, gallery: GalleryImage[], items: Testimonial[],
    bottomNav: BottomNavItemConfig[], buttonLabels: ButtonLabelsConfig,
  ) => JSON.stringify({
    hero, why, founder, cta, testimonialsSection, bottomNav, buttonLabels,
    gallery: gallery.map(g => ({ id: g.id, image_url: g.image_url, is_featured: g.is_featured })),
    items: items.map(t => ({
      id: t.id, name: t.name, photo: t.photo || '', review: t.review, rating: t.rating,
      destination: t.destination || '', is_published: t.is_published,
    })),
  });

  const [draftBase, setDraftBase] = useState<string | null>(null);
  const [heldDraft, setHeldDraft] = useState<HomeState | null>(null);

  const applyState = (st: HomeState) => {
    setHeroContent(st.hero);
    setWhyContent(st.why);
    setFounderContent(st.founder);
    setCtaContent(st.cta);
    setTestimonialsSectionContent(st.testimonialsSection);
    setGalleryImages(st.gallery);
    setTestimonials(st.items);
    setBottomNavItems(st.bottomNav);
    setButtonLabels(st.buttonLabels);
  };

  useEffect(() => {
    fetchSavedHomeState().then(saved => {
      const base = stableStringify(saved);
      // Unsaved edits from an earlier visit in this browser tab come back as they were left,
      // unless the saved version changed since — then they are held back (see heldDraft).
      const { draft, stale } = lookupDraft<HomeState>(DRAFT_KEY, base);
      applyState(draft ?? saved);
      setHeldDraft(stale);

      originalGalleryRef.current = saved.gallery;
      originalTestimonialsRef.current = saved.items;
      savedUrlsRef.current = new Set([
        ...collectStorageUrls(saved.hero, STORAGE_BUCKET),
        ...collectStorageUrls(saved.why, STORAGE_BUCKET),
        ...collectStorageUrls(saved.founder, STORAGE_BUCKET),
        ...collectStorageUrls(saved.cta, STORAGE_BUCKET),
      ]);
      savedContentRef.current = snapshot(saved.hero, saved.why, saved.founder, saved.cta, saved.testimonialsSection, saved.gallery, saved.items, saved.bottomNav, saved.buttonLabels);
      savedStateRef.current = saved;
      setDraftBase(base);
    }).catch(() => {
      // Leave the defaults in place — same fallback behavior as every
      // single-page content editor this replaces. With nothing to compare a draft against,
      // none is kept or restored this visit.
    }).finally(() => setLoading(false));
    // Runs once on mount only, like every content-editor page this replaces.
  }, []);

  const workingState = useMemo<HomeState>(() => ({
    hero: heroContent, why: whyContent, founder: founderContent, cta: ctaContent,
    testimonialsSection: testimonialsSectionContent, gallery: galleryImages, items: testimonials,
    bottomNav: bottomNavItems, buttonLabels,
  }), [heroContent, whyContent, founderContent, ctaContent, testimonialsSectionContent, galleryImages, testimonials, bottomNavItems, buttonLabels]);

  // Keep the unsaved edits while they differ from what is saved (paused while a draft is on hold).
  useDraftKeeper({ key: DRAFT_KEY, value: workingState, base: heldDraft ? null : draftBase, bucket: STORAGE_BUCKET });

  const restoreHeldDraft = () => {
    if (!heldDraft) return;
    applyState(heldDraft);
    setHeldDraft(null);
  };
  const discardHeldDraft = () => {
    discardDraft(DRAFT_KEY);
    setHeldDraft(null);
  };

  const hasUnsavedChanges = () =>
    snapshot(heroContent, whyContent, founderContent, ctaContent, testimonialsSectionContent, galleryImages, testimonials, bottomNavItems, buttonLabels) !== savedContentRef.current;

  const handleSave = async () => {
    if (!buttonLabels.primaryCta.trim() || !buttonLabels.waitlistCta.trim()) {
      alert('Both button names (in Button Naming) are required.');
      return;
    }
    try {
      setSaving(true);

      // Someone may have saved this page since it was opened here; check before overwriting.
      const current = await fetchSavedHomeState().catch(() => null);
      if (current && draftBase !== null && stableStringify(current) !== draftBase) {
        const overwrite = await confirm('The saved version of the Home Page changed after you opened it. Saving now replaces those newer changes with what is on your screen. Save anyway?');
        if (!overwrite) return;
      }

      await Promise.all([
        upsertSiteContent('home_hero', heroContent),
        upsertSiteContent('why_ulaa', whyContent),
        upsertSiteContent('founder', founderContent),
        upsertSiteContent('cta_banner', ctaContent),
        upsertSiteContent('testimonials_section', testimonialsSectionContent),
        upsertSiteContent('bottom_nav', bottomNavItems),
        upsertSiteContent('button_labels', buttonLabels),
      ]);

      // Clean up any image swapped out of the single-blob sections
      // (hero/why/founder/cta) since the last save — same pattern as
      // useContentEditorPage.handleSave.
      const newUrls = new Set([
        ...collectStorageUrls(heroContent, STORAGE_BUCKET),
        ...collectStorageUrls(whyContent, STORAGE_BUCKET),
        ...collectStorageUrls(founderContent, STORAGE_BUCKET),
        ...collectStorageUrls(ctaContent, STORAGE_BUCKET),
      ]);
      for (const url of savedUrlsRef.current) {
        if (!newUrls.has(url)) deleteImageByUrl(STORAGE_BUCKET, url).catch(() => {});
      }
      savedUrlsRef.current = newUrls;

      // Gallery: diff the working list against what was loaded/last saved.
      const originalGallery = originalGalleryRef.current;
      const finalGalleryIds = new Set(galleryImages.map(g => g.id));
      for (const orig of originalGallery) {
        if (!finalGalleryIds.has(orig.id)) {
          await deleteGalleryImage(orig.id);
          const path = getStoragePathFromUrl(STORAGE_BUCKET, orig.image_url);
          if (path) deleteImage(STORAGE_BUCKET, path).catch(() => {});
        }
      }
      const originalGalleryById = new Map(originalGallery.map(g => [g.id, g]));
      const resolvedGallery: GalleryImage[] = [];
      for (let i = 0; i < galleryImages.length; i++) {
        const img = galleryImages[i];
        if (img.id.startsWith('new-')) {
          const created = await addGalleryImage(img.image_url, i);
          if (img.is_featured) await updateGalleryFeatured(created.id, true);
          resolvedGallery.push({ ...created, is_featured: img.is_featured });
        } else {
          const orig = originalGalleryById.get(img.id);
          if (!orig || orig.sort_order !== i) await updateGalleryOrder(img.id, i);
          if (!orig || orig.is_featured !== img.is_featured) await updateGalleryFeatured(img.id, img.is_featured);
          resolvedGallery.push({ ...img, sort_order: i });
        }
      }

      // Testimonials: same shape of diff.
      const originalTestimonials = originalTestimonialsRef.current;
      const finalTestimonialIds = new Set(testimonials.map(t => t.id));
      for (const orig of originalTestimonials) {
        if (!finalTestimonialIds.has(orig.id)) {
          await deleteTestimonial(orig.id);
          if (orig.photo) deleteImageByUrl(STORAGE_BUCKET, orig.photo).catch(() => {});
        }
      }
      const originalTestimonialById = new Map(originalTestimonials.map(t => [t.id, t]));
      const resolvedTestimonials: Testimonial[] = [];
      for (let i = 0; i < testimonials.length; i++) {
        const t = testimonials[i];
        const patch = {
          name: t.name, photo: t.photo, review: t.review, rating: t.rating,
          destination: t.destination, is_published: t.is_published, sort_order: i,
        };
        if (t.id.startsWith('new-')) {
          const created = await createTestimonial(patch);
          resolvedTestimonials.push(created);
        } else {
          const orig = originalTestimonialById.get(t.id);
          const changed = !orig || orig.name !== t.name || orig.photo !== t.photo || orig.review !== t.review
            || orig.rating !== t.rating || orig.destination !== t.destination
            || orig.is_published !== t.is_published || orig.sort_order !== i;
          if (changed) {
            const updated = await updateTestimonial(t.id, patch);
            resolvedTestimonials.push(updated);
          } else {
            resolvedTestimonials.push(t);
          }
        }
      }

      setGalleryImages(resolvedGallery);
      setTestimonials(resolvedTestimonials);
      originalGalleryRef.current = resolvedGallery;
      originalTestimonialsRef.current = resolvedTestimonials;
      savedContentRef.current = snapshot(
        heroContent, whyContent, founderContent, ctaContent, testimonialsSectionContent,
        resolvedGallery, resolvedTestimonials, bottomNavItems, buttonLabels,
      );
      savedStateRef.current = {
        hero: heroContent, why: whyContent, founder: founderContent, cta: ctaContent,
        testimonialsSection: testimonialsSectionContent, gallery: resolvedGallery, items: resolvedTestimonials,
        bottomNav: bottomNavItems, buttonLabels,
      };
      setDraftBase(stableStringify(savedStateRef.current));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      alert('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Reverts every field back to the last-loaded/last-saved state (not to
  // hardcoded defaults — unlike the single-content pages this replaces,
  // "reset to defaults" would be destructive here since it'd wipe the
  // gallery/testimonials lists too). Images uploaded since the last save that the saved
  // version doesn't use are deleted, so discarding doesn't leave files behind in storage.
  const discardChanges = () => {
    const s = savedStateRef.current;
    if (!s) return;
    const keep = collectStorageUrls(s, STORAGE_BUCKET);
    for (const url of collectStorageUrls(workingState, STORAGE_BUCKET)) {
      if (!keep.has(url)) deleteImageByUrl(STORAGE_BUCKET, url).catch(() => {});
    }
    applyState(JSON.parse(JSON.stringify(s)) as HomeState);
  };

  // Tab bar / scroll-spy / page-search chrome — shared with
  // useContentEditorPage via useSectionTabChrome (see that file for the
  // duplication this replaces); fixed section count since this page's
  // section list never grows/shrinks with the data (unlike Why Ulaa's
  // feature cards).
  const {
    activeSection, setSectionRef, tabBarRef, tabButtonRefs, showLeftFade, showRightFade,
    handleTabSelect, pageSearch, setPageSearch, pageSearchNoMatch, scrollBodyRef,
  } = useSectionTabChrome(loading, SECTION_TITLES.length);

  return {
    loading, saving, saved, hasUnsavedChanges, handleSave, discardChanges,
    draftOnHold: heldDraft !== null, restoreHeldDraft, discardHeldDraft,
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
  };
}

export { makeTempId };
