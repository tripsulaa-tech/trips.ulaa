// Admin > Invoice Generator — a tool for putting together a one-off
// invoice: billing address, a short line-item table, bank details and a
// signatory, then downloading it (or printing it) as a PDF laid out to
// match the reference "Jini J Tracy" design exactly. See
// src/utils/invoiceGeneratorPdf.ts for the actual PDF drawing — this file
// is the form, the live preview, and the Save/Saved-Invoices UI.
//
// The invoice number is always assigned server-side (see
// getNextInvoiceGeneratorNumber in services/api/invoiceGenerator.ts and
// next_invoice_generator_number() in
// supabase/migration/add_invoice_generator_records.sql) and shown
// read-only — the admin can never type or edit it, so numbers can't
// collide or be reused by mistake.
//
// Saving an invoice (Save / Save Invoice buttons) persists the full form
// to the invoice_generator_invoices table so it shows up under "Saved
// Invoices" below and can be reloaded later — either just to look back at
// what was sent, or via "Reuse" to start a new invoice pre-filled with the
// same client/bank details.
//
// The preview on the right isn't a separate hand-built HTML mockup of the
// invoice (which could quietly drift from what the PDF actually renders):
// it's the real generated PDF, painted onto <canvas> pages (so it also works
// on phones, where browsers can't show a PDF in an <iframe>), rebuilt
// (debounced) on every change. What the admin sees while typing is exactly what they
// get when they download.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Plus,
  Trash as Trash2,
  DownloadSimple as Download,
  Printer,
  ArrowsClockwise as RotateCcw,
  ArrowClockwise as NextNumber,
  FloppyDisk as Save,
  ClockCounterClockwise as History,
  CaretDown as ChevronDown,
  CaretUp as ChevronUp,
  Eye,
  CopySimple as Reuse,
  X as Close,
  Eraser,
} from '@phosphor-icons/react';
import AdminLayout from './AdminLayout';
import InvoicePdfPreview from './InvoicePdfPreview';
import Button from '../components/ui/Button';
import DatePicker from '../components/ui/DatePicker';
import { useToast } from '../components/ui/useToast';
import { useConfirm } from '../components/ui/useConfirm';
import {
  createEmptyLineItem,
  defaultInvoiceGeneratorData,
  downloadInvoiceGeneratorPdf,
  invoiceGeneratorPdfBytes,
  invoiceGeneratorTotal,
  printInvoiceGeneratorPdf,
  DEFAULT_INVOICE_NUMBER_PREFIX,
  type InvoiceGeneratorData,
  type InvoiceGeneratorBankDetails,
} from '../utils/invoiceGeneratorPdf';
import { formatPrice, formatDate } from '../utils/utils-index';
import {
  getNextInvoiceGeneratorNumber,
  getInvoiceGeneratorInvoices,
  saveInvoiceGeneratorInvoice,
  deleteInvoiceGeneratorInvoice,
} from '../services/api';
import type { InvoiceGeneratorRecord } from '../types/types-index';
import { TIMING } from '../constants/limits';

import { readDraft, stableStringify, useDraftKeeper } from '../hooks/useSessionDraft';
// Same look as the shared admin input, with slimmer vertical padding for a denser page.
const inputClass = 'w-full px-3 py-1.5 rounded-md border-2 border-background-warm bg-background font-body text-dark text-sm focus:border-primary outline-none transition-colors';

const BANK_FIELDS: { key: keyof InvoiceGeneratorBankDetails; label: string; placeholder: string }[] = [
  { key: 'accountNumber', label: 'Account Number', placeholder: 'e.g. 423801505983' },
  { key: 'ifscCode', label: 'IFSC Code', placeholder: 'e.g. ICIC0004238' },
  { key: 'bankName', label: 'Bank Name', placeholder: 'e.g. ICICI Bank' },
  { key: 'accountHolderName', label: 'Name', placeholder: 'e.g. Jini J Tracy' },
  { key: 'gpayNumber', label: 'GPAY No.', placeholder: 'e.g. 6383336772' },
];

// The invoice being composed is kept for this browser tab while it differs from a fresh form, so
// leaving the page (or refreshing) and coming back finds it as it was left. The invoice number is
// left out on purpose: it is only a preview that is looked up again every time the page opens.
const INVOICE_DRAFT_KEY = 'invoice-generator';
// Set when the admin deliberately clears Bank Details, so reopening the page in this tab doesn't
// default them back in from the latest saved invoice.
const BANK_CLEARED_KEY = 'ulaa.invoiceBankCleared';
const bankClearedFlag = {
  get: () => { try { return window.sessionStorage.getItem(BANK_CLEARED_KEY) === '1'; } catch { return false; } },
  set: (on: boolean) => { try { if (on) window.sessionStorage.setItem(BANK_CLEARED_KEY, '1'); else window.sessionStorage.removeItem(BANK_CLEARED_KEY); } catch { /* ignore */ } },
};
const withoutNumber = (d: InvoiceGeneratorData): InvoiceGeneratorData => ({ ...d, invoiceNumber: '' });

