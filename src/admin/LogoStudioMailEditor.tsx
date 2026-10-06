import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowCounterClockwise, UploadSimple } from '@phosphor-icons/react';
import AdminEditorFooter from './AdminEditorFooter';
import ColorPicker, { type ColorSwatch } from '../components/ui/ColorPicker';
import { FORM_INPUT_CLASS as inputClass } from '../constants/formStyles';
import { upsertSiteContent, uploadImage, deleteImageByUrl } from '../services/api';
import {
  BOOKING_EMAIL_KEY,
  DEFAULT_BOOKING_EMAIL_TEMPLATE,
  EMAIL_TOKENS,
  loadBookingEmailTemplate,
  normalizeBookingEmailTemplate,
  setCachedBookingEmailTemplate,
  type BookingEmailTemplate,
} from '../utils/bookingEmailTemplate';

// Logo Studio → "Email": the wording of the booking confirmation email that goes to
// travellers (Enquiries → Email booking confirmation). The layout, payment table and
// invoice attachment stay as designed; the lines of text, the button label and the
// accent colour can be changed here. A blank line means "use the default wording".
// Wording is stored in the `booking_email_template` site_content row.

const BUCKET = 'ulaa';
const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const LOGO_ACCEPT = 'image/png,image/jpeg,image/webp';
const isStorageUrl = (url: string) => !!url && url.includes(`/${BUCKET}/branding/`);

const SWATCHES: ColorSwatch[] = [
  { name: 'Brand brown', hex: '#A85A2A' },
  { name: 'Orange', hex: '#fe480a' },
  { name: 'Brown', hex: '#72573e' },
  { name: 'Dark brown', hex: '#2d2118' },
];

type TextKey = Exclude<keyof BookingEmailTemplate, 'accentColour' | 'logoUrl' | 'logoDarkUrl' | 'logoWidth'>;

interface FieldDef { key: TextKey; label: string; hint?: string; rows?: number }
interface GroupDef { title: string; fields: FieldDef[] }

const GROUPS: GroupDef[] = [
  {
    title: 'Subject line',
    fields: [
      { key: 'subjectConfirmed', label: 'While a balance is due' },
      { key: 'subjectFull', label: 'Once fully paid' },
    ],
  },
  {
    title: 'Top of the email',
    fields: [
      { key: 'tagline', label: 'Line above the card' },
      { key: 'preheader', label: 'Inbox preview text', hint: 'The grey snippet shown next to the subject in the inbox.' },
      { key: 'badge', label: 'Small heading above the trip name' },
    ],
  },
  {
    title: 'Message',
    fields: [
      { key: 'greeting', label: 'Greeting' },
      { key: 'intro', label: 'Opening paragraph', rows: 3 },
      { key: 'confirmLine', label: 'Confirmation paragraph', rows: 3 },
    ],
  },
  {
    title: 'Payment note',
    fields: [
      { key: 'paymentLabelPartial', label: 'Heading while a balance is due' },
      { key: 'paymentNotePartial', label: 'Note while a balance is due', rows: 4 },
      { key: 'paymentLabelFull', label: 'Heading once fully paid' },
      { key: 'paymentNoteFull', label: 'Note once fully paid', rows: 3 },
    ],
  },
  {
    title: 'Button and sign-off',
    fields: [
      { key: 'buttonLabel', label: 'Button label' },
      { key: 'closingLine', label: 'Closing line', rows: 2 },
      { key: 'signOff', label: 'Sign-off', rows: 2 },
    ],
  },
];

