import { useState, useEffect } from 'react';
import { Save, RotateCcw, Plus, Trash2, GripVertical } from 'lucide-react';
import AdminLayout from './AdminLayout';
import Button from '../components/ui/Button';
import ImageUploadField from '../components/ui/ImageUploadField';
import MultiImageUploadField from '../components/ui/MultiImageUploadField';
import TripHighlightIconPicker from '../components/ui/TripHighlightIconPicker';
import { getSiteContent, upsertSiteContent } from '../services/api';
import { DEFAULT_ABOUT, mergeWithDefaults } from '../constants/about';
import { useConfirm } from '../components/ui/ConfirmDialog';
import type {
  AboutContent,
  AboutHaveYouEverItem,
  AboutWelcomeItem,
  AboutWhyDifferentCard,
  AboutJourneyStep,
  AboutFounderSocialLink,
} from '../types/types-index';

// Data fetched from the DB is merged with DEFAULT_ABOUT (see
// mergeWithDefaults in constants/about.ts) so that any section or field
// missing from a partially-saved record (e.g. an older row that predates a
// newly added section) safely falls back to its default instead of being
// `undefined` and crashing the form (e.g. `content.our_story.heading`).

const inputClass =
  'w-full px-3 py-2 rounded-md border-2 border-background-warm bg-background font-body text-dark text-sm focus:border-primary outline-none transition-colors';
const cardClass = 'bg-white rounded-lg shadow-card p-6 space-y-4';
const labelClass = 'block text-sm font-medium text-dark mb-1';

