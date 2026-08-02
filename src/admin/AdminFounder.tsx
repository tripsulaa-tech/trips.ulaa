import { useState, useEffect, useRef } from 'react';
import { Save, RotateCcw, Plus, Trash2 } from 'lucide-react';
import AdminLayout from './AdminLayout';
import Button from '../components/ui/Button';
import ImageUploadField from '../components/ui/ImageUploadField';
import { getSiteContent, upsertSiteContent, deleteImageByUrl } from '../services/api';
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
const cardClass = 'bg-white rounded-lg shadow-card p-6 space-y-4';
const labelClass = 'block text-sm font-medium text-dark mb-1';

export default function AdminFounder() {
  const confirm = useConfirm();
  const [content, setContent] = useState<FounderContent>(DEFAULT_FOUNDER);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
      <div className="space-y-6 max-w-4xl">
        <div className={cardClass}>
          <h2 className="font-display text-lg font-bold text-dark">Meet the Founder</h2>
          <p className="text-xs text-dark-muted -mt-2">
            This single source is shown on the About page, the Home page, and the Upcoming Trips page — edit it once here and it updates everywhere.
          </p>
          <ImageUploadField
            label="Founder Photo"
            value={content.photo}
            onChange={url => setFounder('photo', url)}
            bucket="ulaa"
            pathPrefix="about/founder"
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
                    placeholder="https://instagram.com/…"
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