export default function LogoStudioMailEditor({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
  const [draft, setDraft] = useState<BookingEmailTemplate>({ ...DEFAULT_BOOKING_EMAIL_TEMPLATE });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [fullyPaid, setFullyPaid] = useState(false);
  const [darkPreview, setDarkPreview] = useState(false);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const logoDarkInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<'' | 'logoUrl' | 'logoDarkUrl'>('');
  // Logos uploaded while editing, so ones that end up unused can be deleted on save.
  const sessionUploads = useRef<Set<string>>(new Set());
  const [base, setBase] = useState<BookingEmailTemplate>({ ...DEFAULT_BOOKING_EMAIL_TEMPLATE });

  useEffect(() => {
    loadBookingEmailTemplate()
      .then(t => {
        setBase(t);
        setDraft(t);
      })
      .finally(() => setLoading(false));
  }, []);

  const dirty = JSON.stringify(draft) !== JSON.stringify(base);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);

  // What the email will look like, drawn by the same code that sends it (blank lines use the defaults).
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      import('../utils/bookingEmail')
        .then(m => {
          if (!cancelled) setPreview(m.bookingEmailSample(normalizeBookingEmailTemplate(draft), fullyPaid));
        })
        .catch(err => console.error(err));
    }, 200);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [draft, fullyPaid]);

  // The preview follows the Light/Dark switch instead of this computer's own setting: the
  // email's dark-mode rules are forced on or off, and the dark logo is loaded from this site
  // so it also shows before the site has been deployed.
  const previewHtml = (() => {
    const html = preview?.html ?? '';
    if (!html) return html;
    return html
      .replace('@media (prefers-color-scheme: dark)', darkPreview ? '@media all' : '@media not all')
      .replace('https://www.ulaatrips.com/ULAA-logo-mail-dark.png', `${window.location.origin}/ULAA-logo-mail-dark.png`);
  })();

  const set = useCallback(<K extends keyof BookingEmailTemplate>(key: K, value: BookingEmailTemplate[K]) => {
    setSaved(false);
    setError('');
    setDraft(d => ({ ...d, [key]: value }));
  }, []);

  const chooseLogo = async (which: 'logoUrl' | 'logoDarkUrl', file: File | undefined) => {
    if (logoInput.current) logoInput.current.value = '';
    if (logoDarkInput.current) logoDarkInput.current.value = '';
    if (!file) return;
    if (!LOGO_ACCEPT.split(',').includes(file.type)) {
      setError('Please choose a PNG, JPG or WebP image. Email programs cannot show SVG logos.');
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      setError('That logo is larger than 2MB. Please use a smaller image.');
      return;
    }
    try {
      setUploading(which);
      setError('');
      const url = await uploadImage(BUCKET, file, `branding/email_logo/${which === 'logoDarkUrl' ? 'dark-' : ''}${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`, LOGO_MAX_BYTES);
      sessionUploads.current.add(url);
      set(which, url);
    } catch {
      setError(`Could not upload the logo. Make sure the storage bucket "${BUCKET}" exists and is public.`);
    } finally {
      setUploading('');
    }
  };

  // Deletes uploaded logos that are no longer used by the saved email.
  const cleanupLogos = async (keep: string[], previous: string[]) => {
    const unused = [...sessionUploads.current, ...previous].filter(u => isStorageUrl(u) && !keep.includes(u));
    await Promise.all([...new Set(unused)].map(u => deleteImageByUrl(BUCKET, u).catch(() => {})));
    sessionUploads.current = new Set();
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError('');
      const clean = normalizeBookingEmailTemplate(draft);
      await upsertSiteContent(BOOKING_EMAIL_KEY, clean);
      setCachedBookingEmailTemplate(clean);
      await cleanupLogos([clean.logoUrl, clean.logoDarkUrl], [base.logoUrl, base.logoDarkUrl]);
      setBase(clean);
      setDraft(clean);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Could not save the email wording. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!window.confirm('Put every line back to the original wording? (Press Save to keep it.)')) return;
    setSaved(false);
    setDraft({ ...DEFAULT_BOOKING_EMAIL_TEMPLATE });
  };

  if (loading) {
    return <div role="status" className="text-center py-16 text-dark-muted">Loading…</div>;
  }

  return (
    <>
      <div className="p-4 sm:p-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] items-start">
        <div className="space-y-6">
          <p className="text-xs text-dark-muted">
            This is the booking confirmation email sent from Enquiries. The layout, payment table and invoice attachment
            stay as designed; the wording below is yours to change. Leave a line empty to use the original wording.
          </p>

          <div className="rounded-md bg-background-warm/60 border border-background-warm p-3 text-xs text-dark-muted space-y-1.5">
            <p className="font-semibold text-dark">Fill-in values</p>
            <p>Type these in any line and they are replaced for each traveller. Put **two stars** around words to make them bold.</p>
            <ul className="grid sm:grid-cols-2 gap-x-4 gap-y-0.5">
              {EMAIL_TOKENS.map(t => (
                <li key={t.token}><code className="px-1 rounded bg-white">{t.token}</code> {t.meaning}</li>
              ))}
            </ul>
          </div>

          {GROUPS.map(group => (
            <section key={group.title} className="space-y-3" aria-label={group.title}>
              <h2 className="text-sm font-semibold text-dark">{group.title}</h2>
              {group.fields.map(f => {
                const id = `mail-${f.key}`;
                const changed = draft[f.key] !== DEFAULT_BOOKING_EMAIL_TEMPLATE[f.key];
                return (
                  <div key={f.key}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label htmlFor={id} className="block text-xs font-medium text-dark">{f.label}</label>
                      {changed && (
                        <button
                          type="button"
                          onClick={() => set(f.key, DEFAULT_BOOKING_EMAIL_TEMPLATE[f.key])}
                          className="inline-flex items-center gap-1 text-2xs font-medium text-primary hover:underline"
                        >
                          <ArrowCounterClockwise size={12} aria-hidden="true" /> Original
                        </button>
                      )}
                    </div>
                    {f.rows ? (
                      <textarea id={id} rows={f.rows} maxLength={1000} value={draft[f.key]} onChange={e => set(f.key, e.target.value)} className={`${inputClass} resize-y`} />
                    ) : (
                      <input id={id} maxLength={300} value={draft[f.key]} onChange={e => set(f.key, e.target.value)} className={inputClass} />
                    )}
                    {f.hint && <p className="text-xs text-dark-muted mt-1">{f.hint}</p>}
                  </div>
                );
              })}
            </section>
          ))}

          <section className="space-y-3" aria-label="Accent colour">
            <h2 className="text-sm font-semibold text-dark">Accent colour</h2>
            <div className="flex items-center gap-2.5 rounded-md border-2 border-background-warm px-2 py-1.5 max-w-xs">
              <ColorPicker value={draft.accentColour} label="Accent colour" swatches={SWATCHES} swatchesLabel="Brand colours" onChange={hex => set('accentColour', hex)} />
              <span className="text-xs font-medium text-dark flex-1">Button, small headings and highlighted amounts</span>
              <span className="font-mono text-2xs uppercase text-dark-muted">{draft.accentColour}</span>
            </div>
          </section>

          <section className="space-y-3" aria-label="Logo">
            <h2 className="text-sm font-semibold text-dark">Logo</h2>
            <p className="text-xs text-dark-muted">Shown at the bottom of the email. Upload one logo for light mode and, if you like, a different one for dark mode (PNG, JPG or WebP, up to 2MB each). A dark-mode logo should have light lettering on a transparent background. If you upload only a light-mode logo, it is used in both modes.</p>
            <input ref={logoInput} type="file" accept={LOGO_ACCEPT} className="hidden" onChange={e => void chooseLogo('logoUrl', e.target.files?.[0])} />
            <input ref={logoDarkInput} type="file" accept={LOGO_ACCEPT} className="hidden" onChange={e => void chooseLogo('logoDarkUrl', e.target.files?.[0])} />
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-xs font-medium text-dark">Light mode</p>
                <div className="flex items-center justify-center rounded-md border border-background-warm bg-white px-4 py-3 min-w-[140px]">
                  <img src={draft.logoUrl || '/ULAA-logo.png'} alt="Email logo, light mode" style={{ width: Math.min(draft.logoWidth, 160) }} className="max-w-full h-auto" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => logoInput.current?.click()} disabled={!!uploading} className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-md border-2 border-background-warm text-dark text-sm font-medium hover:bg-background-warm transition-colors disabled:opacity-60">
                    <UploadSimple size={14} aria-hidden="true" />
                    {uploading === 'logoUrl' ? 'Uploading…' : draft.logoUrl ? 'Replace' : 'Upload'}
                  </button>
                  {draft.logoUrl && (
                    <button type="button" onClick={() => set('logoUrl', '')} className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-md border-2 border-background-warm text-dark text-sm font-medium hover:bg-background-warm transition-colors">
                      <ArrowCounterClockwise size={14} aria-hidden="true" />
                      Use Ulaa logo
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium text-dark">Dark mode</p>
                <div className="flex items-center justify-center rounded-md border border-dark bg-[#2D2118] px-4 py-3 min-w-[140px]">
                  <img src={draft.logoDarkUrl || (draft.logoUrl || '/ULAA-logo-mail-dark.png')} alt="Email logo, dark mode" style={{ width: Math.min(draft.logoWidth, 160) }} className="max-w-full h-auto" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => logoDarkInput.current?.click()} disabled={!!uploading} className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-md border-2 border-background-warm text-dark text-sm font-medium hover:bg-background-warm transition-colors disabled:opacity-60">
                    <UploadSimple size={14} aria-hidden="true" />
                    {uploading === 'logoDarkUrl' ? 'Uploading…' : draft.logoDarkUrl ? 'Replace' : 'Upload'}
                  </button>
                  {draft.logoDarkUrl && (
                    <button type="button" onClick={() => set('logoDarkUrl', '')} className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-md border-2 border-background-warm text-dark text-sm font-medium hover:bg-background-warm transition-colors">
                      <ArrowCounterClockwise size={14} aria-hidden="true" />
                      Use Ulaa dark logo
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="max-w-xs">
              <label htmlFor="mail-logo-width" className="flex items-center justify-between text-xs font-medium text-dark mb-1">
                <span>Logo width</span>
                <span className="font-mono text-dark-muted">{draft.logoWidth}px</span>
              </label>
              <input id="mail-logo-width" type="range" min={60} max={240} step={10} value={draft.logoWidth} onChange={e => set('logoWidth', Number(e.target.value))} className="w-full accent-primary" />
            </div>
          </section>

          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </div>

        <section aria-label="Email preview" className="lg:sticky lg:top-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-dark">Preview</h2>
            <div role="group" aria-label="Preview as" className="grid grid-cols-2 gap-1.5">
              {([[false, 'Balance due'], [true, 'Fully paid']] as const).map(([value, label]) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={fullyPaid === value}
                  onClick={() => setFullyPaid(value)}
                  className={`min-h-[36px] px-3 rounded-md border-2 text-xs font-medium transition-colors ${
                    fullyPaid === value ? 'border-primary bg-primary/5 text-primary' : 'border-background-warm text-dark hover:border-primary/50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div role="group" aria-label="Preview appearance" className="grid grid-cols-2 gap-1.5 max-w-[220px]">
            {([[false, 'Light mode'], [true, 'Dark mode']] as const).map(([value, label]) => (
              <button
                key={label}
                type="button"
                aria-pressed={darkPreview === value}
                onClick={() => setDarkPreview(value)}
                className={`min-h-[36px] px-3 rounded-md border-2 text-xs font-medium transition-colors ${
                  darkPreview === value ? 'border-primary bg-primary/5 text-primary' : 'border-background-warm text-dark hover:border-primary/50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-dark-muted truncate"><span className="font-medium text-dark">Subject:</span> {preview?.subject ?? '…'}</p>
          <iframe
            title="Booking confirmation email preview"
            sandbox=""
            srcDoc={previewHtml}
            className="w-full h-[640px] rounded-md border border-background-warm bg-white"
          />
          {darkPreview && <p className="text-xs text-dark-muted">This is how email apps that support dark mode (such as Apple Mail) will show it. Some apps, like Gmail, darken emails in their own way.</p>}
          <p className="text-xs text-dark-muted">Shown with a sample traveller and payments. The real email uses each booking's details.</p>
        </section>
      </div>

      <AdminEditorFooter
        onSave={handleSave}
        saving={saving}
        saved={saved}
        onSecondaryAction={handleReset}
        secondaryLabel="Reset to Original"
        secondaryLabelMobile="Reset"
      />
    </>
  );
}
