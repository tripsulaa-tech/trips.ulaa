import { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, ArrowCounterClockwise, Warning, Sparkle } from '@phosphor-icons/react';
import AdminEditorFooter from './AdminEditorFooter';
import { readDraft, writeDraft, clearDraft } from '../hooks/useSessionDraft';
import { getSiteContent, upsertSiteContent, uploadImage, deleteImageByUrl } from '../services/api';
import type { StudioKind } from './AdminLogoStudio';
import {
  BRANDING_KEY,
  BRANDING_DEFAULTS,
  EMPTY_BRANDING,
  applyBranding,
  normalizeBranding,
  type BrandingContent,
  type BrandingSlot,
} from '../hooks/useBranding';
import { STORAGE_BUCKET } from '../constants/storage';
import { useConfirm } from '../components/ui/useConfirm';
import { useAlert } from '../components/ui/useAlert';

// Logo Studio → "Site logos": choose which images the site uses for its header,
// footer, browser tab, install prompt and admin panel, plus the Travel Cards badge,
// card front and card back (drawn by utils/travelCard.ts). Logo slots can take the
// logo currently shown in the studio in one tap; icons are uploaded. Each slot is
// stored in the `branding` site_content row (see hooks/useBranding.ts); leaving a
// slot on "default" falls back to the file bundled in /public.

const BUCKET = STORAGE_BUCKET;
const MAX_BYTES = 2 * 1024 * 1024; // 2MB — logos/icons never need more
const CARD_MAX_BYTES = 8 * 1024 * 1024; // full card / badge artwork is larger
const ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,image/vnd.microsoft.icon,.ico';

interface SlotConfig {
  slot: BrandingSlot;
  label: string;
  group: 'public' | 'admin' | 'cards';
  description: string;
  /** Every spot can be filled straight from the studio's current logo:
   *  wide logos stay transparent, icons are centred on a square tile; the
   *  Travel Cards pieces are laid out at their own proportions. */
  studio: StudioKind;
  /** Largest upload for this spot. */
  maxBytes?: number;
  /** Bundled files shown (stacked) while nothing custom is chosen. */
  defaultLayers?: string[];
  /** Background the preview sits on, so a light logo isn't invisible. */
  preview: 'checker' | 'dark';
  previewClass: string;
}

const SLOTS: SlotConfig[] = [
  {
    slot: 'header_logo',
    label: 'Header logo',
    group: 'public',
    description: 'Top-left of every public page.',
    studio: 'wide',
    preview: 'checker',
    previewClass: 'h-10',
  },
  {
    slot: 'footer_logo',
    label: 'Footer logo',
    group: 'public',
    description: 'Site footer, on a dark background — use the light Footer look.',
    studio: 'wide',
    preview: 'dark',
    previewClass: 'h-10',
  },
  {
    slot: 'favicon',
    label: 'Browser tab icon',
    group: 'public',
    description: 'Square PNG or SVG, at least 64×64 px. Browsers cache it, so a change can take a day to show.',
    studio: 'square',
    preview: 'checker',
    previewClass: 'h-10 w-10',
  },
  {
    slot: 'app_icon',
    label: 'Install prompt icon',
    group: 'public',
    description: 'Square PNG, at least 192×192 px. Shown in the “Install the Ulaa app” popup.',
    studio: 'square',
    preview: 'checker',
    previewClass: 'h-10 w-10',
  },
  {
    slot: 'admin_logo',
    label: 'Admin logo',
    group: 'admin',
    description: 'Top of the admin sidebar and the admin sign-in page.',
    studio: 'wide',
    preview: 'checker',
    previewClass: 'h-10',
  },
  {
    slot: 'admin_icon',
    label: 'Admin sidebar icon',
    group: 'admin',
    description: 'Square PNG or SVG, at least 64×64 px. Shown when the sidebar is collapsed.',
    studio: 'square',
    preview: 'checker',
    previewClass: 'h-10 w-10',
  },
  {
    slot: 'badge_art',
    label: 'Badge',
    group: 'cards',
    description: 'The round badge on the Travel Cards page. The studio logo sits centred inside the circle.',
    studio: 'badge',
    maxBytes: CARD_MAX_BYTES,
    defaultLayers: ['/travel-card/badge-background.png', '/travel-card/badge-logo.png'],
    preview: 'checker',
    previewClass: 'h-16 w-16 rounded-full',
  },
  {
    slot: 'card_front_art',
    label: 'Travel card front',
    group: 'cards',
    description: 'Logo above the name; the traveler’s name and role label are added on the Travel Cards page.',
    studio: 'card-front',
    maxBytes: CARD_MAX_BYTES,
    defaultLayers: ['/travel-card/background.jpg', '/travel-card/overlay.png'],
    preview: 'checker',
    previewClass: 'h-20 rounded-md',
  },
  {
    slot: 'card_back_art',
    label: 'Travel card back',
    group: 'cards',
    description: 'Replaces the whole back, QR code and icons included. Clear any back-card text you don’t need.',
    studio: 'card-back',
    maxBytes: CARD_MAX_BYTES,
    defaultLayers: ['/travel-card/back-background.png', '/travel-card/back-overlay.png'],
    preview: 'checker',
    previewClass: 'h-20 rounded-md',
  },
];

