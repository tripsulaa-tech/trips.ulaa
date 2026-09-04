import { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Trash as Trash2,
  ImageSquare as ImagePlus,
  CircleNotch as Loader2,
  CaretUp as ChevronUp,
  CaretDown as ChevronDown,
  Eye,
  EyeSlash as EyeOff,
  Images,
} from '@phosphor-icons/react';
import AdminLayout from './AdminLayout';
import AdminEditorFooter from './AdminEditorFooter';
import ImageUploadField from '../components/ui/ImageUploadField';
import { getSiteContent, upsertSiteContent, uploadImage, deleteImageByUrl } from '../services/api';
import { DEFAULT_HOME_HERO, mergeWithDefaults } from '../constants/home-hero';
import { useConfirm } from '../components/ui/useConfirm';
import { collectStorageUrls } from '../utils/utils-index';
import type { HomeHeroContent, HomeHeroSlide } from '../types/types-index';
import { FORM_INPUT_CLASS as inputClass } from '../constants/formStyles';

const STORAGE_BUCKET = 'ulaa';

export default function AdminHomeHero() {
  const confirm = useConfirm();
  const [content, setContent] = useState<HomeHeroContent>(DEFAULT_HOME_HERO);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Same snapshot-diff approach as AdminAbout/AdminWhyULAA — lets Save
  // clean up any image the admin removed or replaced, and doubles as the
  // "hasUnsavedChanges" check for the navigate-away guard.
  const savedUrlsRef = useRef<Set<string>>(new Set());
  const savedContentRef = useRef<string>('');

  useEffect(() => {
    getSiteContent<Partial<HomeHeroContent>>('home_hero')
      .then(data => {
        const resolved = mergeWithDefaults(data);
        setContent(resolved);
        savedUrlsRef.current = collectStorageUrls(resolved, STORAGE_BUCKET);
        savedContentRef.current = JSON.stringify(resolved);
      })
      .catch(() => {
        setContent(DEFAULT_HOME_HERO);
        savedUrlsRef.current = collectStorageUrls(DEFAULT_HOME_HERO, STORAGE_BUCKET);
        savedContentRef.current = JSON.stringify(DEFAULT_HOME_HERO);
      })
      .finally(() => setLoading(false));
  }, []);

  const hasUnsavedChanges = () => JSON.stringify(content) !== savedContentRef.current;

  const handleAddPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    try {
      setUploading(true);
      // Prefill each new slide's headline with the current last slide's
      // text (or the global default if this is the very first photo) so
      // the admin isn't starting from a blank headline every time — they
      // can then tweak per-slide as needed.
      const template = content.slides[content.slides.length - 1] ?? DEFAULT_HOME_HERO;
      const newSlides: HomeHeroSlide[] = [];
      for (const file of files) {
        const path = `home-hero/${Date.now()}-${file.name}`;
        const url = await uploadImage(STORAGE_BUCKET, file, path);
        newSlides.push({
          id: crypto.randomUUID(),
          image: url,
          mobile_image: '',
          active: true,
          heading_line1: template.heading_line1,
          heading_highlight: template.heading_highlight,
          heading_line2: template.heading_line2,
          subheading: template.subheading,
        });
      }
      setContent(c => ({ ...c, slides: [...c.slides, ...newSlides] }));
    } catch {
      alert('Failed to upload one or more photos. Please try again.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const updateSlide = (id: string, patch: Partial<HomeHeroSlide>) => {
    setContent(c => ({ ...c, slides: c.slides.map(s => (s.id === id ? { ...s, ...patch } : s)) }));
  };

  const removeSlide = async (id: string) => {
    const slide = content.slides.find(s => s.id === id);
    setContent(c => ({ ...c, slides: c.slides.filter(s => s.id !== id) }));
    // Best-effort cleanup of the desktop image now — mirrors
    // MultiImageUploadField's removeAt. Mobile crops (if any) and anything
    // else no longer referenced are swept up on Save instead.
    if (slide?.image.includes(`/${STORAGE_BUCKET}/`)) {
      deleteImageByUrl(STORAGE_BUCKET, slide.image).catch(() => {});
    }
  };

  // Reordering — Move Up/Down rather than free-form drag, so it works the
  // same way with a mouse, touch, or keyboard (each button is a normal,
  // focusable control) without needing pointer-capture drag plumbing.
  const moveSlide = (id: string, direction: -1 | 1) => {
    setContent(c => {
      const arr = [...c.slides];
      const from = arr.findIndex(s => s.id === id);
      const to = from + direction;
      if (from === -1 || to < 0 || to >= arr.length) return c;
      [arr[from], arr[to]] = [arr[to], arr[from]];
      return { ...c, slides: arr };
    });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await upsertSiteContent('home_hero', content);
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

  const handleCancel = async () => {
    if (!hasUnsavedChanges()) return;
    const ok = await confirm({
      title: 'Discard changes?',
      message: 'This discards every unsaved edit below and reverts to the last saved version.',
      confirmLabel: 'Discard',
    });
    if (!ok) return;

    // Best-effort cleanup of anything uploaded since the last save (new
    // photos added, or a desktop/mobile image replaced) that's about to be
    // discarded, so it doesn't sit around as an orphan in storage.
    const unsavedUrls = collectStorageUrls(content, STORAGE_BUCKET);
    for (const url of unsavedUrls) {
      if (!savedUrlsRef.current.has(url)) deleteImageByUrl(STORAGE_BUCKET, url).catch(() => {});
    }

    setContent(JSON.parse(savedContentRef.current) as HomeHeroContent);
  };

  if (loading) {
    return (
      <AdminLayout title="Home Hero Banner">
        <div role="status" className="text-center py-16 text-dark-muted">Loading...</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Home Hero Banner"
      subtitle="Manage the rotating photo banner at the top of the home page — add photos, reorder them, and turn autoplay on or off."
      hasUnsavedChanges={hasUnsavedChanges}
    >
      <div className="max-w-4xl bg-white rounded-md shadow-warm-lg border border-background-warm max-h-[calc(100vh-160px)] overflow-hidden flex flex-col">
        <div className="app-scroll overflow-y-auto flex-1 min-h-0">
          <div className="p-6 space-y-8">

            {/* Carousel settings */}
            <div className="space-y-4">
              <h2 className="font-display text-lg font-bold text-dark pb-3 border-b border-background-warm">
                Carousel Settings
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="flex items-center gap-2 text-sm font-medium text-dark">
                  <input
                    type="checkbox"
                    checked={content.autoplay}
                    onChange={e => setContent(c => ({ ...c, autoplay: e.target.checked }))}
                    className="w-4 h-4 accent-primary"
                  />
                  Auto-rotate slides
                </label>
                <div>
                  <label htmlFor="home-hero-interval" className="block text-sm font-medium text-dark mb-1">Seconds between slides</label>
                  <input
                    id="home-hero-interval"
                    type="number"
                    min={2}
                    max={30}
                    value={content.interval_seconds}
                    onChange={e => setContent(c => ({ ...c, interval_seconds: Math.max(2, Number(e.target.value) || 6) }))}
                    disabled={!content.autoplay}
                    className={`${inputClass} disabled:opacity-50`}
                  />
                </div>
              </div>
              {content.slides.length === 0 && (
                <p className="text-xs text-dark-muted flex items-center gap-1.5 bg-background-warm/60 rounded-md px-3 py-2">
                  <Images size={14} className="flex-shrink-0" aria-hidden="true" />
                  No photos yet — the homepage will keep showing its original default hero image until you add some below.
                </p>
              )}
            </div>

            {/* Slides */}
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-background-warm flex-wrap">
                <h2 className="font-display text-lg font-bold text-dark">
                  Photos ({content.slides.length})
                </h2>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-1 text-xs font-medium text-primary border border-primary rounded-md px-2.5 py-1.5 hover:bg-primary/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <ImagePlus size={13} aria-hidden="true" />}
                  {uploading ? 'Uploading...' : 'Add Photos'}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleAddPhotos}
                  className="hidden"
                />
              </div>
              <p className="text-xs text-dark-muted -mt-2">
                Wide landscape, at least 1920×1080px. Slides play in the order below — use the arrows to reorder, and the eye icon to temporarily hide a photo without deleting it.
              </p>

              {content.slides.length === 0 ? (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="w-full flex flex-col items-center justify-center gap-2 py-12 rounded-lg border-2 border-dashed border-background-warm text-dark-muted hover:border-primary hover:text-primary transition-colors"
                >
                  <Plus size={22} aria-hidden="true" />
                  <span className="text-sm font-medium">Add your first banner photo</span>
                </button>
              ) : (
                <div className="space-y-3">
                  {content.slides.map((slide, i) => (
                    <div
                      key={slide.id}
                      className={`flex gap-3 p-3 rounded-lg border-2 transition-colors ${
                        slide.active ? 'border-background-warm bg-white' : 'border-background-warm bg-background-warm/50 opacity-60'
                      }`}
                    >
                      <div className="w-36 flex-shrink-0">
                        <ImageUploadField
                          label=""
                          value={slide.image}
                          onChange={url => updateSlide(slide.id, { image: url })}
                          bucket={STORAGE_BUCKET}
                          pathPrefix="home-hero"
                          aspectRatio="3/2"
                        />
                      </div>
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-dark">Slide {i + 1}</span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => moveSlide(slide.id, -1)}
                              disabled={i === 0}
                              title="Move up"
                              aria-label={`Move slide ${i + 1} up`}
                              className="p-1.5 rounded text-dark-muted hover:text-dark hover:bg-background-warm transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <ChevronUp size={15} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveSlide(slide.id, 1)}
                              disabled={i === content.slides.length - 1}
                              title="Move down"
                              aria-label={`Move slide ${i + 1} down`}
                              className="p-1.5 rounded text-dark-muted hover:text-dark hover:bg-background-warm transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <ChevronDown size={15} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => updateSlide(slide.id, { active: !slide.active })}
                              title={slide.active ? 'Hide from homepage' : 'Show on homepage'}
                              aria-label={slide.active ? `Hide slide ${i + 1} from homepage` : `Show slide ${i + 1} on homepage`}
                              aria-pressed={slide.active}
                              className="p-1.5 rounded text-dark-muted hover:text-dark hover:bg-background-warm transition-colors"
                            >
                              {slide.active ? <Eye size={15} aria-hidden="true" /> : <EyeOff size={15} aria-hidden="true" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => removeSlide(slide.id)}
                              title="Remove"
                              aria-label={`Remove slide ${i + 1}`}
                              className="p-1.5 rounded text-primary/70 hover:text-primary hover:bg-primary/5 transition-colors"
                            >
                              <Trash2 size={15} aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                        <details className="text-xs">
                          <summary className="cursor-pointer text-dark-muted hover:text-dark select-none">
                            Optional: different photo for phone screens
                          </summary>
                          <div className="mt-2">
                            <ImageUploadField
                              label="Mobile Image"
                              value={slide.mobile_image}
                              onChange={url => updateSlide(slide.id, { mobile_image: url })}
                              bucket={STORAGE_BUCKET}
                              pathPrefix="home-hero-mobile"
                              hint="Tall portrait, at least 1080×1350px. Falls back to the main photo if left empty."
                            />
                          </div>
                        </details>

                        {/* Headline text — its own copy per slide, shown
                            only while this photo is on screen. Split into
                            three parts so the middle word always keeps its
                            accent color + italic style, same as before. */}
                        <details className="text-xs" open>
                          <summary className="cursor-pointer text-dark-muted hover:text-dark select-none font-medium">
                            Headline text for this slide
                          </summary>
                          <div className="mt-2 space-y-2">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <div>
                                <label htmlFor={`home-hero-heading-1-${slide.id}`} className="block text-[11px] font-medium text-dark mb-1">Line 1</label>
                                <input
                                  id={`home-hero-heading-1-${slide.id}`}
                                  type="text"
                                  value={slide.heading_line1}
                                  onChange={e => updateSlide(slide.id, { heading_line1: e.target.value })}
                                  className="w-full px-2.5 py-1.5 rounded-md border-2 border-background-warm bg-background font-body text-dark text-xs focus:border-primary outline-none transition-colors"
                                />
                              </div>
                              <div>
                                <label htmlFor={`home-hero-heading-highlight-${slide.id}`} className="block text-[11px] font-medium text-dark mb-1">Highlighted word</label>
                                <input
                                  id={`home-hero-heading-highlight-${slide.id}`}
                                  type="text"
                                  value={slide.heading_highlight}
                                  onChange={e => updateSlide(slide.id, { heading_highlight: e.target.value })}
                                  className="w-full px-2.5 py-1.5 rounded-md border-2 border-background-warm bg-background font-body text-dark text-xs focus:border-primary outline-none transition-colors"
                                />
                              </div>
                              <div>
                                <label htmlFor={`home-hero-heading-2-${slide.id}`} className="block text-[11px] font-medium text-dark mb-1">Line 1 continued</label>
                                <input
                                  id={`home-hero-heading-2-${slide.id}`}
                                  type="text"
                                  value={slide.heading_line2}
                                  onChange={e => updateSlide(slide.id, { heading_line2: e.target.value })}
                                  className="w-full px-2.5 py-1.5 rounded-md border-2 border-background-warm bg-background font-body text-dark text-xs focus:border-primary outline-none transition-colors"
                                />
                              </div>
                            </div>
                            <div>
                              <label htmlFor={`home-hero-subheading-${slide.id}`} className="block text-[11px] font-medium text-dark mb-1">Supporting Text</label>
                              <p className="text-[11px] text-dark-muted leading-snug mb-1">Paragraph shown below the heading.</p>
                              <textarea
                                id={`home-hero-subheading-${slide.id}`}
                                rows={2}
                                value={slide.subheading}
                                onChange={e => updateSlide(slide.id, { subheading: e.target.value })}
                                className="w-full px-2.5 py-1.5 rounded-md border-2 border-background-warm bg-background font-body text-dark text-xs focus:border-primary outline-none transition-colors resize-none"
                              />
                            </div>
                            {/* Live preview — same classes as the actual
                                hero (see HeroSection.tsx) so what the admin
                                sees here is exactly what visitors will see
                                on this slide, including the accent-colored
                                italic highlight word. */}
                            <div className="rounded-lg bg-dark px-4 py-4">
                              <p className="font-display text-base sm:text-lg font-bold leading-[1.15] text-white mb-1.5">
                                {slide.heading_line1}
                                <br />
                                <span className="text-secondary italic">{slide.heading_highlight}</span> {slide.heading_line2}
                              </p>
                              <p className="text-[11px] text-white/85">{slide.subheading}</p>
                            </div>
                          </div>
                        </details>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          <AdminEditorFooter
            onSave={handleSave}
            saving={saving}
            saved={saved}
            onSecondaryAction={handleCancel}
            secondaryLabel="Cancel"
            responsiveFlex={false}
          />
        </div>
      </div>
    </AdminLayout>
  );
}