// Invoice Details (title, subtitle, prefix) and Bank Details (incl. signatory)
// carried over from a saved invoice; billing address and line items are left as is.
// Saved bank details may come back from the database as JSON text, and individual fields may be
// null/blank; normalise to a plain object of strings so spreading it never produces garbage.
const normaliseBank = (raw: unknown): InvoiceGeneratorBankDetails => {
  let obj: unknown = raw;
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj); } catch { obj = {}; }
  }
  const base = defaultInvoiceGeneratorData().bank;
  const src = (obj && typeof obj === 'object' ? obj : {}) as Record<string, unknown>;
  const out = { ...base };
  (Object.keys(base) as (keyof InvoiceGeneratorBankDetails)[]).forEach(k => {
    const v = src[k];
    out[k] = v == null ? '' : String(v);
  });
  return out;
};
const bankIsEmpty = (b: Partial<InvoiceGeneratorBankDetails> | undefined | null) =>
  !b || Object.values(b).every(v => !String(v ?? '').trim());
// Fills only the blank bank fields from the latest saved invoice (never overwrites typed values).
const fillBankFromLatest = (d: InvoiceGeneratorData, r: InvoiceGeneratorRecord): InvoiceGeneratorData => {
  const saved = normaliseBank(r.bank);
  const merged = { ...d.bank };
  (Object.keys(saved) as (keyof InvoiceGeneratorBankDetails)[]).forEach(k => {
    if (!String(merged[k] ?? '').trim()) merged[k] = saved[k];
  });
  return { ...d, bank: merged };
};
const newestFirst = (rows: InvoiceGeneratorRecord[]) =>
  [...rows].sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
// The first saved invoice (newest at the top of Saved Invoices) that has any bank details filled in.
const firstWithBank = (rows: InvoiceGeneratorRecord[]) =>
  newestFirst(rows).find(r => !bankIsEmpty(normaliseBank(r.bank)));
const applyLatestDefaults = (d: InvoiceGeneratorData, r: InvoiceGeneratorRecord, bankFrom: InvoiceGeneratorRecord = r): InvoiceGeneratorData => ({
  ...d,
  invoiceTitle: r.invoice_title || d.invoiceTitle,
  invoiceSubtitle: r.invoice_subtitle || d.invoiceSubtitle,
  invoiceNumberPrefix: r.invoice_number_prefix || d.invoiceNumberPrefix,
  bank: normaliseBank(bankFrom.bank),
  signatoryName: r.signatory_name || d.signatoryName,
});

// Debounce for the live preview rebuild — typing a full sentence
// shouldn't rebuild+re-render a PDF on every keystroke.
const PREVIEW_DEBOUNCE_MS = TIMING.invoicePreviewDebounceMs;

