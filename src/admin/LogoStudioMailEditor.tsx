import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowCounterClockwise, UploadSimple } from '@phosphor-icons/react';
import AdminEditorFooter from './AdminEditorFooter';
import { readDraft, writeDraft, clearDraft } from '../hooks/useSessionDraft';
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
import { SITE_ORIGIN } from '../constants/site';
import { useConfirm } from '../components/ui/useConfirm';
import { STORAGE_BUCKET } from '../constants/storage';

// Logo Studio → "Email": the wording of the booking confirmation email that goes to
// travellers (Enquiries → Email booking confirmation). The layout, payment table and
// invoice attachment stay as designed; the lines of text, the button label and the
// accent colour can be changed here. A blank line means "use the default wording".
// Wording is stored in the `booking_email_template` site_content row.

const BUCKET = STORAGE_BUCKET;
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

type GroupId = string;

export default function LogoStudioMailEditor({ onDirtyChange, fit = false }: { onDirtyChange: (dirty: boolean) => void; fit?: boolean }) {
  const confirm = useConfirm();
  // One section of the form is shown at a time (so the page stays short); 'style' = colour + logo.
  // Remembered for this browser tab, so coming back to the page lands on the same section.
  const [section, setSection] = useState<GroupId>(() => {
    try { return window.sessionStorage.getItem('logoStudio.mailSection') || GROUPS[0].title; } catch { return GROUPS[0].title; }
  });
  const chooseSection = (id: GroupId) => {
    sectionRef.current = id;
    setSection(id);
    try { window.sessionStorage.setItem('logoStudio.mailSection', id); } catch { /* ignore */ }
    jumpPreview(id, true);
  };
  // Main preview: choosing a form section scrolls the email to the matching part.
  const previewFrame = useRef<HTMLIFrameElement>(null);
  const sectionRef = useRef<string>(section);
  const jumpPreview = (id: string, smooth: boolean) => {
    const frame = previewFrame.current;
    const doc = frame?.contentDocument;
    const win = frame?.contentWindow;
    if (!doc?.body || !win) return;
    const behavior = smooth ? 'smooth' : 'auto';
    if (id === 'style') {
      win.scrollTo({ top: doc.documentElement.scrollHeight, behavior });
      return;
    }
    const t = normalizeBookingEmailTemplate(draft);
    const text =
      id === 'Top of the email' ? t.tagline
      : id === 'Message' ? t.greeting
      : id === 'Payment note' ? (fullyPaid ? t.paymentLabelFull : t.paymentLabelPartial)
      : id === 'Button and sign-off' ? t.buttonLabel
      : '';
    // Fixed pieces of the line (fill-in values and ** marks are not in the text as typed), longest first.
    // If none of the typed wording is found (heavily reworded), try the original wording, then fall back
    // to a proportional position so the jump never silently does nothing.
    const pieces = (line: string) =>
      line.replace(/\*\*/g, '').split(/\{[^}]*\}/).map(x => x.trim()).filter(x => x.length >= 3).sort((a, b) => b.length - a.length);
    const original = normalizeBookingEmailTemplate({});
    const originalText =
      id === 'Top of the email' ? original.tagline
      : id === 'Message' ? original.greeting
      : id === 'Payment note' ? (fullyPaid ? original.paymentLabelFull : original.paymentLabelPartial)
      : id === 'Button and sign-off' ? original.buttonLabel
      : '';
    const candidates = [...pieces(text), ...pieces(originalText)];
    if (candidates.length === 0) {
      win.scrollTo({ top: 0, behavior });
      return;
    }
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
    for (const probe of candidates) {
      const needle = probe.toLowerCase();
      for (const n of nodes) {
        const el = n.parentElement;
        if (!el || !(n.nodeValue ?? '').toLowerCase().includes(needle) || el.getClientRects().length === 0) continue;
        const top = el.getBoundingClientRect().top + win.scrollY - 24;
        win.scrollTo({ top: Math.max(0, top), behavior });
        return;
      }
    }
    const idx = Math.max(0, GROUPS.findIndex(g => g.title === id));
    const max = doc.documentElement.scrollHeight - win.innerHeight;
    win.scrollTo({ top: Math.max(0, (max * idx) / GROUPS.length), behavior });
  };
  const [draft, setDraft] = useState<BookingEmailTemplate>({ ...DEFAULT_BOOKING_EMAIL_TEMPLATE });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [fullyPaid, setFullyPaid] = useState(false);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<'' | 'logoUrl' | 'logoDarkUrl'>('');
  // Logos uploaded while editing, so ones that end up unused can be deleted on save.
  const sessionUploads = useRef<Set<string>>(new Set());
  const [base, setBase] = useState<BookingEmailTemplate>({ ...DEFAULT_BOOKING_EMAIL_TEMPLATE });

  useEffect(() => {
    loadBookingEmailTemplate()
      .then(t => {
        setBase(t);
        // Unsaved wording from an earlier visit in this browser tab comes back as it was left.
        const kept = readDraft<{ draft: Partial<BookingEmailTemplate>; uploads: string[] }>('logoStudio.mail');
        if (kept) sessionUploads.current = new Set(kept.uploads ?? []);
        setDraft(kept ? { ...t, ...kept.draft } : t);
      })
      .finally(() => setLoading(false));
  }, []);

  const dirty = JSON.stringify(draft) !== JSON.stringify(base);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (loading) return;
    if (dirty) writeDraft('logoStudio.mail', { draft, uploads: [...sessionUploads.current] });
    else clearDraft('logoStudio.mail');
  }, [draft, dirty, loading]);

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

  // The default logo is loaded from this site so it also shows before the site has been deployed.
  const previewHtml = (() => {
    const html = preview?.html ?? '';
    return html.replace(`${SITE_ORIGIN}/ULAA-logo.png`, `${window.location.origin}/ULAA-logo.png`);
  })();

  const set = useCallback(<K extends keyof BookingEmailTemplate>(key: K, value: BookingEmailTemplate[K]) => {
    setSaved(false);
    setError('');
    setDraft(d => ({ ...d, [key]: value }));
  }, []);

  const chooseLogo = async (which: 'logoUrl' | 'logoDarkUrl', file: File | undefined) => {
    if (logoInput.current) logoInput.current.value = '';
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
      clearDraft('logoStudio.mail');
      setSaved(true);
      window.setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Could not save the email wording. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    const ok = await confirm({
      title: 'Reset email wording?',
      message: 'Put every line back to the original wording? (Press Save to keep it.)',
      confirmLabel: 'Reset',
    });
    if (!ok) return;
    setSaved(false);
    setDraft({ ...DEFAULT_BOOKING_EMAIL_TEMPLATE });
  };

  if (loading) {
    return <div role="status" className="text-center py-16 text-dark-muted">Loading…</div>;
  }

  const group = GROUPS.find(g => g.title === section);
  const SECTION_CHIPS = [...GROUPS.map(g => g.title), 'style'];
  const chipId = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  // Arrow keys / Home / End move between the email sections.
  const onChipsKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const i = Math.max(0, SECTION_CHIPS.indexOf(section));
    let next = i;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % SECTION_CHIPS.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + SECTION_CHIPS.length) % SECTION_CHIPS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = SECTION_CHIPS.length - 1;
    else return;
    e.preventDefault();
    chooseSection(SECTION_CHIPS[next]);
    window.requestAnimationFrame(() => document.getElementById(`mail-section-${chipId(SECTION_CHIPS[next])}`)?.focus());
  };
  const chipLabel = (t: string) => (t === 'style' ? 'Colour & logo' : t);
  const frame = fit ? 'h-full min-h-0' : 'h-[560px]';

  return (
    <div className={fit ? 'h-full min-h-0 flex flex-col' : ''}>
      <div className={`p-4 sm:p-6 grid gap-4 lg:gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)] ${fit ? 'flex-1 min-h-0 !py-3 items-stretch' : 'items-start'}`}>
        <div className={`min-w-0 space-y-3 ${fit ? 'min-h-0 overflow-y-auto app-scroll pr-1' : ''}`}>
          <div role="tablist" aria-label="Email sections" onKeyDown={onChipsKeyDown} className="flex flex-wrap gap-1.5">
            {SECTION_CHIPS.map(t => (
              <button
                key={t}
                type="button"
                role="tab"
                id={`mail-section-${chipId(t)}`}
                aria-selected={section === t}
                tabIndex={section === t ? 0 : -1}
                onClick={() => chooseSection(t)}
                className={`min-h-[30px] rounded-md border-2 px-2.5 text-xs font-medium transition-colors ${
                  section === t ? 'border-primary bg-primary/5 text-primary' : 'border-background-warm text-dark hover:border-primary/50'
                }`}
              >
                {chipLabel(t)}
              </button>
            ))}
          </div>

          <details className="rounded-md bg-background-warm/60 border border-background-warm px-2.5 py-1.5 text-2xs text-dark-muted">
            <summary className="cursor-pointer font-semibold text-dark text-xs">Fill-in values &amp; tips</summary>
            <div className="mt-1.5 space-y-1">
              <p>Leave a line empty to use the original wording. Type these in any line and they are replaced for each traveller. Put **two stars** around words to make them bold.</p>
              <ul className="grid sm:grid-cols-2 gap-x-4 gap-y-0.5">
                {EMAIL_TOKENS.map(t => (
                  <li key={t.token}><code className="px-1 rounded bg-white">{t.token}</code> {t.meaning}</li>
                ))}
              </ul>
            </div>
          </details>

          {group && (
            <section aria-label={group.title} className="grid gap-2.5 sm:grid-cols-2">
              {group.fields.map(f => {
                const id = `mail-${f.key}`;
                const changed = draft[f.key] !== DEFAULT_BOOKING_EMAIL_TEMPLATE[f.key];
                // Short one-line fields sit two per row; paragraphs take the full width.
                return (
                  <div key={f.key} className={f.rows ? 'sm:col-span-2' : group.fields.length === 3 && f === group.fields[2] ? 'sm:col-span-2' : ''}>
                    <div className="flex items-center justify-between gap-2 mb-0.5">
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
                      <textarea id={id} rows={Math.min(f.rows, 3)} maxLength={1000} value={draft[f.key]} onChange={e => set(f.key, e.target.value)} className={`${inputClass} !py-1.5 text-sm resize-y`} />
                    ) : (
                      <input id={id} maxLength={300} value={draft[f.key]} onChange={e => set(f.key, e.target.value)} className={`${inputClass} !py-1.5 text-sm`} />
                    )}
                    {f.hint && <p className="text-2xs text-dark-muted mt-0.5">{f.hint}</p>}
                  </div>
                );
              })}
            </section>
          )}

          {section === 'style' && (
            <div className="space-y-3">
              <section className="space-y-1.5" aria-label="Accent colour">
                <h2 className="text-xs font-semibold text-dark">Accent colour</h2>
                <div className="flex items-center gap-2 rounded-md border-2 border-background-warm px-1.5 py-1">
                  <ColorPicker value={draft.accentColour} label="Accent colour" swatches={SWATCHES} swatchesLabel="Brand colours" sizeClass="h-6 w-6" onChange={hex => set('accentColour', hex)} />
                  <span className="text-xs text-dark flex-1 leading-tight">Button, small headings and highlighted amounts</span>
                  <span className="font-mono text-2xs uppercase text-dark-muted">{draft.accentColour}</span>
                </div>
              </section>

              <section className="space-y-1.5" aria-label="Logo">
                <h2 className="text-xs font-semibold text-dark">Logo</h2>
                <p className="text-2xs text-dark-muted">Shown at the bottom of the email (PNG, JPG or WebP, up to 2MB). Left empty, the Ulaa logo (ULAA-logo.png) is used.</p>
                <input ref={logoInput} type="file" accept={LOGO_ACCEPT} className="hidden" onChange={e => void chooseLogo('logoUrl', e.target.files?.[0])} />
                <div className="flex h-14 items-center justify-center rounded-md border border-background-warm bg-white px-2">
                  <img src={draft.logoUrl || '/ULAA-logo.png'} alt="Email logo" style={{ width: Math.min(draft.logoWidth, 110) }} className="max-h-full max-w-full h-auto object-contain" />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => logoInput.current?.click()} disabled={!!uploading} className="inline-flex items-center gap-1 px-2 min-h-[30px] rounded-md border-2 border-background-warm text-dark text-xs font-medium hover:bg-background-warm transition-colors disabled:opacity-60">
                    <UploadSimple size={12} aria-hidden="true" />
                    {uploading ? 'Uploading…' : draft.logoUrl ? 'Replace' : 'Upload'}
                  </button>
                  {draft.logoUrl && (
                    <button type="button" onClick={() => set('logoUrl', '')} title="Use Ulaa logo" className="inline-flex items-center gap-1 px-2 min-h-[30px] rounded-md border-2 border-background-warm text-dark text-xs font-medium hover:bg-background-warm transition-colors">
                      <ArrowCounterClockwise size={12} aria-hidden="true" />
                      Default
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="mail-logo-width" className="w-20 shrink-0 text-xs font-medium text-dark">Logo width</label>
                  <input id="mail-logo-width" type="range" min={60} max={240} step={10} value={draft.logoWidth} onChange={e => set('logoWidth', Number(e.target.value))} className="flex-1 min-w-0 accent-primary" />
                  <span className="w-12 text-right font-mono text-2xs text-dark-muted">{draft.logoWidth}px</span>
                </div>
              </section>
            </div>
          )}

          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </div>

        <section aria-label="Email preview" className={`space-y-2 min-w-0 ${fit ? 'min-h-0 flex flex-col' : ''}`}>
          <div className="flex flex-wrap items-center gap-1.5">
            <h2 className="text-sm font-semibold text-dark mr-auto">Preview</h2>
            {([[false, 'Balance due'], [true, 'Fully paid']] as const).map(([value, label]) => (
              <button
                key={label}
                type="button"
                aria-pressed={fullyPaid === value}
                onClick={() => setFullyPaid(value)}
                className={`min-h-[30px] px-2.5 rounded-md border-2 text-xs font-medium transition-colors ${
                  fullyPaid === value ? 'border-primary bg-primary/5 text-primary' : 'border-background-warm text-dark hover:border-primary/50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-2xs text-dark-muted truncate" title={preview?.subject}><span className="font-medium text-dark">Subject:</span> {preview?.subject ?? '…'}</p>
          <iframe
            ref={previewFrame}
            onLoad={() => jumpPreview(sectionRef.current || GROUPS[0].title, false)}
            title="Booking confirmation email preview"
            // allow-same-origin (no scripts) lets this page scroll the email to the section being edited.
            sandbox="allow-same-origin"
            srcDoc={previewHtml}
            className={`w-full ${frame} flex-1 rounded-md border border-background-warm bg-white`}
          />
          <p className="text-2xs text-dark-muted">Sample traveller and payments; the real email uses each booking's details.</p>
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
    </div>
  );
}
