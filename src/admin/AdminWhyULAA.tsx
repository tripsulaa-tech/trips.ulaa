import { useState, useEffect } from 'react';
import { Save, RotateCcw } from 'lucide-react';
import AdminLayout from './AdminLayout';
import Button from '../components/ui/Button';
import ImageUploadField from '../components/ui/ImageUploadField';
import { getSiteContent, upsertSiteContent } from '../services/api';
import { DEFAULT_WHY_ULAA } from '../constants/why-ulaa';
import { useConfirm } from '../components/ui/ConfirmDialog';
import type { WhyUlaaContent } from '../types';

const inputClass = 'w-full px-3 py-2 rounded-xl border-2 border-background-warm bg-background font-body text-dark text-sm focus:border-primary outline-none transition-colors';
const cardClass = 'bg-white rounded-2xl shadow-card p-6 space-y-4';

export default function AdminWhyULAA() {
  const confirm = useConfirm();
  const [content, setContent] = useState<WhyUlaaContent>(DEFAULT_WHY_ULAA);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSiteContent<WhyUlaaContent>('why_ulaa')
      .then(data => setContent(data || DEFAULT_WHY_ULAA))
      .catch(() => setContent(DEFAULT_WHY_ULAA))
      .finally(() => setLoading(false));
  }, []);

  const updateFeature = (index: number, patch: Partial<WhyUlaaContent['features'][number]>) => {
    setContent(c => ({
      features: c.features.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await upsertSiteContent('why_ulaa', content);
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
    <AdminLayout title="Why ULAA" subtitle='Edit the 6 image cards shown in the "Travel differently." section on the home page.'>
      <div className="space-y-6 max-w-4xl">
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
        <div className="sticky bottom-4 z-20 flex items-center gap-3 bg-white rounded-2xl shadow-warm-lg border border-background-warm px-5 py-4">
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