export default function AdminInvoiceGenerator() {
  const toast = useToast();
  const confirm = useConfirm();
  // Starts from the invoice kept for this tab (if any), otherwise a fresh form.
  const [data, setData] = useState<InvoiceGeneratorData>(() => {
    const kept = readDraft<Partial<InvoiceGeneratorData>>(INVOICE_DRAFT_KEY);
    return withoutNumber({ ...defaultInvoiceGeneratorData(), ...kept } as InvoiceGeneratorData);
  });
  // What "nothing to keep" looks like: a fresh form (or, after Save, the invoice just saved).
  const [draftBase, setDraftBase] = useState(() => stableStringify(withoutNumber(defaultInvoiceGeneratorData())));
  const dataRef = useRef(data);
  dataRef.current = data;
  const draftValue = useMemo(() => withoutNumber(data), [data]);
  useDraftKeeper({ key: INVOICE_DRAFT_KEY, value: draftValue, base: draftBase });
  // Phones: the preview opens as a bottom sheet from a floating eye button instead of sitting at the bottom of the page.
  const [sheetOpen, setSheetOpen] = useState(false);
  useEffect(() => {
    if (!sheetOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSheetOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prevOverflow; window.removeEventListener('keydown', onKey); };
  }, [sheetOpen]);
  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [downloadingSavedId, setDownloadingSavedId] = useState<string | null>(null);

  const total = invoiceGeneratorTotal(data.items);

  // ---- Field helpers ----
  const setField = <K extends keyof InvoiceGeneratorData>(key: K, value: InvoiceGeneratorData[K]) => {
    setData(prev => ({ ...prev, [key]: value }));
  };
  const handleClearBank = () => {
    bankClearedFlag.set(true);
    setData(prev => ({ ...prev, bank: { accountNumber: '', ifscCode: '', bankName: '', accountHolderName: '', gpayNumber: '' } }));
  };
  const setBankField = (key: keyof InvoiceGeneratorBankDetails, value: string) => {
    bankClearedFlag.set(false);
    setData(prev => ({ ...prev, bank: { ...prev.bank, [key]: value } }));
  };
  const updateItem = (id: string, patch: Partial<InvoiceGeneratorData['items'][number]>) => {
    setData(prev => ({ ...prev, items: prev.items.map(it => (it.id === id ? { ...it, ...patch } : it)) }));
  };
  // After Add / Remove, scroll to the relevant row: Add jumps to the new item (and focuses its
  // description); Remove goes back to the item before the removed one (or the next, if it was first).
  const pendingScroll = useRef<{ id: string; focus: boolean } | null>(null);
  const addItem = () => {
    const newItem = createEmptyLineItem();
    pendingScroll.current = { id: newItem.id, focus: true };
    setData(prev => ({ ...prev, items: [...prev.items, newItem] }));
  };
  const removeItem = (id: string) => {
    const items = dataRef.current.items;
    if (items.length <= 1) return;
    const idx = items.findIndex(it => it.id === id);
    const target = items[idx - 1] ?? items[idx + 1];
    if (target) pendingScroll.current = { id: target.id, focus: false };
    setData(prev => ({ ...prev, items: prev.items.length <= 1 ? prev.items : prev.items.filter(it => it.id !== id) }));
  };
  useEffect(() => {
    const pending = pendingScroll.current;
    if (!pending) return;
    pendingScroll.current = null;
    const row = document.getElementById(`item-row-${pending.id}`);
    if (!row) return;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (pending.focus) {
      const input = document.getElementById(`item-desc-${pending.id}`) as HTMLInputElement | null;
      input?.focus({ preventScroll: true });
    }
  }, [data.items]);

  // ---- Invoice number — always server-assigned, never typed by the
  // admin. What's shown here before saving is only a *preview* of what the
  // next number will probably be (peeked from the database — see
  // getNextInvoiceGeneratorNumber's own doc comment); the number that
  // actually ends up on the invoice is assigned for real at the moment it's
  // saved (handleSave below), by a database trigger keyed off the saved
  // invoices themselves. That's what keeps the series (JJ001, JJ002,
  // JJ003…) gapless — it only advances when an invoice is actually saved,
  // never just from opening the form or abandoning a draft. ----
  // Starts true: the mount effect below always fetches a preview right
  // away, so the field shows "Generating…" from the first render instead
  // of flashing blank first.
  const [numberLoading, setNumberLoading] = useState(true);
  useEffect(() => {
    // Inlined (rather than calling a shared named function) so the effect
    // body's only direct action is kicking off this async IIFE — every
    // setState inside happens after its own await, never synchronously
    // as part of running the effect.
    (async () => {
      try {
        const number = await getNextInvoiceGeneratorNumber(DEFAULT_INVOICE_NUMBER_PREFIX);
        setField('invoiceNumber', number);
      } catch (err) {
        console.error('Failed to preview the next invoice number', err);
        toast.error("Couldn't look up the next invoice number. Please try again.");
      } finally {
        setNumberLoading(false);
      }
    })();
    // Only on mount — changing the prefix afterwards relabels the preview
    // already shown rather than re-fetching; tap "Refresh" to preview one
    // under the new prefix, or under the latest saved count if someone
    // else has saved since this page loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Used from click handlers (Refresh / Reset / Reuse) — setting state
  // synchronously first is fine here, unlike inside a useEffect.
  const previewInvoiceNumber = async (prefix: string) => {
    setNumberLoading(true);
    try {
      const number = await getNextInvoiceGeneratorNumber(prefix || DEFAULT_INVOICE_NUMBER_PREFIX);
      setField('invoiceNumber', number);
    } catch (err) {
      console.error('Failed to preview the next invoice number', err);
      toast.error("Couldn't look up the next invoice number. Please try again.");
    } finally {
      setNumberLoading(false);
    }
  };
  const handleNextInvoiceNumber = () => previewInvoiceNumber(data.invoiceNumberPrefix);

  const handleReset = () => {
    bankClearedFlag.set(false);
    const latest = newestFirst(history)[0];
    const fresh = latest ? applyLatestDefaults(defaultInvoiceGeneratorData(), latest, firstWithBank(history) ?? latest) : defaultInvoiceGeneratorData();
    setData(fresh);
    previewInvoiceNumber(fresh.invoiceNumberPrefix);
  };

  // ---- Save — persists the current invoice (services/api/invoiceGenerator.ts)
  // so it shows up in History below and can be reused later. ----
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<InvoiceGeneratorRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const rows = await getInvoiceGeneratorInvoices();
        setHistory(rows);
        // Latest = most recently saved (newest created_at first).
        const latest = newestFirst(rows)[0];
        const bankSource = firstWithBank(rows) ?? latest;
        // Default-fill Invoice Details and Bank Details from the latest
        // saved invoice, unless a kept draft / typed data is already there.
        const cur = dataRef.current;
        const pristine = !readDraft(INVOICE_DRAFT_KEY)
          && !cur.billingCompanyName && !cur.billingAddress
          && cur.items.every(it => !it.description && !it.subDescription && !it.amount)
          && Object.values(cur.bank).every(v => !v);
        if (latest && pristine) {
          const next = applyLatestDefaults(cur, latest, bankSource);
          setData(next);
          setDraftBase(stableStringify(withoutNumber(next)));
          if (next.invoiceNumberPrefix !== cur.invoiceNumberPrefix) previewInvoiceNumber(next.invoiceNumberPrefix);
        } else if (latest && bankIsEmpty(cur.bank) && !bankClearedFlag.get()) {
          // A kept draft / partly typed form is open, but its bank details are blank:
          // still default them from the latest saved invoice (keeps everything else as is).
          setData(prev => bankIsEmpty(prev.bank) ? fillBankFromLatest(prev, bankSource) : prev);
        }
      } catch (err) {
        console.error('Failed to load saved invoices', err);
      } finally {
        setHistoryLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    if (!data.invoiceNumber) return; // still waiting on the previewed number
    if (stableStringify(draftValue) === draftBase) {
      toast.info('No changes to save.');
      return;
    }
    // Block saving an invoice whose content already exists in Saved Invoices
    // (invoice number and date are ignored in the comparison).
    const norm = (v: string) => (v || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const contentKey = (o: {
      company: string; address: string; title: string; subtitle: string; signatory: string;
      items: { description: string; subDescription?: string; amount: number }[];
      bank: unknown;
    }) => JSON.stringify([
      norm(o.company), norm(o.address), norm(o.title), norm(o.subtitle), norm(o.signatory),
      o.items.map(i => [norm(i.description), norm(i.subDescription || ''), Number(i.amount) || 0]),
      o.bank,
    ]);
    const currentKey = contentKey({
      company: data.billingCompanyName, address: data.billingAddress,
      title: data.invoiceTitle, subtitle: data.invoiceSubtitle, signatory: data.signatoryName,
      items: data.items, bank: data.bank,
    });
    const duplicate = history.find(r => contentKey({
      company: r.billing_company_name, address: r.billing_address,
      title: r.invoice_title, subtitle: r.invoice_subtitle, signatory: r.signatory_name,
      items: r.items, bank: r.bank,
    }) === currentKey);
    if (duplicate) {
      toast.error(`An identical invoice already exists (${duplicate.invoice_number}).`);
      return;
    }
    setSaving(true);
    try {
      const saved = await saveInvoiceGeneratorInvoice({
        invoice_number: data.invoiceNumber, // ignored by the DB — the trigger assigns the real one
        invoice_number_prefix: data.invoiceNumberPrefix || DEFAULT_INVOICE_NUMBER_PREFIX,
        invoice_title: data.invoiceTitle,
        invoice_subtitle: data.invoiceSubtitle,
        billing_company_name: data.billingCompanyName,
        billing_address: data.billingAddress,
        invoice_date: data.invoiceDateISO,
        items: data.items.map(({ description, subDescription, amount }) => ({ description, subDescription, amount })),
        bank: data.bank,
        signatory_name: data.signatoryName,
        total,
      });
      setHistory(prev => [saved, ...prev]);
      // The DB trigger is the source of truth for the number — adopt
      // whatever it actually assigned (almost always what was already
      // previewed, but this stays correct even in the rare case another
      // admin saved one in between and the series moved on).
      setField('invoiceNumber', saved.invoice_number);
      // Saved: nothing left to keep for this tab.
      setDraftBase(stableStringify(withoutNumber(data)));
      toast.success(`Invoice ${saved.invoice_number} saved.`);
    } catch (err) {
      console.error('Failed to save invoice', err);
      toast.error("Couldn't save this invoice.", { action: { label: 'Try again', onClick: () => { void handleSave(); } } });
    } finally {
      setSaving(false);
    }
  };

  // Loads a saved invoice back into the form to reuse (same client, bank
  // details, line items…) for a new one. Reserves a fresh invoice number
  // rather than reusing the saved one, since that number was already used.
  const handleReuse = async (record: InvoiceGeneratorRecord) => {
    bankClearedFlag.set(false);
    const prefix = record.invoice_number_prefix || DEFAULT_INVOICE_NUMBER_PREFIX;
    // Saved items may be stored as JSON text or lack ids, so normalise them.
    const rawItems = typeof record.items === 'string' ? JSON.parse(record.items as unknown as string) : record.items;
    const items = Array.isArray(rawItems) && rawItems.length
      ? rawItems.map((it: Partial<InvoiceGeneratorRecord['items'][number]>) => ({
          ...createEmptyLineItem(),
          description: it.description ?? '',
          subDescription: it.subDescription ?? '',
          amount: Number(it.amount) || 0,
        }))
      : [createEmptyLineItem()];
    setData(prev => ({
      ...prev,
      invoiceTitle: record.invoice_title ?? '',
      invoiceSubtitle: record.invoice_subtitle ?? '',
      billingCompanyName: record.billing_company_name ?? '',
      billingAddress: record.billing_address ?? '',
      invoiceNumberPrefix: prefix,
      invoiceNumber: '',
      invoiceDateISO: new Date().toISOString().slice(0, 10),
      items,
      bank: normaliseBank(record.bank),
      signatoryName: record.signatory_name ?? '',
    }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast.success('Invoice details loaded. Check the form above.');
    await previewInvoiceNumber(prefix);
  };

  // Downloads a saved invoice exactly as it was saved (its own number and
  // date), without touching the form.
  const handleDownloadSaved = async (record: InvoiceGeneratorRecord) => {
    setDownloadingSavedId(record.id);
    try {
      await downloadInvoiceGeneratorPdf({
        invoiceTitle: record.invoice_title,
        invoiceSubtitle: record.invoice_subtitle,
        billingCompanyName: record.billing_company_name,
        billingAddress: record.billing_address,
        invoiceNumberPrefix: record.invoice_number_prefix || DEFAULT_INVOICE_NUMBER_PREFIX,
        invoiceNumber: record.invoice_number,
        invoiceDateISO: record.invoice_date,
        items: record.items.length
          ? record.items.map(it => ({ ...createEmptyLineItem(), ...it }))
          : [createEmptyLineItem()],
        bank: normaliseBank(record.bank),
        signatoryName: record.signatory_name,
      });
    } catch (err) {
      console.error('Failed to download saved invoice', err);
      toast.error("Couldn't generate the PDF. Please try again.");
    } finally {
      setDownloadingSavedId(null);
    }
  };

  const handleDeleteSaved = async (id: string) => {
    const ok = await confirm({ message: 'Delete this saved invoice? This cannot be undone.', variant: 'danger' });
    if (!ok) return;
    setDeletingId(id);
    try {
      await deleteInvoiceGeneratorInvoice(id);
      setHistory(prev => prev.filter(h => h.id !== id));
    } catch (err) {
      console.error('Failed to delete saved invoice', err);
      toast.error("Couldn't delete this invoice. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  // ---- Live PDF preview ----
  const [previewBytes, setPreviewBytes] = useState<ArrayBuffer | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const handlePreviewDrawError = useCallback(() => setPreviewError(true), []);
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const bytes = await invoiceGeneratorPdfBytes(data);
        if (cancelled) return;
        setPreviewBytes(bytes);
        setPreviewError(false);
      } catch (err) {
        console.error('Failed to render invoice preview', err);
        if (!cancelled) setPreviewError(true);
      }
    }, PREVIEW_DEBOUNCE_MS);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [data]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadInvoiceGeneratorPdf(data);
    } catch (err) {
      console.error('Failed to generate invoice PDF', err);
      toast.error("Couldn't generate the PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = async () => {
    setPrinting(true);
    try {
      await printInvoiceGeneratorPdf(data);
    } catch (err) {
      console.error('Failed to open invoice PDF for printing', err);
      toast.error("Couldn't open the PDF for printing. Please try again.");
    } finally {
      setPrinting(false);
    }
  };

  const previewBox = (
    <div className="rounded-md border border-background-warm bg-background-warm/40 overflow-hidden" style={{ aspectRatio: '595 / 842' }}>
      {previewError ? (
        <div className="w-full h-full flex items-center justify-center text-center text-dark-muted text-xs p-6">
          Couldn't render the preview. Try Download or Print — the PDF may still generate correctly.
        </div>
      ) : previewBytes ? (
        <InvoicePdfPreview data={previewBytes} onError={handlePreviewDrawError} />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-dark-muted text-xs">Generating preview…</div>
      )}
    </div>
  );

  return (
    <AdminLayout title="Invoice Generator" subtitle="Fill in the details below to generate a printable invoice PDF">
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-4 items-start pb-16 xl:pb-0">
        {/* ---- Form ---- */}
        <div className="space-y-3 min-w-0">
          {/* Header details */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-lg shadow-card p-3 sm:p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="font-display text-base sm:text-lg font-bold text-dark flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
                  <FileText size={15} className="text-primary" aria-hidden="true" />
                </span>
                Invoice Details
              </h3>
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 text-xs font-button font-semibold text-dark-muted hover:text-primary transition-colors"
              >
                <RotateCcw size={13} aria-hidden="true" /> Reset
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:gap-3 mb-3">
              <div>
                <label htmlFor="inv-title" className="block text-sm font-medium text-dark mb-0.5">Invoice Title</label>
                <input
                  id="inv-title"
                  type="text"
                  value={data.invoiceTitle}
                  onChange={e => setField('invoiceTitle', e.target.value)}
                  className={inputClass}
                  placeholder="e.g. Jini J Tracy"
                />
              </div>
              <div>
                <label htmlFor="inv-subtitle" className="block text-sm font-medium text-dark mb-0.5">Invoice Subtitle</label>
                <input
                  id="inv-subtitle"
                  type="text"
                  value={data.invoiceSubtitle}
                  onChange={e => setField('invoiceSubtitle', e.target.value)}
                  className={inputClass}
                  placeholder="e.g. ORGANIC VIDEO"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
              <div className="min-w-0">
                <label htmlFor="inv-number-prefix" className="block text-sm font-medium text-dark mb-0.5">Invoice No.</label>
                <div className="flex gap-1.5 sm:gap-2">
                  <input
                    id="inv-number-prefix"
                    type="text"
                    value={data.invoiceNumberPrefix}
                    onChange={e => setField('invoiceNumberPrefix', e.target.value)}
                    className={`${inputClass} !w-11 sm:!w-14 shrink-0 !px-1 text-center`}
                    placeholder="JJ"
                    aria-label="Invoice number prefix"
                    title="Invoice number prefix"
                  />
                  {/* Auto-generated server-side and never typed in — a
                      plain read-only display, not an input. The number is
                      only finalized when the invoice is actually saved
                      (see handleSave); what's shown before that is a live
                      preview of the next one in the series. */}
                  <div
                    className={`${inputClass} flex-1 min-w-0 flex items-center truncate !px-2 sm:!px-3 bg-background-warm/60 text-dark-muted cursor-not-allowed select-text`}
                    aria-label="Invoice number (auto-generated)"
                    title="Auto-generated — not editable"
                  >
                    {numberLoading ? 'Generating…' : data.invoiceNumber || '—'}
                  </div>
                  <button
                    type="button"
                    onClick={handleNextInvoiceNumber}
                    disabled={numberLoading}
                    title="Refresh — check the next number in the series"
                    aria-label="Refresh invoice number preview"
                    className="shrink-0 inline-flex items-center justify-center w-8 sm:w-9 rounded-md border-2 border-background-warm text-dark-muted hover:text-primary hover:border-primary/40 transition-colors disabled:opacity-40"
                  >
                    <NextNumber size={16} aria-hidden="true" className={numberLoading ? 'animate-spin' : undefined} />
                  </button>
                </div>
                <p className="hidden sm:block text-2xs text-dark-muted mt-0.5">Auto-generated in series (e.g. JJ001, JJ002). Not editable.</p>
              </div>
              <div className="min-w-0">
                <label htmlFor="inv-date" className="block text-sm font-medium text-dark mb-0.5">Invoice Date</label>
                <DatePicker
                  id="inv-date"
                  className="!py-1.5 !px-2.5 sm:!px-3"
                  value={data.invoiceDateISO}
                  onChange={val => setField('invoiceDateISO', val)}
                />
              </div>
            </div>
          </motion.div>

          {/* Billing address */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-white rounded-lg shadow-card p-3 sm:p-4">
            <h3 className="font-display text-base sm:text-lg font-bold text-dark mb-3">Billing Address</h3>
            <div className="space-y-2.5">
              <div>
                <label htmlFor="bill-name" className="block text-sm font-medium text-dark mb-0.5">Company / Client Name</label>
                <input
                  id="bill-name"
                  type="text"
                  value={data.billingCompanyName}
                  onChange={e => setField('billingCompanyName', e.target.value)}
                  className={inputClass}
                  placeholder="e.g. CBE MND FASHION LLP"
                />
              </div>
              <div>
                <label htmlFor="bill-address" className="block text-sm font-medium text-dark mb-0.5">Address</label>
                <textarea
                  id="bill-address"
                  value={data.billingAddress}
                  onChange={e => setField('billingAddress', e.target.value)}
                  className={inputClass}
                  rows={3}
                  placeholder={'e.g. 739/3, Avinashi Road, Race Course Road\nWARD083, Coimbatore Racecourse,\nC2- Race Course, Coimbatore South,\nCoimbatore- 641018, Tamil Nadu'}
                />
                <p className="text-2xs text-dark-muted mt-0.5">Each new line here becomes its own line on the invoice.</p>
              </div>
            </div>
          </motion.div>

          {/* Line items */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-lg shadow-card p-3 sm:p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="font-display text-base sm:text-lg font-bold text-dark">Line Items</h3>
              <Button variant="outline" size="sm" type="button" onClick={addItem} aria-label="Add item" title="Add item">
                <Plus size={16} aria-hidden="true" /> <span>Add Item</span>
              </Button>
            </div>
            <div className="space-y-2">
              {data.items.map((item, index) => (
                <div key={item.id} id={`item-row-${item.id}`} className="bg-background-warm rounded-lg p-2.5 sm:p-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-2xs font-button font-bold text-dark-muted">Item {index + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      disabled={data.items.length <= 1}
                      className="inline-flex items-center gap-1 text-2xs font-button font-semibold text-dark-muted hover:text-red-600 disabled:opacity-30 disabled:hover:text-dark-muted transition-colors"
                    >
                      <Trash2 size={12} aria-hidden="true" /> Remove
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_130px] gap-2">
                    <div className="col-span-2 sm:col-span-1">
                      <label htmlFor={`item-desc-${item.id}`} className="block text-2xs text-dark-muted mb-0.5">Description</label>
                      <input
                        id={`item-desc-${item.id}`}
                        type="text"
                        value={item.description}
                        onChange={e => updateItem(item.id, { description: e.target.value })}
                        className={inputClass}
                        placeholder="e.g. MEND Promotion"
                      />
                    </div>
                    <div>
                      <label htmlFor={`item-sub-${item.id}`} className="block text-2xs text-dark-muted mb-0.5">Sub-description</label>
                      <input
                        id={`item-sub-${item.id}`}
                        type="text"
                        value={item.subDescription}
                        onChange={e => updateItem(item.id, { subDescription: e.target.value })}
                        className={inputClass}
                        placeholder="e.g. Sub"
                      />
                    </div>
                    <div>
                      <label htmlFor={`item-amt-${item.id}`} className="block text-2xs text-dark-muted mb-0.5">Amount (INR)</label>
                      <input
                        id={`item-amt-${item.id}`}
                        type="number"
                        inputMode="decimal"
                        value={item.amount || ''}
                        onChange={e => updateItem(item.id, { amount: Number(e.target.value) || 0 })}
                        className={inputClass}
                        placeholder="0"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-background-warm">
              <span className="text-sm font-button font-bold text-dark">Total</span>
              <span className="font-display text-lg font-bold text-dark">{formatPrice(total)}</span>
            </div>
          </motion.div>

          {/* Bank details */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-white rounded-lg shadow-card p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="font-display text-base sm:text-lg font-bold text-dark">Bank Details</h3>
              <button
                type="button"
                onClick={handleClearBank}
                disabled={bankIsEmpty(data.bank)}
                title="Clear bank details"
                aria-label="Clear bank details"
                className="p-1.5 rounded-md text-dark-muted hover:text-primary hover:bg-background-warm transition-colors disabled:opacity-40 disabled:pointer-events-none"
              >
                <Eraser size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
              {BANK_FIELDS.map(f => (
                <div key={f.key}>
                  <label htmlFor={`bank-${f.key}`} className="block text-sm font-medium text-dark mb-0.5">{f.label}</label>
                  <input
                    id={`bank-${f.key}`}
                    type="text"
                    value={data.bank[f.key]}
                    onChange={e => setBankField(f.key, e.target.value)}
                    className={inputClass}
                    placeholder={f.placeholder}
                  />
                </div>
              ))}
            </div>
          </motion.div>

          {/* Signatory */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white rounded-lg shadow-card p-3 sm:p-4">
            <h3 className="font-display text-base sm:text-lg font-bold text-dark mb-3">Signature</h3>
            <div className="max-w-sm">
              <label htmlFor="signatory" className="block text-sm font-medium text-dark mb-0.5">Signatory Name</label>
              <input
                id="signatory"
                type="text"
                value={data.signatoryName}
                onChange={e => setField('signatoryName', e.target.value)}
                className={inputClass}
                placeholder="e.g. Jini J Tracy"
              />
              <p className="text-2xs text-dark-muted mt-0.5">Printed under the signature line. Defaults to the bank account name if blank.</p>
            </div>
          </motion.div>

          {/* Actions — repeated here (in addition to the sticky preview
              panel's own buttons) so they're reachable without scrolling
              back up on narrower screens where the two columns stack. */}
          <div className="grid grid-cols-3 gap-2 xl:hidden">
            <Button variant="primary" size="sm" fullWidth className="!min-h-[40px] !py-1.5" onClick={handleDownload} loading={downloading}>
              <Download size={16} aria-hidden="true" /> Download<span className="hidden sm:inline"> PDF</span>
            </Button>
            <Button variant="outline" size="sm" fullWidth className="!min-h-[40px] !py-1.5" onClick={handlePrint} loading={printing}>
              <Printer size={16} aria-hidden="true" /> Print
            </Button>
            <Button variant="outline" size="sm" fullWidth className="!min-h-[40px] !py-1.5" onClick={handleSave} loading={saving} disabled={numberLoading || !data.invoiceNumber}>
              <Save size={16} aria-hidden="true" /> Save
            </Button>
          </div>

          {/* Saved invoices — persisted via services/api/invoiceGenerator.ts
              (invoice_generator_invoices table) so a past invoice can be
              reused as the starting point for a new one instead of
              re-typing billing/bank details every time. */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="bg-white rounded-lg shadow-card overflow-hidden">
            <button
              type="button"
              onClick={() => setHistoryExpanded(v => !v)}
              className="w-full flex items-center justify-between gap-3 p-3 sm:p-4"
            >
              <h3 className="font-display text-base sm:text-lg font-bold text-dark flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
                  <History size={15} className="text-primary" aria-hidden="true" />
                </span>
                Saved Invoices
                {!historyLoading && history.length > 0 && (
                  <span className="text-2xs font-button font-semibold text-dark-muted bg-background-warm rounded-md px-2 py-0.5">{history.length}</span>
                )}
              </h3>
              {historyExpanded ? <ChevronUp size={16} className="text-dark-muted shrink-0" aria-hidden="true" /> : <ChevronDown size={16} className="text-dark-muted shrink-0" aria-hidden="true" />}
            </button>
            <AnimatePresence initial={false}>
              {historyExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-1.5">
                    {historyLoading ? (
                      <p className="text-xs text-dark-muted py-2">Loading saved invoices…</p>
                    ) : history.length === 0 ? (
                      <p className="text-xs text-dark-muted py-2">No invoices saved yet. Fill in the form and tap Save to keep one for later.</p>
                    ) : (
                      history.map(record => (
                        <div key={record.id} className="flex items-center justify-between gap-3 bg-background-warm rounded-lg px-3 py-2">
                          <div className="min-w-0">
                            <p className="text-sm font-button font-bold text-dark truncate">
                              {record.invoice_number} — {record.billing_company_name || record.invoice_title || 'Untitled'}
                            </p>
                            <p className="text-2xs text-dark-muted">
                              {formatDate(record.invoice_date, { day: 'numeric', month: 'short', year: 'numeric' })} · {formatPrice(record.total)}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleDownloadSaved(record)}
                              disabled={downloadingSavedId === record.id}
                              aria-label="Download saved invoice"
                              className="inline-flex items-center justify-center w-7 h-7 rounded-md text-primary hover:bg-white disabled:opacity-40 transition-colors"
                            >
                              <Download size={14} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReuse(record)}
                              aria-label="Reuse this invoice"
                              title="Reuse"
                              className="inline-flex items-center justify-center gap-1 max-sm:w-7 max-sm:h-7 max-sm:rounded-md max-sm:hover:bg-white text-2xs font-button font-semibold text-primary sm:hover:underline sm:px-1.5 sm:py-1"
                            >
                              <Reuse size={14} className="sm:hidden" aria-hidden="true" />
                              <span className="hidden sm:inline">Reuse</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSaved(record.id)}
                              disabled={deletingId === record.id}
                              aria-label="Delete saved invoice"
                              className="inline-flex items-center justify-center w-7 h-7 rounded-md text-dark-muted hover:text-red-600 disabled:opacity-40 transition-colors"
                            >
                              <Trash2 size={13} aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>

        {/* ---- Live preview — the actual generated PDF, not a mockup ---- */}
        <div className="hidden xl:block xl:sticky xl:top-20">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-lg shadow-card p-3">
            <div className="flex items-center justify-between gap-2 mb-2 px-1">
              <p className="text-sm font-button font-bold text-dark">Preview</p>
              <p className="text-2xs text-dark-muted">Updates as you type</p>
            </div>
            {previewBox}
            <div className="hidden xl:grid grid-cols-2 gap-2 mt-3">
              <Button variant="primary" size="sm" fullWidth className="!min-h-[40px] !py-1.5 col-span-2" onClick={handleDownload} loading={downloading}>
                <Download size={16} aria-hidden="true" /> Download PDF
              </Button>
              <Button variant="outline" size="sm" fullWidth className="!min-h-[40px] !py-1.5" onClick={handlePrint} loading={printing}>
                <Printer size={16} aria-hidden="true" /> Print
              </Button>
              <Button variant="outline" size="sm" fullWidth className="!min-h-[40px] !py-1.5" onClick={handleSave} loading={saving} disabled={numberLoading || !data.invoiceNumber}>
                <Save size={16} aria-hidden="true" /> Save
              </Button>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Phones: a single floating Preview (eye) button. */}
      <motion.button
        type="button"
        onClick={() => setSheetOpen(true)}
        aria-label="Preview"
        title="Preview"
        whileTap={{ scale: 0.92 }}
        className="xl:hidden fixed right-4 bottom-5 z-30 w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center shadow-warm-lg"
      >
        <Eye size={22} weight="bold" aria-hidden="true" />
      </motion.button>
      <AnimatePresence>
        {sheetOpen && (
          <div className="xl:hidden fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true" aria-label="Invoice preview">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-dark/50"
              onClick={() => setSheetOpen(false)}
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'tween', duration: 0.22 }}
              className="relative w-full max-h-[92dvh] flex flex-col bg-white rounded-t-2xl shadow-warm-lg"
            >
              <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2 shrink-0">
                <div>
                  <p className="text-sm font-button font-bold text-dark">Preview</p>
                  <p className="text-2xs text-dark-muted">Updates as you type</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSheetOpen(false)}
                  aria-label="Close preview"
                  className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-background-warm text-dark"
                >
                  <Close size={16} weight="bold" aria-hidden="true" />
                </button>
              </div>
              <div className="overflow-y-auto px-4 pb-2 min-h-0">{previewBox}</div>
              <div className="grid grid-cols-3 gap-2 px-4 pt-2 pb-4 shrink-0 border-t border-background-warm">
                <Button variant="primary" size="sm" fullWidth className="!min-h-[40px] !py-1.5" onClick={handleDownload} loading={downloading}>
                  <Download size={16} aria-hidden="true" /> Download
                </Button>
                <Button variant="outline" size="sm" fullWidth className="!min-h-[40px] !py-1.5" onClick={handlePrint} loading={printing}>
                  <Printer size={16} aria-hidden="true" /> Print
                </Button>
                <Button variant="outline" size="sm" fullWidth className="!min-h-[40px] !py-1.5" onClick={handleSave} loading={saving} disabled={numberLoading || !data.invoiceNumber}>
                  <Save size={16} aria-hidden="true" /> Save
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </AdminLayout>
  );
}
