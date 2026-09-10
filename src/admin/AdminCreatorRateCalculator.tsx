// Creator Commercial Rate Calculator — admin tool for working out what to
// pay/quote an Instagram creator for a collaboration, ported 1:1 from the
// "Creator_Rate_Calculator_final.xlsx" spreadsheet (Rate Calculator +
// Model Settings tabs). All formulas below mirror that workbook's cells
// exactly (see comments citing the original cell refs) so the numbers this
// page produces match the spreadsheet for the same inputs.
//
// Unlike the spreadsheet, every calculation run here can be saved
// (creator_rate_calculations table — see
// supabase/migration/add_creator_rate_calculations.sql) so past quotes are
// a real, searchable record rather than disappearing the moment the page
// is closed. Both the raw inputs and every derived output are stored
// together, so a saved row stays an accurate record of what was actually
// quoted even if the niche benchmarks or multiplier tiers are tuned later.
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calculator,
  Users,
  Eye,
  ChartLineUp,
  Target,
  ArrowsClockwise as RotateCcw,
  Info,
  FloppyDisk as Save,
  ClockCounterClockwise as History,
  Trash as Trash2,
  CaretDown as ChevronDown,
  CaretUp as ChevronUp,
  InstagramLogo as Instagram,
  Phone,
  ClipboardText,
  Copy,
  WhatsappLogo,
  Check,
} from '@phosphor-icons/react';
import AdminLayout from './AdminLayout';
import Select from '../components/ui/Select';
import Button from '../components/ui/Button';
import { useAlert } from '../components/ui/useAlert';
import { useConfirm } from '../components/ui/useConfirm';
import { formatPrice, formatDate, getWhatsAppLink } from '../utils/utils-index';
import { FORM_INPUT_CLASS as inputClass } from '../constants/formStyles';
import { getCreatorRateCalculations, saveCreatorRateCalculation, deleteCreatorRateCalculation } from '../services/api';
import type { CreatorRateCalculation, CreatorRateAsset } from '../types/types-index';

// ---- Model Settings tab, columns A:B (Niche → CPV Benchmark) ----
const NICHE_CPV_BENCHMARKS: { niche: string; cpv: number }[] = [
  { niche: 'Finance / Fintech', cpv: 0.75 },
  { niche: 'Tech', cpv: 0.65 },
  { niche: 'Business / Entrepreneurship', cpv: 0.65 },
  { niche: 'Beauty / Fashion', cpv: 0.475 },
  { niche: 'Travel & Lifestyle', cpv: 0.5 },
  { niche: 'Food', cpv: 0.375 },
  { niche: 'Comedy / Entertainment', cpv: 0.25 },
  { niche: 'Gaming', cpv: 0.25 },
  { niche: 'Education', cpv: 0.5 },
  { niche: 'Health / Wellness', cpv: 0.45 },
];

const NICHE_OPTIONS = NICHE_CPV_BENCHMARKS.map(n => ({ value: n.niche, label: n.niche }));

const REEL_COUNT = 10;

// Default identity fields, so the common case (quoting the same test/house
// creator) doesn't need retyping every time — still fully editable, and
// Reset restores these rather than blanking them out.
const DEFAULT_CREATOR_NAME = 'Jini';
const DEFAULT_INSTAGRAM_HANDLE = '@justjini_';
const DEFAULT_PHONE = '6383336772';

// Pulls every view-count-looking token out of pasted text, so a Reel field
// can accept a whole column copied from Instagram Insights or a
// spreadsheet (one value per line, comma/tab separated, etc.) instead of
// forcing the admin to enter all 10 values one at a time. Handles thousand
// separators ("12,345") and shorthand suffixes ("12.3k", "1.1M").
function extractViewNumbers(text: string): number[] {
  const matches = text.match(/-?\d[\d,]*(?:\.\d+)?\s*[kKmM]?/g) || [];
  return matches
    .map(raw => {
      const cleaned = raw.replace(/,/g, '').trim();
      const m = cleaned.match(/^(-?\d+(?:\.\d+)?)\s*([kKmM])?$/);
      if (!m) return null;
      let value = parseFloat(m[1]);
      if (Number.isNaN(value)) return null;
      const suffix = m[2]?.toLowerCase();
      if (suffix === 'k') value *= 1_000;
      if (suffix === 'm') value *= 1_000_000;
      return Math.round(value);
    })
    .filter((n): n is number => n !== null);
}

