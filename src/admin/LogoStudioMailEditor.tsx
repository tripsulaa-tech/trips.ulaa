import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowCounterClockwise, Columns, UploadSimple } from '@phosphor-icons/react';
import AdminEditorFooter from './AdminEditorFooter';
import Modal from '../components/ui/Modal';
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

type GroupId = string;

export default function LogoStudioMailEditor({ onDirtyChange, fit = false }: { onDirtyChange: (dirty: boolean) => void; fit?: boolean }) {
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
  // Compare popup: the two iframes scroll together (the one the pointer is over leads).
  const cmpRefs = useRef<(HTMLIFrameElement | null)[]>([null, null]);
  const leader = useRef(0);
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
    // Longest fixed piece of the line (fill-in values and ** marks are not in the text as typed).
    const probe = text.replace(/\*\*/g, '').split(/\{[^}]*\}/).sort((a, b) => b.length - a.length)[0]?.trim();
    if (!probe) {
      win.scrollTo({ top: 0, behavior });
      return;
    }
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || !(n.nodeValue ?? '').toLowerCase().includes(probe.toLowerCase()) || el.getClientRects().length === 0) continue;
      const top = el.getBoundingClientRect().top + win.scrollY - 24;
      win.scrollTo({ top: Math.max(0, top), behavior });
      return;
    }
  };
  const wireSync = (i: number) => {
    const win = cmpRefs.current[i]?.contentWindow;
    if (!win) return;
    const lead = () => { leader.current = i; };
    ['pointerdown', 'pointerenter', 'wheel', 'touchstart', 'keydown'].forEach(ev => win.addEventListener(ev, lead, { passive: true }));
    win.addEventListener('scroll', () => {
      if (leader.current !== i) return;
      const other = cmpRefs.current[1 - i]?.contentWindow;
      if (!other) return;
      const max = win.document.documentElement.scrollHeight - win.innerHeight;
      const omax = other.document.documentElement.scrollHeight - other.innerHeight;
      other.scrollTo(0, max > 0 ? (win.scrollY / max) * omax : 0);
    });
  };
  const [draft, setDraft] = useState<BookingEmailTemplate>({ ...DEFAULT_BOOKING_EMAIL_TEMPLATE });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [fullyPaid, setFullyPaid] = useState(false);
  const [darkPreview, setDarkPreview] = useState(false);
  // Compare opens a popup with light and dark side by side.
  const [compare, setCompare] = useState(false);
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

  // The preview follows the Light/Dark switch instead of this computer's own setting: the
  // email's dark-mode rules are forced on or off, and the dark logo is loaded from this site
  // so it also shows before the site has been deployed.
  const previewHtmlFor = (dark: boolean) => {
    const html = preview?.html ?? '';
    if (!html) return html;
    return html
      .replace('@media (prefers-color-scheme: dark)', dark ? '@media all' : '@media not all')
      .replace('https://www.ulaatrips.com/ULAA-logo-mail-dark.png', `${window.location.origin}/ULAA-logo-mail-dark.png`);
  };

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
      clearDraft('logoStudio.mail');
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

  const group = GROUPS.find(g => g.title === section);
  const SECTION_CHIPS = [...GROUPS.map(g => g.title), 'style'];
  const chipLabel = (t: string) => (t === 'style' ? 'Colour & logo' : t);
  const frame = fit ? 'h-full min-h-0' : 'h-[560px]';

  return (
    <div className={fit ? 'h-full min-h-0 flex flex-col' : ''}>
      <div className={`p-4 sm:p-6 grid gap-4 lg:gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)] ${fit ? 'flex-1 min-h-0 !py-3 items-stretch' : 'items-start'}`}>
        <div className={`min-w-0 space-y-3 ${fit ? 'min-h-0 overflow-y-auto app-scroll pr-1' : ''}`}>
          <div role="tablist" aria-label="Email sections" className="flex flex-wrap gap-1.5">
            {SECTION_CHIPS.map(t => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={section === t}
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
                <p className="text-2xs text-dark-muted">Shown at the bottom of the email (PNG, JPG or WebP, up to 2MB). The dark-mode logo should have light lettering on a transparent background; without one, the light logo is used in both modes.</p>
                <input ref={logoInput} type="file" accept={LOGO_ACCEPT} className="hidden" onChange={e => void chooseLogo('logoUrl', e.target.files?.[0])} />
                <input ref={logoDarkInput} type="file" accept={LOGO_ACCEPT} className="hidden" onChange={e => void chooseLogo('logoDarkUrl', e.target.files?.[0])} />
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ['logoUrl', 'Light mode', 'bg-white border-background-warm', draft.logoUrl || '/ULAA-logo.png', logoInput, 'Use Ulaa logo'],
                    ['logoDarkUrl', 'Dark mode', 'bg-[#2D2118] border-dark', draft.logoDarkUrl || draft.logoUrl || '/ULAA-logo-mail-dark.png', logoDarkInput, 'Use Ulaa dark logo'],
                  ] as const).map(([key, label, box, src, input, resetLabel]) => (
                    <div key={key} className="space-y-1.5">
                      <p className="text-xs font-medium text-dark">{label}</p>
                      <div className={`flex h-14 items-center justify-center rounded-md border px-2 ${box}`}>
                        <img src={src} alt={`Email logo, ${label.toLowerCase()}`} style={{ width: Math.min(draft.logoWidth, 110) }} className="max-h-full max-w-full h-auto object-contain" />
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <button type="button" onClick={() => input.current?.click()} disabled={!!uploading} className="inline-flex items-center gap-1 px-2 min-h-[30px] rounded-md border-2 border-background-warm text-dark text-xs font-medium hover:bg-background-warm transition-colors disabled:opacity-60">
                          <UploadSimple size={12} aria-hidden="true" />
                          {uploading === key ? 'Uploading…' : draft[key] ? 'Replace' : 'Upload'}
                        </button>
                        {draft[key] && (
                          <button type="button" onClick={() => set(key, '')} title={resetLabel} className="inline-flex items-center gap-1 px-2 min-h-[30px] rounded-md border-2 border-background-warm text-dark text-xs font-medium hover:bg-background-warm transition-colors">
                            <ArrowCounterClockwise size={12} aria-hidden="true" />
                            Default
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
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
          <div role="group" aria-label="Preview appearance" className="flex flex-wrap items-center gap-1.5">
            {([[false, 'Light mode'], [true, 'Dark mode']] as const).map(([value, label]) => (
              <button
                key={label}
                type="button"
                aria-pressed={darkPreview === value}
                onClick={() => setDarkPreview(value)}
                className={`min-h-[30px] px-2.5 rounded-md border-2 text-xs font-medium transition-colors ${
                  darkPreview === value ? 'border-primary bg-primary/5 text-primary' : 'border-background-warm text-dark hover:border-primary/50'
                }`}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              aria-haspopup="dialog"
              aria-label="Compare light and dark side by side"
              title="Compare light and dark side by side"
              onClick={() => setCompare(true)}
              className="inline-flex items-center justify-center gap-1.5 min-h-[30px] px-2.5 rounded-md border-2 border-background-warm text-xs font-medium text-dark hover:border-primary/50 transition-colors"
            >
              <Columns size={14} aria-hidden="true" />
              Compare
            </button>
          </div>
          <p className="text-2xs text-dark-muted truncate" title={preview?.subject}><span className="font-medium text-dark">Subject:</span> {preview?.subject ?? '…'}</p>
          <iframe
            ref={previewFrame}
            onLoad={() => jumpPreview(sectionRef.current || GROUPS[0].title, false)}
            title="Booking confirmation email preview"
            // allow-same-origin (no scripts) lets this page scroll the email to the section being edited.
            sandbox="allow-same-origin"
            srcDoc={previewHtmlFor(darkPreview)}
            className={`w-full ${frame} flex-1 rounded-md border border-background-warm bg-white`}
          />
          <p className="text-2xs text-dark-muted">Sample traveller and payments; the real email uses each booking's details.{darkPreview ? ' Dark mode is how apps such as Apple Mail show it; Gmail darkens emails its own way.' : ''}</p>
        </section>
      </div>

      <Modal isOpen={compare} onClose={() => setCompare(false)} title="Compare light and dark" size="2xl">
        <p className="text-xs text-dark-muted truncate mb-2"><span className="font-medium text-dark">Subject:</span> {preview?.subject ?? '…'} · Scroll either side and both move together.</p>
        <div className="grid sm:grid-cols-2 gap-4">
          {([[false, 'Light mode'], [true, 'Dark mode']] as const).map(([dark, label], i) => (
            <figure key={label} className="m-0 space-y-1">
              <figcaption className="text-xs font-medium text-dark">{label}</figcaption>
              <iframe
                ref={el => { cmpRefs.current[i] = el; }}
                onLoad={() => wireSync(i)}
                title={`Booking confirmation email preview, ${label.toLowerCase()}`}
                // allow-same-origin (no scripts) lets this page read the scroll position so both sides can follow each other.
                sandbox="allow-same-origin"
                srcDoc={previewHtmlFor(dark)}
                className="w-full h-[calc(100vh-290px)] min-h-[320px] rounded-md border border-background-warm bg-white"
              />
            </figure>
          ))}
        </div>
      </Modal>

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
