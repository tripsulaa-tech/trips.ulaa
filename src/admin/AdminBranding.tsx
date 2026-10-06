import { useEffect, useRef, useState } from 'react';
import { Upload, ArrowCounterClockwise, Warning } from '@phosphor-icons/react';
import AdminLayout from './AdminLayout';
import AdminEditorFooter from './AdminEditorFooter';
import DraftConflictNotice from './DraftConflictNotice';
import { lookupDraft, stableStringify, useDraftKeeper, discardDraft } from '../hooks/useSessionDraft';
import { getSiteContent, upsertSiteContent, uploadImage, deleteImageByUrl } from '../services/api';
import {
  BRANDING_KEY,
  BRANDING_DEFAULTS,
  EMPTY_BRANDING,
  applyBranding,
  normalizeBranding,
  type BrandingContent,
  type BrandingSlot,
} from '../hooks/useBranding';

// Admin → Branding: upload/replace the site's logos and icons. Each slot is
// stored in the `branding` site_content row (see hooks/useBranding.ts);
// leaving a slot empty falls back to the file bundled in /public.

const BUCKET = 'ulaa';
const DRAFT_KEY = 'branding';
const MAX_BYTES = 2 * 1024 * 1024; // 2MB — logos/icons never need more
const ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,image/vnd.microsoft.icon,.ico';

interface SlotConfig {
  slot: BrandingSlot;
  label: string;
  group: 'public' | 'admin';
  description: string;
  hint: string;
  /** Background the preview sits on, so a light logo isn't invisible. */
  preview: 'checker' | 'dark';
  previewClass: string;
}

const SLOTS: SlotConfig[] = [
  {
    slot: 'header_logo',
    label: 'Header Logo',
    group: 'public',
    description: 'Shown at the top-left of every public page.',
    hint: 'Transparent PNG, SVG or WebP. Wide logos work best (about 800×450px or larger).',
    preview: 'checker',
    previewClass: 'h-20',
  },
  {
    slot: 'footer_logo',
    label: 'Footer Logo',
    group: 'public',
    description: 'Shown in the footer, on a dark background — use a light/cream version of the logo.',
    hint: 'Transparent PNG, SVG or WebP.',
    preview: 'dark',
    previewClass: 'h-20',
  },
  {
    slot: 'favicon',
    label: 'Favicon (Browser Tab Icon)',
    group: 'public',
    description: 'The small icon in the browser tab and bookmarks.',
    hint: 'Square PNG or SVG, at least 64×64px. Browsers cache favicons, so visitors may need a refresh or a day to see a change.',
    preview: 'checker',
    previewClass: 'h-12 w-12',
  },
  {
    slot: 'app_icon',
    label: 'Install Prompt Icon',
    group: 'public',
    description: 'The icon inside the "Install the Ulaa app" popup on the public site.',
    hint: 'Square PNG, at least 192×192px. This does not change the icon on a phone\'s home screen — see the note below.',
    preview: 'checker',
    previewClass: 'h-16 w-16',
  },
  {
    slot: 'admin_logo',
    label: 'Admin Logo',
    group: 'admin',
    description: 'Shown at the top of the admin sidebar and on the admin sign-in page.',
    hint: 'Transparent PNG, SVG or WebP.',
    preview: 'checker',
    previewClass: 'h-24',
  },
  {
    slot: 'admin_icon',
    label: 'Admin Sidebar Icon',
    group: 'admin',
    description: 'Shown in place of the logo when the admin sidebar is collapsed.',
    hint: 'Square PNG or SVG, at least 64×64px.',
    preview: 'checker',
    previewClass: 'h-12 w-12',
  },
];

const CHECKER =
  'bg-[length:16px_16px] bg-[linear-gradient(45deg,#e9e4dc_25%,transparent_25%,transparent_75%,#e9e4dc_75%),linear-gradient(45deg,#e9e4dc_25%,#fff_25%,#fff_75%,#e9e4dc_75%)] [background-position:0_0,8px_8px]';

function isStorageUrl(url: string) {
  return !!url && url.includes(`/${BUCKET}/branding/`);
}

