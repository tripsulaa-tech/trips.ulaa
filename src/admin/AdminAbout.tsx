import { useState, useEffect } from 'react';
import { Save, RotateCcw } from 'lucide-react';
import AdminLayout from './AdminLayout';
import Button from '../components/ui/Button';
import TimelineEditor from '../components/ui/TimelineEditor';
import ValuesEditor from '../components/ui/ValuesEditor';
import { getSiteContent, upsertSiteContent } from '../services/api';
import { DEFAULT_ABOUT, ABOUT_VALUE_ICONS } from '../constants/about';
import type { AboutContent } from '../types';

const inputClass = 'w-full px-3 py-2 rounded-xl border-2 border-background-warm bg-background font-body text-dark text-sm focus:border-primary outline-none transition-colors';
const cardClass = 'bg-white rounded-2xl shadow-card p-6 space-y-4';
const iconOptions = Object.keys(ABOUT_VALUE_ICONS);

export default function AdminAbout() {
  const [content, setContent] = useState<AboutContent>(DEFAULT_ABOUT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSiteContent<AboutContent>('about')
      .then(data => setContent(data || DEFAULT_ABOUT))
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

  const resetToDefault = () => {
    if (!confirm('Reset all About page content to the original defaults? This will overwrite your edits below (not saved until you click Save).')) return;
    setContent(DEFAULT_ABOUT);
  };

  if (loading) {
    return (
      <AdminLayout title="About Page">
        <div className="text-center py-16 text-dark-muted">Loading...</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="About Page" subtitle="Edit the copy shown on the public About page.">
      <div className="space-y-6 max-w-4xl">
        {/* Hero */}
        <div className={cardClass}>
          <h2 className="font-display text-lg font-bold text-dark">Hero</h2>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Label</label>
            <input value={content.hero.label} onChange={e => setContent(c => ({ ...c, hero: { ...c.hero, label: e.target.value } }))} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Title</label>
            <input value={content.hero.title} onChange={e => setContent(c => ({ ...c, hero: { ...c.hero, title: e.target.value } }))} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Subtitle</label>
            <textarea value={content.hero.subtitle} onChange={e => setContent(c => ({ ...c, hero: { ...c.hero, subtitle: e.target.value } }))} rows={2} className={`${inputClass} resize-none`} />
          </div>
        </div>

        {/* Mission */}
        <div className={cardClass}>
          <h2 className="font-display text-lg font-bold text-dark">Our Mission</h2>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Label</label>
            <input value={content.mission.label} onChange={e => setContent(c => ({ ...c, mission: { ...c.mission, label: e.target.value } }))} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Heading</label>
            <input value={content.mission.title} onChange={e => setContent(c => ({ ...c, mission: { ...c.mission, title: e.target.value } }))} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Body</label>
            <textarea value={content.mission.text} onChange={e => setContent(c => ({ ...c, mission: { ...c.mission, text: e.target.value } }))} rows={3} className={`${inputClass} resize-none`} />
          </div>
        </div>

        {/* Vision */}
        <div className={cardClass}>
          <h2 className="font-display text-lg font-bold text-dark">Our Vision</h2>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Label</label>
            <input value={content.vision.label} onChange={e => setContent(c => ({ ...c, vision: { ...c.vision, label: e.target.value } }))} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Heading</label>
            <input value={content.vision.title} onChange={e => setContent(c => ({ ...c, vision: { ...c.vision, title: e.target.value } }))} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Body</label>
            <textarea value={content.vision.text} onChange={e => setContent(c => ({ ...c, vision: { ...c.vision, text: e.target.value } }))} rows={3} className={`${inputClass} resize-none`} />
          </div>
        </div>

        {/* Philosophy */}
        <div className={cardClass}>
          <h2 className="font-display text-lg font-bold text-dark">Travel Philosophy</h2>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Label</label>
            <input value={content.philosophy.label} onChange={e => setContent(c => ({ ...c, philosophy: { ...c.philosophy, label: e.target.value } }))} className={inputClass} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-dark mb-1">Quote — line 1</label>
              <input value={content.philosophy.quote_line1} onChange={e => setContent(c => ({ ...c, philosophy: { ...c.philosophy, quote_line1: e.target.value } }))} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark mb-1">Quote — line 2 (highlighted)</label>
              <input value={content.philosophy.quote_line2} onChange={e => setContent(c => ({ ...c, philosophy: { ...c.philosophy, quote_line2: e.target.value } }))} className={inputClass} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Body</label>
            <textarea value={content.philosophy.text} onChange={e => setContent(c => ({ ...c, philosophy: { ...c.philosophy, text: e.target.value } }))} rows={3} className={`${inputClass} resize-none`} />
          </div>
        </div>

        {/* Values */}
        <div className={cardClass}>
          <ValuesEditor
            value={content.values}
            onChange={values => setContent(c => ({ ...c, values }))}
            iconOptions={iconOptions}
          />
        </div>

        {/* Timeline */}
        <div className={cardClass}>
          <TimelineEditor
            value={content.timeline}
            onChange={timeline => setContent(c => ({ ...c, timeline }))}
          />
        </div>

        {/* Actions — floats above the form while scrolling, with a solid backdrop so it doesn't bleed into the fields behind it */}
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
