import { useEffect, useRef, useState } from 'react';
import { Download, FileDown, Loader2, Share2 } from 'lucide-react';
import Button from './Button';
import type { UpcomingTrip } from '../../types/types-index';
import { canShareItineraryPdf, downloadTripItineraryPdf, shareTripItineraryPdf } from '../../utils/tripItineraryPdf';

interface PdfDownloadMenuProps {
  trip: UpcomingTrip;
  /**
   * - 'hero': full-width ghost CTA button, matches the primary hero action row.
   * - 'icon': compact round icon-only button, matches the pinned nav bar.
   * - 'text': small text link with icon, matches the footer action row
   *   (next to "Add to calendar" / "Share this trip").
   */
  variant: 'hero' | 'icon' | 'text';
  className?: string;
}

/**
 * Single entry point for "get the itinerary PDF" — used in all three spots
 * it appears on the trip page. Kept as one component so all three stay in
 * sync and behave identically.
 *
 * On browsers that can hand a real file to the native OS share sheet (iOS
 * Safari 15+, Android Chrome, ...), tapping this opens a small "Download /
 * Share PDF" menu — reusing the exact dropdown pattern the "Add to
 * calendar" button next to it already uses, rather than a generic system
 * alert, so it feels native to the page instead of bolted on.
 *
 * Why a menu instead of two separate icons: "download" and "share" glyphs
 * look near-identical at a glance, and this page already has a generic
 * "Share this trip" (page-link) button right next to this one — a second,
 * unlabeled share-style icon here would read as a duplicate of that button
 * rather than "share the PDF specifically". A single labeled entry point
 * avoids that ambiguity, and keeps the already-tight action rows (three
 * icons packed into the pinned nav; four items in the footer row) from
 * growing a fourth/fifth item. It also means desktop users — where file
 * sharing isn't supported — see one plain "Download" button with no menu
 * at all, rather than a second option they can't use.
 *
 * "Share PDF" hands WhatsApp/Messages/etc. the actual PDF file plus a
 * clickable link back to this trip page — never the blob: URL that iOS's
 * own PDF viewer used to leak into the share sheet when `doc.save()` was
 * called directly (see tripItineraryPdf.ts for the full explanation).
 */
export default function PdfDownloadMenu({ trip, variant, className = '' }: PdfDownloadMenuProps) {
  // Computed once per mount — capability doesn't change mid-session.
  const [canShare] = useState(canShareItineraryPdf);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<'download' | 'share' | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  async function handleDownload() {
    setOpen(false);
    setBusy('download');
    try {
      await downloadTripItineraryPdf(trip);
    } catch (err) {
      console.error('Failed to generate itinerary PDF', err);
    } finally {
      setBusy(null);
    }
  }

  async function handleShare() {
    setOpen(false);
    setBusy('share');
    try {
      await shareTripItineraryPdf(trip);
    } catch (err) {
      console.error('Failed to share itinerary PDF', err);
    } finally {
      setBusy(null);
    }
  }

  // Devices that can't share files (most desktop browsers) skip the menu
  // entirely — there's nothing meaningful to choose between, so the trigger
  // just downloads directly, same as before this change.
  function handleTriggerClick() {
    if (busy) return;
    if (canShare) {
      setOpen(o => !o);
    } else {
      handleDownload();
    }
  }

  const loading = busy !== null;

  const menu = open && (
    <div className="absolute top-full right-0 mt-2 z-20 w-44 rounded-lg border-2 border-background-warm bg-white shadow-warm-lg py-1 overflow-hidden">
      <button
        type="button"
        onClick={handleDownload}
        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-dark text-left hover:bg-background-warm transition-colors"
      >
        <Download size={14} className="shrink-0" /> Download
      </button>
      <button
        type="button"
        onClick={handleShare}
        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-dark text-left hover:bg-background-warm transition-colors"
      >
        <Share2 size={14} className="shrink-0" /> Share PDF
      </button>
    </div>
  );

  if (variant === 'hero') {
    return (
      <div ref={menuRef} className="relative flex-1 sm:flex-none">
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={handleTriggerClick}
          disabled={loading}
          aria-haspopup={canShare ? 'menu' : undefined}
          aria-expanded={canShare ? open : undefined}
          className={`w-full sm:w-auto justify-center text-white border-white/40 hover:border-white hover:bg-white/10 !px-3 !py-2 !text-sm !min-h-[44px] sm:!px-8 sm:!py-4 sm:!text-lg sm:!min-h-[56px] sm:rounded-lg ${className}`}
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
          {loading ? 'Preparing…' : 'Download'}
        </Button>
        {menu}
      </div>
    );
  }

  if (variant === 'icon') {
    return (
      <div ref={menuRef} className="relative">
        <button
          type="button"
          onClick={handleTriggerClick}
          disabled={loading}
          aria-label="Get itinerary PDF"
          title="Get itinerary PDF"
          aria-haspopup={canShare ? 'menu' : undefined}
          aria-expanded={canShare ? open : undefined}
          className={`h-8 w-8 sm:h-9 sm:w-9 flex items-center justify-center rounded-full text-dark-muted hover:text-primary hover:bg-background-warm transition-colors disabled:opacity-50 ${className}`}
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <><FileDown size={15} className="sm:hidden" /><FileDown size={16} className="hidden sm:block" /></>}
        </button>
        {menu}
      </div>
    );
  }

  // variant === 'text'
  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={handleTriggerClick}
        disabled={loading}
        aria-haspopup={canShare ? 'menu' : undefined}
        aria-expanded={canShare ? open : undefined}
        className={`flex items-center gap-1.5 whitespace-nowrap text-sm text-dark-muted hover:text-primary transition-colors disabled:opacity-50 ${className}`}
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
        {loading ? 'Preparing PDF…' : 'Download itinerary'}
      </button>
      {menu}
    </div>
  );
}