const CHECKER =
  'bg-[length:16px_16px] bg-[linear-gradient(45deg,#e9e4dc_25%,transparent_25%,transparent_75%,#e9e4dc_75%),linear-gradient(45deg,#e9e4dc_25%,#fff_25%,#fff_75%,#e9e4dc_75%)] [background-position:0_0,8px_8px]';

const BTN_PRIMARY =
  'inline-flex items-center gap-1 px-2.5 py-1 min-h-[30px] rounded-md bg-primary text-white text-xs font-medium hover:bg-primary-dark transition-colors disabled:opacity-60';
const BTN_OUTLINE =
  'inline-flex items-center gap-1 px-2.5 py-1 min-h-[30px] rounded-md border-2 border-background-warm text-dark text-xs font-medium hover:bg-background-warm transition-colors disabled:opacity-60';

// Unique storage path per upload (module-level so the timestamp is never read while rendering).
function uploadPath(slot: BrandingSlot, fileName: string) {
  return `branding/${slot}/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
}

function isStorageUrl(url: string) {
  return !!url && url.includes(`/${BUCKET}/branding/`);
}

function SlotCard({
  config,
  value,
  busy,
  onUpload,
  onUseStudio,
  onReset,
}: {
  config: SlotConfig;
  value: string;
  busy: boolean;
  onUpload: (file: File) => void;
  onUseStudio: () => void;
  onReset: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const shown = value || BRANDING_DEFAULTS[config.slot];

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (file) onUpload(file);
  };

  return (
    <div className="rounded-lg border-2 border-background-warm bg-white p-2.5 space-y-2">
      <div>
        <h3 className="text-xs font-semibold text-dark">
          {config.label}
          <span className="ml-2 text-2xs font-normal text-dark-muted">{value ? 'Custom' : 'Default'}</span>
        </h3>
        <p className="text-2xs text-dark-muted mt-0.5 line-clamp-2" title={config.description}>{config.description}</p>
      </div>

      <div
        className={`flex items-center justify-center rounded-md border border-background-warm p-2 min-h-[64px] ${
          config.preview === 'dark' ? 'bg-dark' : CHECKER
        }`}
      >
        {!value && config.defaultLayers ? (
          <span className={`relative inline-block ${config.previewClass} aspect-auto overflow-hidden`}>
            {config.defaultLayers.map((src, i) => (
              <img
                key={src}
                src={src}
                alt={i === 0 ? `${config.label} preview` : ''}
                className={`${i === 0 ? 'h-full w-auto' : 'absolute inset-0 h-full w-full'} max-w-none object-contain`}
              />
            ))}
          </span>
        ) : (
          <img src={shown} alt={`${config.label} preview`} className={`${config.previewClass} w-auto max-w-full object-contain`} />
        )}
      </div>

      <input ref={fileRef} type="file" accept={ACCEPT} onChange={handleFile} className="hidden" />
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={onUseStudio} disabled={busy} className={BTN_PRIMARY}>
          <Sparkle size={12} aria-hidden="true" />
          {busy ? 'Working…' : 'Use studio logo'}
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className={BTN_OUTLINE}>
          <Upload size={12} aria-hidden="true" />
          {value ? 'Replace' : 'Upload'}
        </button>
        {value && (
          <button type="button" onClick={onReset} disabled={busy} className={BTN_OUTLINE}>
            <ArrowCounterClockwise size={12} aria-hidden="true" />
            Default
          </button>
        )}
      </div>
    </div>
  );
}

export default function LogoStudioSiteLogos({
  makeLogoFile,
  onDirtyChange,
}: {
  /** Renders the logo currently shown in the studio as a PNG (wide, or a square icon tile). */
  makeLogoFile: (kind: StudioKind) => Promise<File | null>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const alert = useAlert();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<BrandingContent>({ ...EMPTY_BRANDING });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busySlot, setBusySlot] = useState<BrandingSlot | null>(null);

  // What's actually in the database right now, and every file uploaded in
  // this editing session — used on save/discard to delete files that ended
  // up unused instead of leaving orphans in storage.
  const savedRef = useRef<BrandingContent>({ ...EMPTY_BRANDING });
  const sessionUploadsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    getSiteContent<unknown>(BRANDING_KEY)
      .then(data => {
        const loaded = normalizeBranding(data);
        savedRef.current = loaded;
        // Unsaved choices from an earlier visit in this browser tab come back as they were left.
        const kept = readDraft<{ draft: Partial<BrandingContent>; uploads: string[] }>('logoStudio.site');
        if (kept) {
          sessionUploadsRef.current = new Set(kept.uploads ?? []);
          setDraft({ ...loaded, ...kept.draft });
        } else {
          setDraft(loaded);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const hasUnsavedChanges = useCallback(
    () => JSON.stringify(draft) !== JSON.stringify(savedRef.current),
    [draft],
  );

  useEffect(() => {
    onDirtyChange(hasUnsavedChanges());
  }, [draft, saved, hasUnsavedChanges, onDirtyChange]);

  useEffect(() => {
    if (loading) return;
    if (JSON.stringify(draft) !== JSON.stringify(savedRef.current)) {
      writeDraft('logoStudio.site', { draft, uploads: [...sessionUploadsRef.current] });
    } else {
      clearDraft('logoStudio.site');
    }
  }, [draft, loading]);

  const setSlot = (slot: BrandingSlot, url: string) => {
    setSaved(false);
    setDraft(d => ({ ...d, [slot]: url }));
  };

  const uploadFor = async (slot: BrandingSlot, file: File) => {
    const isIco = /\.ico$/i.test(file.name);
    if (!file.type.startsWith('image/') && !isIco) {
      alert('Please choose an image file (PNG, JPG, WebP, SVG or ICO).');
      return;
    }
    const limit = SLOTS.find(s => s.slot === slot)?.maxBytes ?? MAX_BYTES;
    if (file.size > limit) {
      alert(`That file is larger than ${limit / (1024 * 1024)}MB. Please upload a smaller version.`);
      return;
    }
    try {
      setBusySlot(slot);
      const url = await uploadImage(BUCKET, file, uploadPath(slot, file.name), limit);
      sessionUploadsRef.current.add(url);
      setSlot(slot, url);
    } catch {
      alert(`Failed to upload. Make sure the Supabase storage bucket "${BUCKET}" exists and is public.`);
    } finally {
      setBusySlot(null);
    }
  };

  const applyStudioLogo = async (config: SlotConfig) => {
    const slot = config.slot;
    setBusySlot(slot);
    const file = await makeLogoFile(config.studio).catch(() => null);
    setBusySlot(null);
    if (!file) {
      alert('Could not create the logo image. Please try again.');
      return;
    }
    await uploadFor(slot, file);
  };

  const cleanupUnused = async (keep: BrandingContent, previous: BrandingContent) => {
    const keepUrls = new Set(Object.values(keep).filter(Boolean));
    const candidates = new Set<string>([...sessionUploadsRef.current, ...Object.values(previous).filter(Boolean)]);
    await Promise.all(
      [...candidates]
        .filter(url => isStorageUrl(url) && !keepUrls.has(url))
        .map(url => deleteImageByUrl(BUCKET, url).catch(() => {})),
    );
    sessionUploadsRef.current = new Set();
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await upsertSiteContent(BRANDING_KEY, draft);
      applyBranding(draft);
      await cleanupUnused(draft, savedRef.current);
      savedRef.current = { ...draft };
      clearDraft('logoStudio.site');
      setSaved(true);
      window.setTimeout(() => setSaved(false), 3000);
    } catch {
      alert('Failed to save the site logos. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = async () => {
    if (hasUnsavedChanges() && !(await confirm('Discard your unsaved changes?'))) return;
    await cleanupUnused(savedRef.current, { ...EMPTY_BRANDING });
    setDraft({ ...savedRef.current });
    setSaved(false);
  };

  if (loading) {
    return (
      <div role="status" className="text-center py-16 text-dark-muted">
        Loading…
      </div>
    );
  }

  const renderGroup = (group: SlotConfig['group'], title: string) => (
    <section className="space-y-1.5" aria-label={title}>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-dark-muted">{title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
        {SLOTS.filter(s => s.group === group).map(config => (
          <SlotCard
            key={config.slot}
            config={config}
            value={draft[config.slot]}
            busy={busySlot === config.slot}
            onUpload={file => void uploadFor(config.slot, file)}
            onUseStudio={() => void applyStudioLogo(config)}
            onReset={() => setSlot(config.slot, '')}
          />
        ))}
      </div>
    </section>
  );

  return (
    <>
      <div className="p-3 sm:p-4 space-y-3">
        <details className="rounded-md bg-background-warm/60 border border-background-warm px-2.5 py-1.5 text-2xs text-dark-muted">
          <summary className="cursor-pointer text-xs font-semibold text-dark">How “Use studio logo” works</summary>
          <div className="mt-1.5 space-y-1.5">
            <p>
              It puts the logo from the Design tab, in its current colours, into that spot: logos keep a transparent
              background and icons sit on a square tile in the background colour. Pick the Footer look first for the
              footer. Badge and card artwork is made at its own size in the studio's background colour; the Travel Cards
              page uses it for previews, downloads and A3 print sheets. Nothing changes on the site until you press Save.
            </p>
            <p className="flex items-start gap-1.5">
              <Warning size={13} className="shrink-0 mt-0.5 text-primary" aria-hidden="true" />
              <span>
                The home-screen icon after installing Ulaa, and the image in WhatsApp/Instagram link previews, come from
                static files in <code className="px-1 rounded bg-white">public/icons</code> and need a code update to change.
              </span>
            </p>
          </div>
        </details>

        {renderGroup('public', 'Public website')}

        {renderGroup('admin', 'Admin panel')}

        {renderGroup('cards', 'Travel cards')}
      </div>

      <AdminEditorFooter
        onSave={handleSave}
        saving={saving}
        saved={saved}
        onSecondaryAction={handleDiscard}
        secondaryLabel="Discard Changes"
        secondaryLabelMobile="Discard"
      />
    </>
  );
}