// Rate Calculator!H8 — tiered View/Follower Ratio → Quality Multiplier,
// straight from the nested IF in that cell (equivalent to the lookup table
// on Model Settings!D:E).
function viewQualityMultiplier(ratio: number): number {
  if (ratio < 0.2) return 0.25;
  if (ratio < 0.4) return 0.4;
  if (ratio < 0.6) return 0.6;
  if (ratio < 0.8) return 0.8;
  if (ratio < 1) return 0.9;
  if (ratio < 1.25) return 0.92;
  if (ratio < 1.5) return 0.96;
  return 1;
}

// Excel FLOOR(x, 50) / CEILING(x, 50) — round down/up to the nearest ₹50,
// used throughout the "Final Commercials" section of the sheet.
function floorTo50(x: number): number {
  return Math.floor(x / 50) * 50;
}
function ceilTo50(x: number): number {
  return Math.ceil(x / 50) * 50;
}

// Turns a saved calculation into a ready-to-send message — this is the
// piece the admin actually hands to the creator (via Copy or WhatsApp
// Share on each saved row), so it stays plain text/emoji only, no app
// jargon like "CPV" or "quality multiplier".
function formatCalculationMessage(h: CreatorRateCalculation): string {
  const greeting = h.creator_name ? `Hi ${h.creator_name.trim().split(/\s+/)[0]}! 👋` : 'Hi! 👋';
  const lines = h.final_commercials.map(row => `• ${row.asset}: ${formatPrice(row.min)} – ${formatPrice(row.max)}`);
  return [
    `${greeting} Here's the commercial rate card for your ${h.niche} content (${h.follower_count.toLocaleString('en-IN')} followers):`,
    '',
    ...lines,
    '',
    'These are our suggested ranges — happy to discuss and finalise. Let us know your thoughts!',
    '— Team ULAA',
  ].join('\n');
}

