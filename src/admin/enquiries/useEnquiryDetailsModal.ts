import { useState, useEffect } from 'react';
import { getPaymentsForEnquiry } from '../../services/api';
import type { Enquiry, Payment } from '../../types/types-index';
import { downloadInvoicePdf, invoiceAsFile } from '../../utils/invoicePdf';
import { formatPrice } from '../../utils/utils-index';
import { useAlert } from '../../components/ui/useAlert';

/** Owns the desktop "View Details" popup — its target, the per-payment
 *  invoice list lazy-loaded for whichever enquiry is open (same on-demand
 *  fetch pattern as the Track Payment modal's inline history), and the
 *  download/share invoice actions available both from the row's kebab menu
 *  and from inside the modal itself.
 *
 *  `setDetailsTarget`/`setDetailsInvoices` are returned directly (not just
 *  via handlers) because useEnquiryLifecycle, useGenerateInvoice, and
 *  useMarkInvoicePaid all also need to update this modal's target/invoice
 *  list from elsewhere in the table — same cross-hook wiring pattern already
 *  used for setPaymentTarget/setPaymentForm in useEnquiryPayment.
 *
 *  Extracted from AdminEnquiries.tsx (see that file's history for the
 *  original single-component version). */
export function useEnquiryDetailsModal() {
  const alert = useAlert();

  const [detailsTarget, setDetailsTarget] = useState<Enquiry | null>(null);
  // Per-payment invoices for whichever enquiry is open in the Details
  // modal — fetched on demand (see the useEffect below), same lazy-load
  // pattern as handleDownloadInvoice already used for the cumulative PDF.
  const [detailsInvoices, setDetailsInvoices] = useState<Payment[]>([]);
  const [detailsInvoicesLoading, setDetailsInvoicesLoading] = useState(false);
  // Enquiry id currently generating/sharing its invoice PDF — disables the
  // invoice buttons on that one row only while the payments ledger fetch +
  // PDF build (or the native share sheet) is in flight.
  const [invoiceBusyId, setInvoiceBusyId] = useState<string | null>(null);

  // Loads the per-payment invoice list whenever the Enquiry Details modal is
  // opened for a different (or no) enquiry — same on-demand fetch pattern as
  // handleDownloadInvoice, just kept around so the Invoices section can
  // render without an extra click.
  useEffect(() => {
    if (!detailsTarget) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing stale invoices immediately on modal close, ahead of the async fetch below
      setDetailsInvoices([]);
      return;
    }
    let cancelled = false;
    setDetailsInvoicesLoading(true);
    getPaymentsForEnquiry(detailsTarget.id)
      .then(rows => { if (!cancelled) setDetailsInvoices(rows); })
      .catch(err => console.error(err))
      .finally(() => { if (!cancelled) setDetailsInvoicesLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only detailsTarget.id is read; re-fetching on every detailsTarget reference change would refetch unnecessarily
  }, [detailsTarget?.id]);

  // Downloads (or, on devices that support the Web Share API with files,
  // shares to WhatsApp/etc.) the invoice PDF for a booked enquiry. Only
  // meaningful once a booking_id exists — that's assigned server-side the
  // first time amount_paid > 0 (see add_booking_id_invoice.sql), which is
  // the same test isBooked() uses, so the button is only shown/enabled for
  // rows that are actually booked.
  const handleDownloadInvoice = async (e: Enquiry) => {
    setInvoiceBusyId(e.id);
    try {
      const payments = await getPaymentsForEnquiry(e.id);
      await downloadInvoicePdf(e, payments);
    } catch (err) {
      console.error(err);
      alert('Failed to generate invoice.');
    } finally {
      setInvoiceBusyId(null);
    }
  };

  // Web Share API (level 2, file sharing) lets mobile browsers hand the PDF
  // straight to WhatsApp/etc. as an attachment. Desktop browsers (and older
  // mobile ones) don't support sharing files this way, so those fall back
  // to opening a wa.me chat with a text summary instead — the admin can
  // then attach the file they just downloaded manually.
  const handleShareInvoice = async (e: Enquiry) => {
    setInvoiceBusyId(e.id);
    try {
      const payments = await getPaymentsForEnquiry(e.id);
      const file = await invoiceAsFile(e, payments);
      const canShareFile = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
      if (canShareFile) {
        await navigator.share({
          files: [file],
          title: `ULAA Invoice — ${e.booking_id || ''}`,
          text: `Invoice for booking ${e.booking_id || ''} (${e.trip_title || 'ULAA trip'})`,
        });
      } else {
        await downloadInvoicePdf(e, payments);
        const text = encodeURIComponent(
          `Hi ${e.full_name}, here's your ULAA booking summary:\n` +
          `Booking ID: ${e.booking_id || '—'}\n` +
          `Trip: ${e.trip_title || '—'}\n` +
          `Amount paid: ${formatPrice(e.amount_paid || 0)}${e.total_amount ? ` of ${formatPrice(e.total_amount)}` : ''}\n` +
          `The invoice PDF has been downloaded — please attach it to this chat.`
        );
        const digits = (e.phone || '').replace(/\D/g, '');
        window.open(`https://wa.me/${digits}?text=${text}`, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      // AbortError just means the admin cancelled the native share sheet —
      // not a real failure, so don't show an error toast for it.
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error(err);
      alert('Failed to share invoice.');
    } finally {
      setInvoiceBusyId(null);
    }
  };

  return {
    detailsTarget, setDetailsTarget,
    detailsInvoices, setDetailsInvoices,
    detailsInvoicesLoading,
    invoiceBusyId,
    handleDownloadInvoice,
    handleShareInvoice,
  };
}