function BrandAssetField({
  config,
  value,
  onChange,
  onUploaded,
}: {
  config: SlotConfig;
  value: string;
  onChange: (url: string) => void;
  onUploaded: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputId = `branding-${config.slot}`;
  const shown = value || BRANDING_DEFAULTS[config.slot];

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;

    const isIco = /\.ico$/i.test(file.name);
    if (!file.type.startsWith('image/') && !isIco) {
      alert('Please choose an image file (PNG, JPG, WebP, SVG or ICO).');
      return;
    }
    if (file.size > MAX_BYTES) {
      alert('That file is larger than 2MB. Please upload a smaller version.');
      return;
    }

    try {
      setUploading(true);
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
      const url = await uploadImage(BUCKET, file, `branding/${config.slot}/${Date.now()}-${safeName}`, MAX_BYTES);
      onUploaded(url);
      onChange(url);
    } catch {
      alert(`Failed to upload. Make sure the Supabase storage bucket "${BUCKET}" exists and is public.`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-lg border-2 border-background-warm bg-white p-4 space-y-3">
      <div>
        <h3 className="font-display text-base font-bold text-dark">{config.label}</h3>
        <p className="text-xs text-dark-muted mt-0.5">{config.description}</p>
      </div>

      <div
        className={`flex items-center justify-center rounded-md border border-background-warm p-3 min-h-[96px] ${
          config.preview === 'dark' ? 'bg-dark' : CHECKER
        }`}
      >
        <img
          src={shown}
          alt={`${config.label} preview`}
          className={`${config.previewClass} w-auto max-w-full object-contain`}
        />
      </div>

      <p className="text-2xs text-dark-muted leading-snug">
        {value ? 'Custom image' : 'Using the default image'} · {config.hint}
      </p>

      <input id={inputId} ref={fileRef} type="file" accept={ACCEPT} onChange={handleFile} className="hidden" />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-60"
        >
          <Upload size={14} aria-hidden="true" />
          {uploading ? 'Uploading…' : value ? 'Replace' : 'Upload'}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-md border-2 border-background-warm text-dark text-sm font-medium hover:bg-background-warm transition-colors disabled:opacity-60"
          >
            <ArrowCounterClockwise size={14} aria-hidden="true" />
            Use default
          </button>
        )}
      </div>
    </div>
  );
}