export default function AdminAbout() {
  const confirm = useConfirm();
  const [content, setContent] = useState<AboutContent>(DEFAULT_ABOUT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSiteContent<Partial<AboutContent>>('about')
      .then(data => setContent(mergeWithDefaults(data)))
      .catch(() => setContent(DEFAULT_ABOUT))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      await upsertSiteContent('about', content);
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

  const setHYE = (field: string, value: unknown) =>
    setContent(p => ({ ...p, have_you_ever: { ...p.have_you_ever, [field]: value } }));

  const setWTU = (field: string, value: unknown) =>
    setContent(p => ({ ...p, welcome_to_ulaa: { ...p.welcome_to_ulaa, [field]: value } }));

  const setWHY = (field: string, value: unknown) =>
    setContent(p => ({ ...p, why_different: { ...p.why_different, [field]: value } }));

  const setCommunity = (field: string, value: unknown) =>
    setContent(p => ({ ...p, community: { ...p.community, [field]: value } }));

  const setJourney = (field: string, value: unknown) =>
    setContent(p => ({ ...p, journey: { ...p.journey, [field]: value } }));

  const setFounder = (field: keyof AboutContent['founder'], value: unknown) =>
    setContent(p => ({ ...p, founder: { ...p.founder, [field]: value } }));

  // ── have_you_ever items ────────────────────────────────────────────────────

  const updateHYEItem = (i: number, field: keyof AboutHaveYouEverItem, value: string) => {
    const items: AboutHaveYouEverItem[] = content.have_you_ever.items.map(
      (item: AboutHaveYouEverItem, idx: number) => (idx === i ? { ...item, [field]: value } : item),
    );
    setHYE('items', items);
  };
  const addHYEItem = () => {
    if (content.have_you_ever.items.length >= 8) return;
    setHYE('items', [...content.have_you_ever.items, { text: '', icon: '' }]);
  };
  const removeHYEItem = (i: number) => {
    if (content.have_you_ever.items.length <= 1) return;
    setHYE('items', content.have_you_ever.items.filter((_: unknown, idx: number) => idx !== i));
  };

  // ── welcome_to_ulaa items ──────────────────────────────────────────────────

  const updateWTUItem = (i: number, field: keyof AboutWelcomeItem, value: string) => {
    const items: AboutWelcomeItem[] = content.welcome_to_ulaa.items.map(
      (item: AboutWelcomeItem, idx: number) => (idx === i ? { ...item, [field]: value } : item),
    );
    setWTU('items', items);
  };
  const addWTUItem = () => {
    if (content.welcome_to_ulaa.items.length >= 8) return;
    setWTU('items', [...content.welcome_to_ulaa.items, { icon: '', title: '', description: '' }]);
  };
  const removeWTUItem = (i: number) => {
    if (content.welcome_to_ulaa.items.length <= 1) return;
    setWTU('items', content.welcome_to_ulaa.items.filter((_: unknown, idx: number) => idx !== i));
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
    setJourney('steps', [...content.journey.steps, { heading: '', description: '' }]);
  };
  const removeStep = (i: number) => {
    if (content.journey.steps.length <= 1) return;
    setJourney('steps', content.journey.steps.filter((_: unknown, idx: number) => idx !== i));
  };

  // ── founder social links ───────────────────────────────────────────────────

  const updateSocial = (i: number, field: keyof AboutFounderSocialLink, value: string) => {
    const links: AboutFounderSocialLink[] = content.founder.social_links.map(
      (l: AboutFounderSocialLink, idx: number) => (idx === i ? { ...l, [field]: value } : l),
    );
    setFounder('social_links', links);
  };
  const addSocial = () =>
    setFounder('social_links', [...content.founder.social_links, { platform: '', url: '' }]);
  const removeSocial = (i: number) =>
    setFounder(
      'social_links',
      content.founder.social_links.filter((_: unknown, idx: number) => idx !== i),
    );

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <AdminLayout title="About Page" subtitle="Manage every section of the public About Us page.">
      <div className="space-y-6 max-w-4xl">

        {/* ── 1. Hero Banner ──────────────────────────────────────────────── */}
        <div className={cardClass}>
          <h2 className="font-display text-lg font-bold text-dark">1 · Hero Banner</h2>
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

        {/* ── 2. Our Story ────────────────────────────────────────────────── */}
        <div className={cardClass}>
          <h2 className="font-display text-lg font-bold text-dark">2 · Our Story</h2>
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

        {/* ── 3. Have You Ever... ──────────────────────────────────────────── */}
        <div className={cardClass}>
          <h2 className="font-display text-lg font-bold text-dark">3 · Have You Ever…</h2>
          <div>
            <label className={labelClass}>Section Heading</label>
            <textarea
              value={content.have_you_ever.heading}
              onChange={e => setHYE('heading', e.target.value)}
              rows={2}
              className={`${inputClass} resize-none`}
            />
          </div>
          <div className="space-y-2">
            <label className={labelClass}>Items</label>
            <p className="text-xs text-dark-muted -mt-1">
              Pick an icon for each item, or leave it unset to use the default rotation.
            </p>
            {content.have_you_ever.items.map((item: AboutHaveYouEverItem, i: number) => (
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
            {content.have_you_ever.items.length < 8 && (
              <Button variant="outline" size="sm" onClick={addHYEItem}>
                <Plus size={14} /> Add Item
              </Button>
            )}
          </div>
        </div>

        {/* ── 4. Welcome to ULAA ──────────────────────────────────────────── */}
        <div className={cardClass}>
          <h2 className="font-display text-lg font-bold text-dark">4 · Welcome to ULAA</h2>
          <div>
            <label className={labelClass}>Section Heading</label>
            <textarea
              value={content.welcome_to_ulaa.heading}
              onChange={e => setWTU('heading', e.target.value)}
              rows={2}
              className={`${inputClass} resize-none`}
            />
          </div>
          <div className="space-y-2">
            <label className={labelClass}>Feature Items</label>
            <p className="text-xs text-dark-muted -mt-1">
              Pick an icon for each item, or leave it unset to use the default rotation.
            </p>
            {content.welcome_to_ulaa.items.map((item: AboutWelcomeItem, i: number) => (
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
            {content.welcome_to_ulaa.items.length < 8 && (
              <Button variant="outline" size="sm" onClick={addWTUItem}>
                <Plus size={14} /> Add Item
              </Button>
            )}
          </div>
        </div>

        {/* ── 5. Why ULAA is Different ─────────────────────────────────────── */}
        <div className={cardClass}>
          <h2 className="font-display text-lg font-bold text-dark">5 · Why ULAA is Different</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Section Heading</label>
              <textarea
                value={content.why_different.heading}
                onChange={e => setWHY('heading', e.target.value)}
                rows={2}
                className={`${inputClass} resize-none`}
              />
            </div>
            <div>
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
              <span className="text-xs text-dark-muted">{content.why_different.cards.length} / 6</span>
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
            {content.why_different.cards.length < 6 && (
              <Button variant="outline" size="sm" onClick={addWhyCard}>
                <Plus size={14} /> Add Card
              </Button>
            )}
          </div>
        </div>

        {/* ── 6. Our Community ─────────────────────────────────────────────── */}
        <div className={cardClass}>
          <h2 className="font-display text-lg font-bold text-dark">6 · Our Community</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Section Heading</label>
              <textarea
                value={content.community.heading}
                onChange={e => setCommunity('heading', e.target.value)}
                rows={2}
                className={`${inputClass} resize-none`}
              />
            </div>
            <div>
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

        {/* ── 7. Your ULAA Journey ─────────────────────────────────────────── */}
        <div className={cardClass}>
          <h2 className="font-display text-lg font-bold text-dark">7 · Your ULAA Journey</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Section Heading</label>
              <textarea
                value={content.journey.heading}
                onChange={e => setJourney('heading', e.target.value)}
                rows={2}
                className={`${inputClass} resize-none`}
              />
            </div>
            <div>
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
            <label className={labelClass}>Journey Steps</label>
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
            {content.journey.steps.length < 10 && (
              <Button variant="outline" size="sm" onClick={addStep}>
                <Plus size={14} /> Add Step
              </Button>
            )}
          </div>
        </div>

        {/* ── 8. Meet the Founder ──────────────────────────────────────────── */}
        <div className={cardClass}>
          <h2 className="font-display text-lg font-bold text-dark">8 · Meet the Founder</h2>
          <ImageUploadField
            label="Founder Photo"
            value={content.founder.photo}
            onChange={url => setFounder('photo', url)}
            bucket="ulaa"
            pathPrefix="about/founder"
            hint="Square, at least 600×600px, with the face centered — shown as a large circular photo."
            allowUrl
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Name</label>
              <input
                value={content.founder.name}
                onChange={e => setFounder('name', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Designation</label>
              <input
                value={content.founder.designation}
                onChange={e => setFounder('designation', e.target.value)}
                className={inputClass}
                placeholder="Founder & CEO, ULAA"
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>About / Description</label>
            <textarea
              value={content.founder.description}
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
            {content.founder.social_links.map((link: AboutFounderSocialLink, i: number) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={link.platform}
                  onChange={e => updateSocial(i, 'platform', e.target.value)}
                  className={`${inputClass} w-36 flex-shrink-0`}
                  placeholder="Instagram"
                />
                <input
                  value={link.url}
                  onChange={e => updateSocial(i, 'url', e.target.value)}
                  className={`${inputClass} flex-1`}
                  placeholder="https://instagram.com/…"
                />
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

        {/* ── Sticky Save Bar ───────────────────────────────────────────────── */}
        <div className="sticky bottom-4 z-20 flex items-center gap-3 bg-white rounded-lg shadow-warm-lg border border-background-warm px-5 py-4">
          <Button variant="primary" size="md" onClick={handleSave} loading={saving}>
            <Save size={16} /> Save Changes
          </Button>
          <Button variant="outline" size="md" onClick={resetToDefault}>
            <RotateCcw size={16} /> Reset to Default
          </Button>
          {saved && <span className="text-sm text-green-600 font-medium">Saved!</span>}
        </div>
      </div>
    </AdminLayout>
  );
}

