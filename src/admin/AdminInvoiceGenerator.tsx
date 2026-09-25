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
// it's the real generated PDF, shown in an <iframe>, rebuilt (debounced)
// on every change. What the admin sees while typing is exactly what they
// get when they download.
import { useEffect, useRef, useState } from 'react';
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
} from '@phosphor-icons/react';
import AdminLayout from './AdminLayout';
import Button from '../components/ui/Button';
import DatePicker from '../components/ui/DatePicker';
import { useAlert } from '../components/ui/useAlert';
import { useConfirm } from '../components/ui/useConfirm';
import { FORM_INPUT_CLASS as inputClass } from '../constants/formStyles';
import {
  createEmptyLineItem,
  defaultInvoiceGeneratorData,
  downloadInvoiceGeneratorPdf,
  invoiceGeneratorPdfBlobUrl,
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

const BANK_FIELDS: { key: keyof InvoiceGeneratorBankDetails; label: string; placeholder: string }[] = [
  { key: 'accountNumber', label: 'Account Number', placeholder: 'e.g. 423801505983' },
  { key: 'ifscCode', label: 'IFSC Code', placeholder: 'e.g. ICIC0004238' },
  { key: 'bankName', label: 'Bank Name', placeholder: 'e.g. ICICI Bank' },
  { key: 'accountHolderName', label: 'Name', placeholder: 'e.g. Jini J Tracy' },
  { key: 'gpayNumber', label: 'GPAY No.', placeholder: 'e.g. 6383336772' },
];

// Debounce for the live preview rebuild — typing a full sentence
// shouldn't rebuild+re-render a PDF on every keystroke.
const PREVIEW_DEBOUNCE_MS = 500;

export default function AdminInvoiceGenerator() {
  const alert = useAlert();
  const confirm = useConfirm();
  const [data, setData] = useState<InvoiceGeneratorData>(() => defaultInvoiceGeneratorData());
  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);

  const total = invoiceGeneratorTotal(data.items);

  // ---- Field helpers ----
  const setField = <K extends keyof InvoiceGeneratorData>(key: K, value: InvoiceGeneratorData[K]) => {
    setData(prev => ({ ...prev, [key]: value }));
  };
  const setBankField = (key: keyof InvoiceGeneratorBankDetails, value: string) => {
    setData(prev => ({ ...prev, bank: { ...prev.bank, [key]: value } }));
  };
  const updateItem = (id: string, patch: Partial<InvoiceGeneratorData['items'][number]>) => {
    setData(prev => ({ ...prev, items: prev.items.map(it => (it.id === id ? { ...it, ...patch } : it)) }));
  };
  const addItem = () => {
    setData(prev => ({ ...prev, items: [...prev.items, createEmptyLineItem()] }));
  };
  const removeItem = (id: string) => {
    setData(prev => ({ ...prev, items: prev.items.length <= 1 ? prev.items : prev.items.filter(it => it.id !== id) }));
  };

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
        await alert("Couldn't look up the next invoice number. Please try again.");
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
      await alert("Couldn't look up the next invoice number. Please try again.");
    } finally {
      setNumberLoading(false);
    }
  };
  const handleNextInvoiceNumber = () => previewInvoiceNumber(data.invoiceNumberPrefix);

  const handleReset = () => {
    setData(defaultInvoiceGeneratorData());
    previewInvoiceNumber(DEFAULT_INVOICE_NUMBER_PREFIX);
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
      } catch (err) {
        console.error('Failed to load saved invoices', err);
      } finally {
        setHistoryLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    if (!data.invoiceNumber) return; // still waiting on the previewed number
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
      await alert({ message: 'Invoice saved.', variant: 'success' });
    } catch (err) {
      console.error('Failed to save invoice', err);
      await alert("Couldn't save this invoice. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Loads a saved invoice back into the form to reuse (same client, bank
  // details, line items…) for a new one. Reserves a fresh invoice number
  // rather than reusing the saved one, since that number was already used.
  const handleReuse = async (record: InvoiceGeneratorRecord) => {
    setData({
      invoiceTitle: record.invoice_title,
      invoiceSubtitle: record.invoice_subtitle,
      billingCompanyName: record.billing_company_name,
      billingAddress: record.billing_address,
      invoiceNumberPrefix: record.invoice_number_prefix || DEFAULT_INVOICE_NUMBER_PREFIX,
      invoiceNumber: '',
      invoiceDateISO: new Date().toISOString().slice(0, 10),
      items: record.items.length
        ? record.items.map(it => ({ ...createEmptyLineItem(), ...it }))
        : [createEmptyLineItem()],
      bank: { ...record.bank },
      signatoryName: record.signatory_name,
    });
    await previewInvoiceNumber(record.invoice_number_prefix || DEFAULT_INVOICE_NUMBER_PREFIX);
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
      await alert("Couldn't delete this invoice. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  // ---- Live PDF preview ----
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const previewUrlRef = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const url = await invoiceGeneratorPdfBlobUrl(data);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = url;
        setPreviewUrl(url);
        setPreviewError(false);
      } catch (err) {
        console.error('Failed to render invoice preview', err);
        if (!cancelled) setPreviewError(true);
      }
    }, PREVIEW_DEBOUNCE_MS);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [data]);

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadInvoiceGeneratorPdf(data);
    } catch (err) {
      console.error('Failed to generate invoice PDF', err);
      await alert("Couldn't generate the PDF. Please try again.");
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
      await alert("Couldn't open the PDF for printing. Please try again.");
    } finally {
      setPrinting(false);
    }
  };

  return (
    <AdminLayout title="Invoice Generator" subtitle="Fill in the details below to generate a printable invoice PDF">
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-6 items-start">
        {/* ---- Form ---- */}
        <div className="space-y-6 min-w-0">
          {/* Header details */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-lg shadow-card p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4">
              <div>
                <label htmlFor="inv-title" className="block text-sm font-medium text-dark mb-1">Invoice Title</label>
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
                <label htmlFor="inv-subtitle" className="block text-sm font-medium text-dark mb-1">Invoice Subtitle</label>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label htmlFor="inv-number-prefix" className="block text-sm font-medium text-dark mb-1">Invoice No.</label>
                <div className="flex gap-2">
                  <input
                    id="inv-number-prefix"
                    type="text"
                    value={data.invoiceNumberPrefix}
                    onChange={e => setField('invoiceNumberPrefix', e.target.value)}
                    className={`${inputClass} w-16 shrink-0 text-center`}
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
                    className={`${inputClass} flex-1 min-w-0 flex items-center bg-background-warm/60 text-dark-muted cursor-not-allowed select-text`}
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
                    className="shrink-0 inline-flex items-center justify-center w-10 rounded-md border-2 border-background-warm text-dark-muted hover:text-primary hover:border-primary/40 transition-colors disabled:opacity-40"
                  >
                    <NextNumber size={16} aria-hidden="true" className={numberLoading ? 'animate-spin' : undefined} />
                  </button>
                </div>
                <p className="text-2xs text-dark-muted mt-1">Auto-generated, in series with saved invoices (e.g. JJ001, JJ002…) — not editable.</p>
              </div>
              <div>
                <label htmlFor="inv-date" className="block text-sm font-medium text-dark mb-1">Invoice Date</label>
                <DatePicker
                  id="inv-date"
                  value={data.invoiceDateISO}
                  onChange={val => setField('invoiceDateISO', val)}
                />
              </div>
            </div>
          </motion.div>

          {/* Billing address */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-white rounded-lg shadow-card p-4 sm:p-6">
            <h3 className="font-display text-base sm:text-lg font-bold text-dark mb-4">Billing Address</h3>
            <div className="space-y-3 sm:space-y-4">
              <div>
                <label htmlFor="bill-name" className="block text-sm font-medium text-dark mb-1">Company / Client Name</label>
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
                <label htmlFor="bill-address" className="block text-sm font-medium text-dark mb-1">Address</label>
                <textarea
                  id="bill-address"
                  value={data.billingAddress}
                  onChange={e => setField('billingAddress', e.target.value)}
                  className={inputClass}
                  rows={4}
                  placeholder={'e.g. 739/3, Avinashi Road, Race Course Road\nWARD083, Coimbatore Racecourse,\nC2- Race Course, Coimbatore South,\nCoimbatore- 641018, Tamil Nadu'}
                />
                <p className="text-2xs text-dark-muted mt-1">Each new line here becomes its own line on the invoice.</p>
              </div>
            </div>
          </motion.div>

          {/* Line items */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-lg shadow-card p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="font-display text-base sm:text-lg font-bold text-dark">Line Items</h3>
              <Button variant="outline" size="sm" type="button" onClick={addItem}>
                <Plus size={13} aria-hidden="true" /> Add Item
              </Button>
            </div>
            <div className="space-y-3">
              {data.items.map((item, index) => (
                <div key={item.id} className="bg-background-warm rounded-lg p-3 sm:p-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
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
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_140px] gap-2.5">
                    <div>
                      <label htmlFor={`item-desc-${item.id}`} className="block text-2xs text-dark-muted mb-1">Description</label>
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
                      <label htmlFor={`item-sub-${item.id}`} className="block text-2xs text-dark-muted mb-1">Sub-description</label>
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
                      <label htmlFor={`item-amt-${item.id}`} className="block text-2xs text-dark-muted mb-1">Amount (INR)</label>
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
            <div className="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-background-warm">
              <span className="text-sm font-button font-bold text-dark">Total</span>
              <span className="font-display text-lg font-bold text-dark">{formatPrice(total)}</span>
            </div>
          </motion.div>

          {/* Bank details */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-white rounded-lg shadow-card p-4 sm:p-6">
            <h3 className="font-display text-base sm:text-lg font-bold text-dark mb-4">Bank Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {BANK_FIELDS.map(f => (
                <div key={f.key}>
                  <label htmlFor={`bank-${f.key}`} className="block text-sm font-medium text-dark mb-1">{f.label}</label>
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
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white rounded-lg shadow-card p-4 sm:p-6">
            <h3 className="font-display text-base sm:text-lg font-bold text-dark mb-4">Signature</h3>
            <div className="max-w-sm">
              <label htmlFor="signatory" className="block text-sm font-medium text-dark mb-1">Signatory Name</label>
              <input
                id="signatory"
                type="text"
                value={data.signatoryName}
                onChange={e => setField('signatoryName', e.target.value)}
                className={inputClass}
                placeholder="e.g. Jini J Tracy"
              />
              <p className="text-2xs text-dark-muted mt-1">Printed under the signature line at the bottom of the invoice. Defaults to the bank account Name above if left blank.</p>
            </div>
          </motion.div>

          {/* Actions — repeated here (in addition to the sticky preview
              panel's own buttons) so they're reachable without scrolling
              back up on narrower screens where the two columns stack. */}
          <div className="flex flex-col sm:flex-row gap-3 xl:hidden">
            <Button variant="primary" size="md" fullWidth onClick={handleDownload} loading={downloading}>
              <Download size={16} aria-hidden="true" /> Download PDF
            </Button>
            <Button variant="outline" size="md" fullWidth onClick={handlePrint} loading={printing}>
              <Printer size={16} aria-hidden="true" /> Print
            </Button>
            <Button variant="outline" size="md" fullWidth onClick={handleSave} loading={saving} disabled={numberLoading || !data.invoiceNumber}>
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
              className="w-full flex items-center justify-between gap-3 p-4 sm:p-6"
            >
              <h3 className="font-display text-base sm:text-lg font-bold text-dark flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
                  <History size={15} className="text-primary" aria-hidden="true" />
                </span>
                Saved Invoices
                {!historyLoading && history.length > 0 && (
                  <span className="text-2xs font-button font-semibold text-dark-muted bg-background-warm rounded-full px-2 py-0.5">{history.length}</span>
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
                  <div className="px-4 sm:px-6 pb-4 sm:pb-6 space-y-2">
                    {historyLoading ? (
                      <p className="text-xs text-dark-muted py-2">Loading saved invoices…</p>
                    ) : history.length === 0 ? (
                      <p className="text-xs text-dark-muted py-2">No invoices saved yet. Fill in the form and tap Save to keep one for later.</p>
                    ) : (
                      history.map(record => (
                        <div key={record.id} className="flex items-center justify-between gap-3 bg-background-warm rounded-lg p-3">
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
                              onClick={() => handleReuse(record)}
                              className="text-2xs font-button font-semibold text-primary hover:underline px-1.5 py-1"
                            >
                              Reuse
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
        <div className="xl:sticky xl:top-24">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-lg shadow-card p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2 mb-3 px-1">
              <p className="text-sm font-button font-bold text-dark">Preview</p>
              <p className="text-2xs text-dark-muted">Updates as you type</p>
            </div>
            <div className="rounded-md border border-background-warm bg-background-warm/40 overflow-hidden" style={{ aspectRatio: '595 / 842' }}>
              {previewError ? (
                <div className="w-full h-full flex items-center justify-center text-center text-dark-muted text-xs p-6">
                  Couldn't render the preview. Try Download or Print below — the PDF may still generate correctly.
                </div>
              ) : previewUrl ? (
                <iframe title="Invoice preview" src={previewUrl} className="w-full h-full border-0" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-dark-muted text-xs">Generating preview…</div>
              )}
            </div>
            <div className="hidden xl:flex flex-col gap-2 mt-4">
              <Button variant="primary" size="md" fullWidth onClick={handleDownload} loading={downloading}>
                <Download size={16} aria-hidden="true" /> Download PDF
              </Button>
              <Button variant="outline" size="md" fullWidth onClick={handlePrint} loading={printing}>
                <Printer size={16} aria-hidden="true" /> Print
              </Button>
              <Button variant="outline" size="md" fullWidth onClick={handleSave} loading={saving} disabled={numberLoading || !data.invoiceNumber}>
                <Save size={16} aria-hidden="true" /> Save Invoice
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    </AdminLayout>
  );
}