export default function AdminBranding() {
  const [draft, setDraft] = useState<BrandingContent>({ ...EMPTY_BRANDING });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // What's actually in the database right now, and every file uploaded in
  // this editing session — used on save/discard to delete files that ended
  // up unused instead of leaving orphans in storage.
  const savedRef = useRef<BrandingContent>({ ...EMPTY_BRANDING });
  const sessionUploadsRef = useRef<Set<string>>(new Set());
  // Saved version the draft is measured against (null until loaded), and a kept draft that is
  // on hold because the saved version changed after it was started.
  const [draftBase, setDraftBase] = useState<string | null>(null);
  const [heldDraft, setHeldDraft] = useState<BrandingContent | null>(null);

  useEffect(() => {
    getSiteContent<unknown>(BRANDING_KEY)
      .then(data => {
        const loaded = normalizeBranding(data);
        const base = stableStringify(loaded);
        // Unsaved changes from an earlier visit in this browser tab come back as they were left.
        const { draft: kept, stale } = lookupDraft<BrandingContent>(DRAFT_KEY, base);
        savedRef.current = loaded;
        setDraft(kept ? normalizeBranding(kept) : loaded);
        setHeldDraft(stale ? normalizeBranding(stale) : null);
        setDraftBase(base);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useDraftKeeper({ key: DRAFT_KEY, value: draft, base: heldDraft ? null : draftBase, bucket: BUCKET });

  const hasUnsavedChanges = () => JSON.stringify(draft) !== JSON.stringify(savedRef.current);

  const setSlot = (slot: BrandingSlot, url: string) => {
    setSaved(false);
    setDraft(d => ({ ...d, [slot]: url }));
  };

  const cleanupUnused = async (keep: BrandingContent, previous: BrandingContent) => {
    const keepUrls = new Set(Object.values(keep).filter(Boolean));
    const candidates = new Set<string>([...sessionUploadsRef.current, ...Object.values(previous).filter(Boolean)]);
    await Promise.all(
      [...candidates]
        .filter(url => isStorageUrl(url) && !keepUrls.has(url))
        .map(url => deleteImageByUrl(BUCKET, url).catch(() => {}))
    );
    sessionUploadsRef.current = new Set();
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      // Someone may have saved branding since this page was opened; check before overwriting.
      const current = await getSiteContent<unknown>(BRANDING_KEY).then(normalizeBranding).catch(() => null);
      if (current && draftBase !== null && stableStringify(current) !== draftBase) {
        if (!window.confirm('The saved branding changed after you opened this page. Saving now replaces those newer changes with what is on your screen. Save anyway?')) return;
      }
      await upsertSiteContent(BRANDING_KEY, draft);
      applyBranding(draft);
      await cleanupUnused(draft, savedRef.current);
      savedRef.current = { ...draft };
      setDraftBase(stableStringify(draft));
      setSaved(true);
      window.setTimeout(() => setSaved(false), 3000);
    } catch {
      alert('Failed to save branding. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = async () => {
    if (hasUnsavedChanges() && !window.confirm('Discard your unsaved changes?')) return;
    await cleanupUnused(savedRef.current, draft);
    setDraft({ ...savedRef.current });
    setSaved(false);
  };

  if (loading) {
    return (
      <AdminLayout title="Branding">
        <div role="status" className="text-center py-16 text-dark-muted">Loading…</div>
      </AdminLayout>
    );
  }

  const renderGroup = (group: SlotConfig['group'], title: string, intro: string) => (
    <section className="space-y-4">
      <div className="pb-3 border-b border-background-warm">
        <h2 className="font-display text-lg font-bold text-dark">{title}</h2>
        <p className="text-xs text-dark-muted mt-0.5">{intro}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SLOTS.filter(s => s.group === group).map(config => (
          <BrandAssetField
            key={config.slot}
            config={config}
            value={draft[config.slot]}
            onChange={url => setSlot(config.slot, url)}
            onUploaded={url => sessionUploadsRef.current.add(url)}
          />
        ))}
      </div>
    </section>
  );

  return (
    <AdminLayout
      title="Branding"
      subtitle="Upload and update the logos and icons used across the site"
      hasUnsavedChanges={hasUnsavedChanges}
    >
      <div className="bg-white rounded-md border border-background-warm shadow-card">
        <div className="p-4 sm:p-6 space-y-8">
          {heldDraft && (
            <DraftConflictNotice
              subject="the branding"
              onRestore={() => { setDraft(heldDraft); setHeldDraft(null); }}
              onDiscard={() => { discardDraft(DRAFT_KEY); setHeldDraft(null); }}
            />
          )}
          {renderGroup('public', 'Public Website', 'Header, footer and browser/app icons that visitors see.')}

          <div className="flex items-start gap-3 rounded-md bg-background-warm/60 border border-background-warm p-3 text-xs text-dark-muted">
            <Warning size={16} className="shrink-0 mt-0.5 text-primary" aria-hidden="true" />
            <p>
              The icon a phone shows on the home screen after someone installs Ulaa, and the image shown in
              WhatsApp/Instagram link previews, are read from static files by the phone or the sharing app, so
              they can't be changed from this page. They still use the files in the project's
              <code className="mx-1 px-1 rounded bg-white">public/icons</code>
              folder and need a code update to change.
            </p>
          </div>

          {renderGroup('admin', 'Admin Panel', 'Logos shown inside this admin area and on its sign-in page.')}
        </div>

        <AdminEditorFooter
          onSave={handleSave}
          saving={saving}
          saved={saved}
          onSecondaryAction={handleDiscard}
          secondaryLabel="Discard Changes"
          secondaryLabelMobile="Discard"
        />
      </div>
    </AdminLayout>
  );
}
