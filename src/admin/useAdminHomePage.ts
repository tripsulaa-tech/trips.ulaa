import { useState, useEffect, useRef } from 'react';
import {
  getSiteContent, upsertSiteContent, deleteImageByUrl, getStoragePathFromUrl, deleteImage,
  getGalleryImages, addGalleryImage, deleteGalleryImage, updateGalleryFeatured, updateGalleryOrder,
  getAllTestimonialsAdmin, createTestimonial, updateTestimonial, deleteTestimonial,
} from '../services/api';
import { collectStorageUrls } from '../utils/utils-index';
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

const STORAGE_BUCKET = 'ulaa';

// The public homepage's real section order (see src/pages/HomePage.tsx) —
// Upcoming Trips and Completed Trips are skipped here since those are
// auto-pulled from the Trips/Albums tables, not editable content. Bottom
// Nav Bar and Button Naming are tacked on at the end — neither is a
// homepage section (Bottom Nav Bar is mobile-only chrome, Button Naming
// drives the trip-page CTA buttons), but both are folded in here per the
// same "one place to edit everything" direction as the rest of this page.
export const SECTION_TITLES = [
  'Hero Banner',
  'Why ULAA',
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
export interface UseAdminHomePageResult {
  loading: boolean;
  saving: boolean;
  saved: boolean;
  hasUnsavedChanges: () => boolean;
  handleSave: () => Promise<void>;
  discardChanges: () => void;

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
  // grows/shrinks with the data (unlike Why ULAA's feature cards).
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

function makeTempId() {
  return `new-${crypto.randomUUID()}`;
}

export function useAdminHomePage(): UseAdminHomePageResult {
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
  const savedStateRef = useRef<{
    hero: HomeHeroContent; why: WhyUlaaContent; founder: FounderContent; cta: CtaBannerContent;
    testimonialsSection: TestimonialsSectionContent; gallery: GalleryImage[]; items: Testimonial[];
    bottomNav: BottomNavItemConfig[]; buttonLabels: ButtonLabelsConfig;
  } | null>(null);

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

  useEffect(() => {
    Promise.all([
      getSiteContent<Partial<HomeHeroContent>>('home_hero'),
      getSiteContent<Partial<WhyUlaaContent>>('why_ulaa'),
      getSiteContent<Partial<FounderContent>>('founder'),
      getSiteContent<Partial<CtaBannerContent>>('cta_banner'),
      getSiteContent<Partial<TestimonialsSectionContent>>('testimonials_section'),
      getSiteContent<BottomNavItemConfig[]>('bottom_nav'),
      getSiteContent<Partial<ButtonLabelsConfig>>('button_labels'),
      getGalleryImages(),
      getAllTestimonialsAdmin(),
    ]).then(([heroData, whyData, founderData, ctaData, testimonialsSectionData, bottomNavData, buttonLabelsData, gallery, items]) => {
      const hero = mergeHero(heroData);
      const why = (whyData as WhyUlaaContent | null) || DEFAULT_WHY_ULAA;
      const founder = mergeFounderWithDefaults(founderData);
      const cta = mergeCta(ctaData);
      const testimonialsSection = { ...DEFAULT_TESTIMONIALS_SECTION, ...testimonialsSectionData };
      const bottomNav = bottomNavData && bottomNavData.length > 0 ? bottomNavData : DEFAULT_BOTTOM_NAV_ITEMS;
      const buttonLabels = buttonLabelsData?.primaryCta ? (buttonLabelsData as ButtonLabelsConfig) : DEFAULT_BUTTON_LABELS;

      setHeroContent(hero);
      setWhyContent(why);
      setFounderContent(founder);
      setCtaContent(cta);
      setTestimonialsSectionContent(testimonialsSection);
      setGalleryImages(gallery);
      setTestimonials(items);
      setBottomNavItems(bottomNav);
      setButtonLabels(buttonLabels);

      originalGalleryRef.current = gallery;
      originalTestimonialsRef.current = items;
      savedUrlsRef.current = new Set([
        ...collectStorageUrls(hero, STORAGE_BUCKET),
        ...collectStorageUrls(why, STORAGE_BUCKET),
        ...collectStorageUrls(founder, STORAGE_BUCKET),
        ...collectStorageUrls(cta, STORAGE_BUCKET),
      ]);
      savedContentRef.current = snapshot(hero, why, founder, cta, testimonialsSection, gallery, items, bottomNav, buttonLabels);
      savedStateRef.current = { hero, why, founder, cta, testimonialsSection, gallery, items, bottomNav, buttonLabels };
    }).catch(() => {
      // Leave the defaults in place — same fallback behavior as every
      // single-page content editor this replaces.
    }).finally(() => setLoading(false));
    // Runs once on mount only, like every content-editor page this replaces.
  }, []);

  const hasUnsavedChanges = () =>
    snapshot(heroContent, whyContent, founderContent, ctaContent, testimonialsSectionContent, galleryImages, testimonials, bottomNavItems, buttonLabels) !== savedContentRef.current;

  const handleSave = async () => {
    if (!buttonLabels.primaryCta.trim() || !buttonLabels.waitlistCta.trim()) {
      alert('Both button names (in Button Naming) are required.');
      return;
    }
    try {
      setSaving(true);

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
  // gallery/testimonials lists too). Any image uploaded to storage since
  // the last save but never committed is simply left as a harmless orphan,
  // same trade-off the rest of this codebase already accepts (see e.g.
  // HeroBannerSection's cancel path).
  const discardChanges = () => {
    const s = savedStateRef.current;
    if (!s) return;
    const clone = JSON.parse(JSON.stringify(s)) as typeof s;
    setHeroContent(clone.hero);
    setWhyContent(clone.why);
    setFounderContent(clone.founder);
    setCtaContent(clone.cta);
    setTestimonialsSectionContent(clone.testimonialsSection);
    setGalleryImages(clone.gallery);
    setTestimonials(clone.items);
    setBottomNavItems(clone.bottomNav);
    setButtonLabels(clone.buttonLabels);
  };

  // ── Tab bar / scroll-spy chrome — identical approach to
  // useContentEditorPage, just with a fixed section count. ──────────────
  const [activeSection, setActiveSection] = useState(0);
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const tabBarRef = useRef<HTMLDivElement>(null);
  const tabButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const lastActiveRef = useRef(0);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);
  const suppressObserverRef = useRef(false);
  const suppressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressScrollListenerRef = useRef<(() => void) | null>(null);

  const [pageSearch, setPageSearch] = useState('');
  const [pageSearchNoMatch, setPageSearchNoMatch] = useState(false);
  const scrollBodyRef = useRef<HTMLDivElement>(null);

  const stickyOffset = () => {
    const bar = scrollBodyRef.current?.querySelector<HTMLElement>('[data-sticky-toolbar]');
    return bar ? bar.getBoundingClientRect().height : 0;
  };

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
    const containerRect = container.getBoundingClientRect();
    const matchRect = match.getBoundingClientRect();
    const offset = stickyOffset();
    const visibleHeight = container.clientHeight - offset;
    const centerOffset = offset + visibleHeight / 2 - match.clientHeight / 2;
    const top = container.scrollTop + (matchRect.top - containerRect.top) - centerOffset;
    container.scrollTo({ top, behavior: 'smooth' });
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

  const scrollTabIntoView = (i: number) => {
    const bar = tabBarRef.current;
    const btn = tabButtonRefs.current[i];
    if (!bar || !btn) return;
    const target = btn.offsetLeft - bar.clientWidth / 2 + btn.clientWidth / 2;
    bar.scrollTo({ left: target, behavior: 'smooth' });
  };

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

  const SECTION_SCROLL_GAP = 20;

  const scrollSectionIntoView = (i: number) => {
    const container = scrollBodyRef.current;
    const target = sectionRefs.current[i];
    if (!container || !target) return;
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const top = container.scrollTop + (targetRect.top - containerRect.top) - stickyOffset() - SECTION_SCROLL_GAP;
    container.scrollTo({ top, behavior: 'smooth' });
  };

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
    scrollSectionIntoView(i);
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

  const setSectionRef = (index: number, el: HTMLDivElement | null) => {
    sectionRefs.current[index] = el;
  };

  return {
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
  };
}

export { makeTempId };