export default function AdminCreatorRateCalculator() {
  const alert = useAlert();
  const confirm = useConfirm();

  // ---- Identity (saved alongside the calculation, optional) ----
  const [creatorName, setCreatorName] = useState(DEFAULT_CREATOR_NAME);
  const [instagramHandle, setInstagramHandle] = useState(DEFAULT_INSTAGRAM_HANDLE);
  const [phone, setPhone] = useState(DEFAULT_PHONE);
  const [notes, setNotes] = useState('');

  // ---- Calculator inputs ----
  const [followerCount, setFollowerCount] = useState<string>('');
  const [reelViews, setReelViews] = useState<string[]>(Array(REEL_COUNT).fill(''));
  const [niche, setNiche] = useState<string>(NICHE_OPTIONS[0].value);
  const reelInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const followers = Number(followerCount) || 0;
  const views = reelViews.map(v => Number(v) || 0);
  const reelsEntered = views.filter(v => v > 0).length;

  const result = useMemo(() => {
    // Rate Calculator!H5 — AVERAGE(B6:B15)
    const avgViews = views.length ? views.reduce((s, v) => s + v, 0) / views.length : 0;
    // Rate Calculator!H6 — IFERROR(H5/B5, 0)
    const viewFollowerRatio = followers > 0 ? avgViews / followers : 0;
    // Rate Calculator!H7 — VLOOKUP(niche, Model Settings!I2:J11, 2, FALSE)
    const nicheCpv = NICHE_CPV_BENCHMARKS.find(n => n.niche === niche)?.cpv ?? 0;
    // Rate Calculator!H8
    const qualityMultiplier = viewQualityMultiplier(viewFollowerRatio);
    // Rate Calculator!H9 — B5*H7
    const baseRate = followers * nicheCpv;
    // Rate Calculator!H10 — MIN(B5, H9*H8)
    const minReelRate = Math.min(followers, baseRate * qualityMultiplier);
    // Rate Calculator!H11 — MIN(B5, H9)
    const maxReelRate = Math.min(followers, baseRate);

    // Rate Calculator!A22:D26 — Final Commercials table
    const assets: CreatorRateAsset[] = [
      { asset: '1 Non-Collab Reel', min: floorTo50(minReelRate), max: ceilTo50(maxReelRate), pricing_logic: 'Base Reel Rate' },
      { asset: '1 Collab Tag Reel', min: floorTo50(maxReelRate), max: ceilTo50(1.2 * maxReelRate), pricing_logic: '1.1–1.2× Non-Collab Reel' },
      { asset: '1 Feed Post', min: floorTo50(0.3 * minReelRate), max: ceilTo50(0.4 * maxReelRate), pricing_logic: '0.3–0.5× Reel' },
      { asset: '1 Story', min: floorTo50(0.2 * minReelRate), max: ceilTo50(0.4 * maxReelRate), pricing_logic: '0.2–0.4× Reel' },
      { asset: '1 Month Ad Rights', min: floorTo50(0.3 * minReelRate), max: ceilTo50(0.3 * maxReelRate), pricing_logic: '0.3× Reel' },
    ];

    return { avgViews, viewFollowerRatio, nicheCpv, qualityMultiplier, baseRate, minReelRate, maxReelRate, assets };
  }, [followers, views, niche]);

  const hasInputs = followers > 0 && reelsEntered > 0;

  const handleReset = () => {
    setCreatorName(DEFAULT_CREATOR_NAME);
    setInstagramHandle(DEFAULT_INSTAGRAM_HANDLE);
    setPhone(DEFAULT_PHONE);
    setNotes('');
    setFollowerCount('');
    setReelViews(Array(REEL_COUNT).fill(''));
    setNiche(NICHE_OPTIONS[0].value);
  };

  // ---- Reel views entry helpers ----
  // Filling in 10 values one field at a time is tedious, so a paste into
  // any Reel field that contains more than one number (a column copied
  // from Instagram Insights, Notes, or a spreadsheet) fans out across the
  // remaining fields starting at that box, instead of dumping everything
  // into one input.
  const fillReelViewsFrom = (startIndex: number, parsed: number[]) => {
    if (parsed.length === 0) return;
    setReelViews(prev => {
      const next = [...prev];
      parsed.forEach((val, offset) => {
        const target = startIndex + offset;
        if (target < REEL_COUNT) next[target] = String(val);
      });
      return next;
    });
    const focusIndex = Math.min(startIndex + parsed.length, REEL_COUNT - 1);
    requestAnimationFrame(() => reelInputRefs.current[focusIndex]?.focus());
  };

  const handleReelPaste = (e: React.ClipboardEvent<HTMLInputElement>, index: number) => {
    const parsed = extractViewNumbers(e.clipboardData.getData('text'));
    if (parsed.length === 0) return; // let the browser handle a plain/empty paste as usual
    e.preventDefault();
    fillReelViewsFrom(index, parsed);
  };

  // Spreadsheet-style keyboard navigation between the 10 boxes: Enter (or
  // the mobile keyboard's "Next"/"Go" action) moves to the next Reel,
  // Up/Down jumps a row (5 columns on desktop) so the whole set can be
  // filled without reaching for the mouse.
  const handleReelKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (index + 1 < REEL_COUNT) reelInputRefs.current[index + 1]?.focus();
      else e.currentTarget.blur();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      reelInputRefs.current[Math.min(index + 5, REEL_COUNT - 1)]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      reelInputRefs.current[Math.max(index - 5, 0)]?.focus();
    }
  };

  // One-tap fill for the whole set: read the clipboard directly (no click
  // into a specific box needed) and distribute every number found, in
  // order, into Reels 1–10.
  const handlePasteAllViews = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const parsed = extractViewNumbers(text);
      if (parsed.length === 0) {
        await alert("Couldn't find any numbers on your clipboard. Copy the 10 view counts first, then try again.");
        return;
      }
      fillReelViewsFrom(0, parsed);
    } catch (err) {
      console.error(err);
      await alert("Couldn't read your clipboard — paste directly into a Reel field instead.");
    }
  };

  // ---- Save ----
  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    if (!hasInputs) return;
    setSaving(true);
    try {
      const saved = await saveCreatorRateCalculation({
        creator_name: creatorName.trim() || null,
        instagram_handle: instagramHandle.trim() || null,
        phone: phone.trim() || null,
        follower_count: followers,
        reel_views: views,
        niche,
        avg_views: result.avgViews,
        view_follower_ratio: result.viewFollowerRatio,
        niche_cpv: result.nicheCpv,
        quality_multiplier: result.qualityMultiplier,
        base_rate: result.baseRate,
        min_reel_rate: result.minReelRate,
        max_reel_rate: result.maxReelRate,
        final_commercials: result.assets,
        notes: notes.trim() || null,
      });
      setHistory(prev => [saved, ...prev]);
      await alert({ message: 'Calculation saved.', variant: 'success' });
    } catch (err) {
      console.error(err);
      await alert("Couldn't save this calculation. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // ---- History ----
  const [history, setHistory] = useState<CreatorRateCalculation[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const rows = await getCreatorRateCalculations();
        setHistory(rows);
      } catch (err) {
        console.error(err);
      } finally {
        setHistoryLoading(false);
      }
    })();
  }, []);

  const handleDelete = async (id: string) => {
    const ok = await confirm({ message: 'Delete this saved calculation? This cannot be undone.', variant: 'danger' });
    if (!ok) return;
    setDeletingId(id);
    try {
      await deleteCreatorRateCalculation(id);
      setHistory(prev => prev.filter(h => h.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch (err) {
      console.error(err);
      await alert("Couldn't delete this calculation. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  // ---- Send to creator: Copy (works with any app) + Share (opens
  // WhatsApp pre-filled to the creator's saved number, since that's how
  // these quotes are actually sent out). ----
  const handleCopyCalculation = async (h: CreatorRateCalculation) => {
    try {
      await navigator.clipboard.writeText(formatCalculationMessage(h));
      setCopiedId(h.id);
      window.setTimeout(() => setCopiedId(prev => (prev === h.id ? null : prev)), 2000);
    } catch (err) {
      console.error(err);
      await alert("Couldn't copy to clipboard. Please try again.");
    }
  };

  const handleShareCalculation = async (h: CreatorRateCalculation) => {
    const message = formatCalculationMessage(h);
    if (h.phone) {
      window.open(getWhatsAppLink(h.phone, message), '_blank', 'noopener,noreferrer');
      return;
    }
    if (navigator.share) {
      try {
        await navigator.share({ text: message });
      } catch {
        // user cancelled the share sheet — nothing to do
      }
      return;
    }
    // No saved phone and no native share sheet — fall back to copying.
    await handleCopyCalculation(h);
    await alert('No phone number saved for this creator, so the message was copied instead — paste it into WhatsApp, Instagram DM, or email.');
  };

  return (
    <AdminLayout title="Creator Rate Calculator" subtitle="Work out a fair commercial rate from a creator's followers, average views, and niche" scrollRestorationReady={!historyLoading}>
      <div className="space-y-6 max-w-5xl">
        {/* ---- Inputs ---- */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-lg shadow-card p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="font-display text-base sm:text-lg font-bold text-dark flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
                <Users size={15} className="text-primary" aria-hidden="true" />
              </span>
              Inputs
            </h3>
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 text-xs font-button font-semibold text-dark-muted hover:text-primary transition-colors"
            >
              <RotateCcw size={13} aria-hidden="true" /> Reset
            </button>
          </div>

          <p className="text-xs text-dark-muted mb-4 inline-flex items-start gap-1.5">
            <Info size={14} className="text-primary shrink-0 mt-0.5" aria-hidden="true" />
            Enter the creator's follower count, average views for their last 10 Reels, and select their niche.
          </p>

          {/* Optional identity — not part of the original spreadsheet, but
              needed to make a saved row identifiable later. */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5 pb-5 border-b border-background-warm">
            <div>
              <label htmlFor="cr-name" className="block text-sm font-medium text-dark mb-1">Creator Name</label>
              <input
                id="cr-name"
                type="text"
                value={creatorName}
                onChange={e => setCreatorName(e.target.value)}
                className={inputClass}
                placeholder="e.g. Priya Sharma"
              />
            </div>
            <div>
              <label htmlFor="cr-handle" className="block text-sm font-medium text-dark mb-1">Instagram Handle</label>
              <input
                id="cr-handle"
                type="text"
                value={instagramHandle}
                onChange={e => setInstagramHandle(e.target.value)}
                className={inputClass}
                placeholder="e.g. @priya.travels"
              />
            </div>
            <div>
              <label htmlFor="cr-phone" className="block text-sm font-medium text-dark mb-1">Phone</label>
              <input
                id="cr-phone"
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className={inputClass}
                placeholder="e.g. 98765 43210"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
            <div>
              <label htmlFor="cr-followers" className="block text-sm font-medium text-dark mb-1">Follower Count *</label>
              <input
                id="cr-followers"
                type="number"
                min={0}
                inputMode="numeric"
                value={followerCount}
                onChange={e => setFollowerCount(e.target.value)}
                className={inputClass}
                placeholder="e.g. 15000"
              />
            </div>
            <div>
              <label htmlFor="cr-niche" className="block text-sm font-medium text-dark mb-1">Niche *</label>
              <Select
                inputId="cr-niche"
                value={niche}
                onChange={setNiche}
                options={NICHE_OPTIONS}
                placeholder="Select niche..."
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-sm font-medium text-dark">Average Views — Last 10 Reels *</p>
            <button
              type="button"
              onClick={handlePasteAllViews}
              className="inline-flex items-center gap-1.5 text-xs font-button font-semibold text-primary hover:text-primary-dark transition-colors shrink-0"
            >
              <ClipboardText size={14} aria-hidden="true" /> Paste all 10
            </button>
          </div>
          <p className="text-[11px] text-dark-muted mb-2">
            Tip: copy the 10 view counts (one per line, from Insights or a spreadsheet) and hit "Paste all 10", or paste into any box below and press Enter to move to the next.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
            {reelViews.map((val, i) => (
              <div key={i}>
                <label htmlFor={`cr-reel-${i}`} className="block text-[11px] text-dark-muted mb-1">Reel {i + 1}</label>
                <input
                  id={`cr-reel-${i}`}
                  ref={el => { reelInputRefs.current[i] = el; }}
                  type="number"
                  min={0}
                  inputMode="numeric"
                  enterKeyHint={i + 1 < REEL_COUNT ? 'next' : 'done'}
                  value={val}
                  onChange={e => {
                    const next = [...reelViews];
                    next[i] = e.target.value;
                    setReelViews(next);
                  }}
                  onPaste={e => handleReelPaste(e, i)}
                  onKeyDown={e => handleReelKeyDown(e, i)}
                  className={inputClass}
                  placeholder="0"
                />
              </div>
            ))}
          </div>

          <div>
            <label htmlFor="cr-notes" className="block text-sm font-medium text-dark mb-1">Notes</label>
            <textarea
              id="cr-notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className={inputClass}
              rows={2}
              placeholder="Optional — context for this quote, negotiation notes, etc."
            />
          </div>
        </motion.div>

        {!hasInputs ? (
          <div className="bg-white rounded-lg shadow-card p-8 text-center text-dark-muted text-sm">
            Enter a follower count and at least one Reel's average views to see the calculated rate.
          </div>
        ) : (
          <>
            {/* ---- Calculation ---- */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
              <h3 className="font-display text-base sm:text-lg font-bold text-dark flex items-center gap-2 mb-3">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
                  <ChartLineUp size={15} className="text-primary" aria-hidden="true" />
                </span>
                Calculation
              </h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <CalcCard label="Average Views (10 Reels)" value={Math.round(result.avgViews).toLocaleString('en-IN')} icon={Eye} />
                <CalcCard label="View / Follower Ratio" value={`${Math.round(result.viewFollowerRatio * 100)}%`} icon={ChartLineUp} />
                <CalcCard label="Niche CPV Benchmark" value={formatPrice(result.nicheCpv)} icon={Target} />
                <CalcCard label="View Quality Multiplier" value={`${result.qualityMultiplier}x`} icon={Calculator} />
              </div>
            </motion.div>

            {/* ---- Suggested range ---- */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-primary/5 border-2 border-primary/20 rounded-lg p-5 sm:p-6 text-center"
            >
              <p className="text-[11px] font-button font-bold text-primary uppercase tracking-wide mb-1.5">
                Suggested 1-Reel Commercial Range
              </p>
              <p className="font-display text-2xl sm:text-3xl font-bold text-dark">
                {formatPrice(Math.round(result.minReelRate))} – {formatPrice(Math.round(result.maxReelRate))}
              </p>
              <p className="text-xs text-dark-muted mt-2">
                Calculated base rate: {formatPrice(Math.round(result.baseRate))} (Follower Count × Niche CPV Benchmark)
              </p>
            </motion.div>

            {/* ---- Final commercials table ---- */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              <div className="flex items-center justify-between gap-3 mb-3">
                <h3 className="font-display text-base sm:text-lg font-bold text-dark">Final Commercials</h3>
                <Button variant="primary" size="sm" onClick={handleSave} loading={saving}>
                  <Save size={15} aria-hidden="true" /> Save Calculation
                </Button>
              </div>
              <div className="bg-white rounded-lg shadow-card overflow-hidden overflow-x-auto">
                <table className="w-full text-sm min-w-[520px]">
                  <thead>
                    <tr className="border-b border-background-warm text-left">
                      <th className="px-4 py-2.5 font-button font-bold text-dark-muted text-xs uppercase tracking-wide">Asset</th>
                      <th className="px-4 py-2.5 font-button font-bold text-dark-muted text-xs uppercase tracking-wide text-right">Minimum</th>
                      <th className="px-4 py-2.5 font-button font-bold text-dark-muted text-xs uppercase tracking-wide text-right">Maximum</th>
                      <th className="px-4 py-2.5 font-button font-bold text-dark-muted text-xs uppercase tracking-wide">Pricing Logic</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.assets.map(row => (
                      <tr key={row.asset} className="border-b border-background-warm last:border-0 hover:bg-background-warm/30">
                        <td className="px-4 py-2.5 text-dark font-medium">{row.asset}</td>
                        <td className="px-4 py-2.5 text-dark-muted text-right whitespace-nowrap">{formatPrice(row.min)}</td>
                        <td className="px-4 py-2.5 text-dark font-semibold text-right whitespace-nowrap">{formatPrice(row.max)}</td>
                        <td className="px-4 py-2.5 text-dark-muted text-xs">{row.pricing_logic}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-dark-muted mt-3 italic">
                💡 Negotiation Tip: these prices are suggested benchmark rates. Quote higher than these to leave room for negotiation and arrive at your desired final commercial.
              </p>
            </motion.div>
          </>
        )}

        {/* ---- Saved history ---- */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <h3 className="font-display text-base sm:text-lg font-bold text-dark flex items-center gap-2 mb-3">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
              <History size={15} className="text-primary" aria-hidden="true" />
            </span>
            Saved Calculations
          </h3>

          {historyLoading ? (
            <div className="bg-white rounded-lg shadow-card p-6 text-center text-dark-muted text-sm">Loading…</div>
          ) : history.length === 0 ? (
            <div className="bg-white rounded-lg shadow-card p-6 text-center text-dark-muted text-sm">
              No saved calculations yet — save one above to build a history you can look back on.
            </div>
          ) : (
            <div className="space-y-2.5">
              {history.map(h => {
                const isOpen = expandedId === h.id;
                return (
                  <div key={h.id} className="bg-white rounded-lg shadow-card overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpandedId(isOpen ? null : h.id)}
                      aria-expanded={isOpen}
                      className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-background-warm/30 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-dark truncate">
                          {h.creator_name || h.instagram_handle || 'Unnamed creator'}
                          <span className="text-dark-muted font-normal"> &middot; {h.niche}</span>
                        </p>
                        <p className="text-xs text-dark-muted mt-0.5">
                          {h.follower_count.toLocaleString('en-IN')} followers &middot; {formatDate(h.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-sm font-semibold text-primary whitespace-nowrap">
                          {formatPrice(Math.round(h.min_reel_rate))} – {formatPrice(Math.round(h.max_reel_rate))}
                        </span>
                        {isOpen ? <ChevronUp size={16} className="text-dark-muted" aria-hidden="true" /> : <ChevronDown size={16} className="text-dark-muted" aria-hidden="true" />}
                      </div>
                    </button>

                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-4 border-t border-background-warm pt-3 space-y-3">
                            {(h.instagram_handle || h.phone) && (
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-dark-muted">
                                {h.instagram_handle && (
                                  <span className="inline-flex items-center gap-1"><Instagram size={13} aria-hidden="true" /> {h.instagram_handle}</span>
                                )}
                                {h.phone && (
                                  <span className="inline-flex items-center gap-1"><Phone size={13} aria-hidden="true" /> {h.phone}</span>
                                )}
                              </div>
                            )}

                            <div className="overflow-x-auto">
                              <table className="w-full text-xs min-w-[480px]">
                                <thead>
                                  <tr className="border-b border-background-warm text-left">
                                    <th className="px-3 py-2 font-button font-bold text-dark-muted uppercase tracking-wide">Asset</th>
                                    <th className="px-3 py-2 font-button font-bold text-dark-muted uppercase tracking-wide text-right">Min</th>
                                    <th className="px-3 py-2 font-button font-bold text-dark-muted uppercase tracking-wide text-right">Max</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {h.final_commercials.map(row => (
                                    <tr key={row.asset} className="border-b border-background-warm last:border-0">
                                      <td className="px-3 py-1.5 text-dark">{row.asset}</td>
                                      <td className="px-3 py-1.5 text-dark-muted text-right whitespace-nowrap">{formatPrice(row.min)}</td>
                                      <td className="px-3 py-1.5 text-dark font-semibold text-right whitespace-nowrap">{formatPrice(row.max)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            {h.notes && <p className="text-xs text-dark-muted italic">"{h.notes}"</p>}

                            <div className="flex items-center justify-between gap-3 flex-wrap">
                              <div className="flex items-center gap-4">
                                <button
                                  type="button"
                                  onClick={() => handleCopyCalculation(h)}
                                  className="inline-flex items-center gap-1.5 text-xs font-button font-semibold text-dark-muted hover:text-primary transition-colors"
                                >
                                  {copiedId === h.id ? (
                                    <Check size={13} className="text-green-600" aria-hidden="true" />
                                  ) : (
                                    <Copy size={13} aria-hidden="true" />
                                  )}
                                  {copiedId === h.id ? 'Copied' : 'Copy'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleShareCalculation(h)}
                                  className="inline-flex items-center gap-1.5 text-xs font-button font-semibold text-dark-muted hover:text-primary transition-colors"
                                  title={h.phone ? `Share via WhatsApp to ${h.phone}` : 'Share'}
                                >
                                  <WhatsappLogo size={13} aria-hidden="true" /> Share
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDelete(h.id)}
                                disabled={deletingId === h.id}
                                className="inline-flex items-center gap-1.5 text-xs font-button font-semibold text-dark-muted hover:text-primary transition-colors disabled:opacity-50"
                              >
                                <Trash2 size={13} aria-hidden="true" /> Delete
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>
      </div>
    </AdminLayout>
  );
}

function CalcCard({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Eye }) {
  return (
    <div className="bg-white rounded-lg p-4 shadow-card min-w-0">
      <div className="flex items-center gap-2.5">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 shrink-0">
          <Icon size={18} className="text-primary" aria-hidden="true" />
        </span>
        <p className="font-display text-lg sm:text-xl font-bold text-dark leading-tight truncate">{value}</p>
      </div>
      <p className="text-dark-muted text-xs font-medium truncate mt-2">{label}</p>
    </div>
  );
}
