import { useState, useEffect, useRef } from 'react';

import AdminLayout from './AdminLayout';
import Button from '../components/ui/Button';
import ImageUploadField from '../components/ui/ImageUploadField';
import { getSiteContent, upsertSiteContent, deleteImageByUrl } from '../services/api';
import { DEFAULT_WHY_ULAA } from '../constants/why-ulaa';
import { useConfirm } from '../components/ui/useConfirm';
import { collectStorageUrls } from '../utils/utils-index';
import type { WhyUlaaContent } from '../types/types-index';

const inputClass = 'w-full px-3 py-2 rounded-md border-2 border-background-warm bg-background font-body text-dark text-sm focus:border-primary outline-none transition-colors';
const cardClass = 'bg-white rounded-lg shadow-card p-6 space-y-4';

export default function AdminWhyULAA() {
  const confirm = useConfirm();
  const [content, setContent] = useState<WhyUlaaContent>(DEFAULT_WHY_ULAA);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const STORAGE_BUCKET = 'ulaa';
  // Same snapshot-diff approach as AdminAbout — see the comment there for
  // why this exists (page-level Save with no modal-close hook to catch
  // orphaned uploads, so this doubles as the navigate-away guard too).
  const savedUrlsRef = useRef<Set<string>>(new Set());
  const savedContentRef = useRef<string>('');

  useEffect(() => {
    getSiteContent<WhyUlaaContent>('why_ulaa')
      .then(data => {
        const resolved = data || DEFAULT_WHY_ULAA;
        setContent(resolved);
        savedUrlsRef.current = collectStorageUrls(resolved, STORAGE_BUCKET);
        savedContentRef.current = JSON.stringify(resolved);
      })
      .catch(() => {
        setContent(DEFAULT_WHY_ULAA);
        savedUrlsRef.current = collectStorageUrls(DEFAULT_WHY_ULAA, STORAGE_BUCKET);
        savedContentRef.current = JSON.stringify(DEFAULT_WHY_ULAA);
      })
      .finally(() => setLoading(false));
  }, []);

  const hasUnsavedChanges = () => JSON.stringify(content) !== savedContentRef.current;

  const updateFeature = (index: number, patch: Partial<WhyUlaaContent['features'][number]>) => {
    setContent(c => ({
      ...c,
      features: c.features.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    }));
  };

  const setField = (key: 'sub_heading' | 'heading' | 'subheading', value: string) => {
    setContent(c => ({ ...c, [key]: value }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await upsertSiteContent('why_ulaa', content);
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
      message: 'This will overwrite your edits below (not saved until you click Save).',
      confirmLabel: 'Reset',
    });
    if (!ok) return;
    setContent(DEFAULT_WHY_ULAA);
  };

  if (loading) {
    return (
      <AdminLayout title="Why ULAA">
        <div className="text-center py-16 text-dark-muted">Loading...</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Why ULAA" subtitle='Edit the 6 image cards shown in the "Travel differently." section on the home page.' hasUnsavedChanges={hasUnsavedChanges}>
      <div className="space-y-6 max-w-4xl">
        <div className={cardClass}>
          <h2 className="font-display text-lg font-bold text-dark">Section Text</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-dark mb-1">Sub Heading</label>
              <input
                value={content.sub_heading}
                onChange={e => setField('sub_heading', e.target.value)}
                className={inputClass}
                placeholder="Why Choose Us"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark mb-1">Section Heading</label>
              <input
                value={content.heading}
                onChange={e => setField('heading', e.target.value)}
                className={inputClass}
                placeholder="Travel differently."
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-dark mb-1">Subheading</label>
              <textarea
                value={content.subheading}
                onChange={e => setField('subheading', e.target.value)}
                rows={2}
                className={`${inputClass} resize-none`}
              />
            </div>
          </div>
        </div>

        {content.features.map((feature, index) => (
          <div key={index} className={cardClass}>
            <h2 className="font-display text-lg font-bold text-dark">Card {index + 1}</h2>
            <ImageUploadField
              label="Image"
              value={feature.image}
              onChange={url => updateFeature(index, { image: url })}
              bucket="ulaa"
              pathPrefix="why-ulaa"
              required
              hint="4:3 landscape, at least 800×600px — shown in a cropped card."
            />
            <div>
              <label className="block text-sm font-medium text-dark mb-1">Title</label>
              <input
                value={feature.title}
                onChange={e => updateFeature(index, { title: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark mb-1">Description</label>
              <textarea
                value={feature.description}
                onChange={e => updateFeature(index, { description: e.target.value })}
                rows={2}
                className={`${inputClass} resize-none`}
              />
            </div>
          </div>
        ))}

        {/* Actions — sticky above the form while scrolling */}
        <div className="sticky bottom-4 z-20 flex items-center gap-3 bg-white rounded-lg shadow-warm-lg border border-background-warm px-5 py-4">
          <Button variant="primary" size="md" className="sm:flex-1" onClick={handleSave} loading={saving}>
            Save
          </Button>
          <Button variant="outline" size="md" className="sm:flex-1" onClick={resetToDefault}>
            Reset to Default
          </Button>
          {saved && <span className="text-sm text-green-600 font-medium">Saved!</span>}
        </div>
      </div>
    </AdminLayout>
  );
}