import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SignIn as LogIn, FilePdf, CircleNotch } from '@phosphor-icons/react';
import Modal from '../../components/ui/Modal';
import FoodMark from '../../components/ui/FoodMark';
import { useAlert } from '../../components/ui/useAlert';
import { getEnquiries, checkInEnquiry, undoCheckInEnquiry } from '../../services/api';
import type { Enquiry, UpcomingTrip } from '../../types/types-index';
import { isBooked } from '../enquiries/AdminEnquiriesShared';
import { foodBadge, foodPreferenceKey } from '../enquiries/AdminEnquiryCommon';
import { isPremiumPackage } from '../../utils/tripOptions';
import { formatDate, formatPrice } from '../../utils/utils-index';
import { formatPhone } from '../../utils/formatPhone';

interface AdminTripCheckInModalProps {
  trip: UpcomingTrip | null;
  onClose: () => void;
}

// Same text colours the Enquiries table uses for its Food column.
const FOOD_TEXT_COLOR = { veg: 'text-green-700', non_veg: 'text-red-700', not_set: 'text-dark-muted' } as const;

const smallBtn =
  'inline-flex items-center gap-1 text-xs font-button font-semibold px-2.5 py-1.5 rounded-md whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

/** "Check-in" popup opened from a trip row's ⋮ menu. Lists everyone on that
 *  trip whose seat is actually held (Booked: paid and not cancelled, the
 *  same isBooked() test the Enquiries page uses) and lets the admin check
 *  them in right here. It calls the same checkInEnquiry / undoCheckInEnquiry
 *  the Enquiries page uses, so the write (and its rules: Fully Paid only,
 *  not cancelled, not a no-show) and the activity log are identical, and the
 *  Enquiries page shows the new status. Enquiries are fetched fresh each
 *  time it opens, so a booking made a minute ago still shows. */
export default function AdminTripCheckInModal({ trip, onClose }: AdminTripCheckInModalProps) {
  const alert = useAlert();
  // null = still loading. The parent remounts this component (via `key`)
  // each time a different trip is opened, so state always starts fresh and
  // every open re-fetches.
  const [result, setResult] = useState<{ booked: Enquiry[]; error: boolean } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const tripId = trip?.id;
  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;
    getEnquiries()
      .then(all => {
        if (cancelled) return;
        setResult({
          error: false,
          booked: all
            .filter(e => e.trip_id === tripId && isBooked(e))
            .sort((a, b) => a.full_name.localeCompare(b.full_name)),
        });
      })
      .catch(err => {
        console.error(err);
        if (!cancelled) setResult({ booked: [], error: true });
      });
    return () => { cancelled = true; };
  }, [tripId]);

  const loading = !!trip && result === null;
  const error = result?.error ?? false;
  const booked = useMemo(() => result?.booked ?? [], [result]);
  const checkedInCount = useMemo(() => booked.filter(e => !!e.checked_in_at).length, [booked]);

  // Swaps the saved row back into the list so the badge/button flip at once.
  const applyUpdated = (updated: Enquiry) =>
    setResult(r => (r ? { ...r, booked: r.booked.map(e => (e.id === updated.id ? updated : e)) } : r));

  const [downloading, setDownloading] = useState(false);
  const downloadList = async () => {
    if (!trip || downloading) return;
    setDownloading(true);
    try {
      const { downloadCheckInListPdf } = await import('../../utils/checkInListPdf');
      await downloadCheckInListPdf(trip, booked);
    } catch (err) {
      console.error(err);
      await alert({ title: 'Download', message: 'Could not create the traveller list. Please try again.' });
    } finally {
      setDownloading(false);
    }
  };

  const run = async (e: Enquiry, action: () => Promise<Enquiry>, failMessage: string) => {
    setBusyId(e.id);
    try {
      applyUpdated(await action());
    } catch (err) {
      console.error(err);
      await alert({ title: 'Check-in', message: err instanceof Error ? err.message : failMessage });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal isOpen={!!trip} onClose={onClose} title={trip ? `Check-in · ${trip.title}` : 'Check-in'} size="lg">
      {trip && (
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-button font-semibold px-2 py-1 rounded-md bg-green-100 text-green-700">
                  {booked.length} Booked
                </span>
                <span className="text-xs font-button font-semibold px-2 py-1 rounded-md bg-indigo-100 text-indigo-700">
                  {checkedInCount} Checked In
                </span>
              </div>
              {/* The one download: traveller list (Name, Age, Phone, Food, Package) as a PDF. */}
              <button
                type="button"
                onClick={downloadList}
                disabled={loading || error || booked.length === 0 || downloading}
                title="Download traveller list as PDF (Name, Age, Phone, Food, Package)"
                aria-label="Download traveller list as PDF"
                className="shrink-0 inline-flex items-center gap-1.5 text-xs font-button font-semibold pl-2 pr-3 py-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary/10 disabled:hover:text-primary"
              >
                {downloading ? (
                  <CircleNotch size={18} weight="bold" className="animate-spin" aria-hidden="true" />
                ) : (
                  <FilePdf size={18} weight="duotone" aria-hidden="true" />
                )}
                {downloading ? 'Preparing…' : 'Download'}
              </button>
            </div>
            <p className="text-xs text-dark-muted">
              {formatDate(trip.start_date, { day: 'numeric', month: 'short', year: 'numeric' })} · {trip.destination}
            </p>
          </div>

          {loading ? (
            <p className="text-center py-10 text-dark-muted text-sm">Loading...</p>
          ) : error ? (
            <p role="alert" className="text-center py-10 text-red-600 text-sm">Couldn't load bookings. Close this and try again.</p>
          ) : booked.length === 0 ? (
            <p className="text-center py-10 text-dark-muted text-sm">No one is in Booked status for this trip yet.</p>
          ) : (
            <ul className="divide-y divide-background-warm border border-background-warm rounded-md">
              {booked.map((e, i) => {
                const due = Math.max(0, (e.total_amount || 0) - (e.amount_paid || 0));
                const isGroup = !!e.group_size && e.group_size > 1;
                const food = foodPreferenceKey(e);
                const premium = isPremiumPackage(e.package_name);
                const busy = busyId === e.id;
                const canCheckIn = e.journey_stage === 'fully_paid' && !e.is_no_show;
                return (
                  <li key={e.id} className="flex items-start gap-3 px-3 py-3">
                    <span className="w-6 shrink-0 pt-0.5 text-xs text-dark-muted text-right">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-dark truncate">
                        <Link
                          to={`/admin/enquiries/${e.id}`}
                          onClick={onClose}
                          title={`Open ${e.full_name}'s enquiry`}
                          className="hover:text-primary hover:underline underline-offset-2"
                        >
                          {e.full_name}
                        </Link>
                        {e.age ? <span className="text-dark-muted font-normal">, {e.age}</span> : null}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-dark-muted">
                        {e.phone && (
                          <a href={`tel:${e.phone}`} className="inline-flex items-center gap-1 font-medium text-dark hover:text-primary hover:underline underline-offset-2">
                            <span className="tabular-nums whitespace-nowrap">{formatPhone(e.phone)}</span>
                          </a>
                        )}
                        {e.package_name && (
                          <span
                            title="Trip package this traveler chose"
                            className={`inline-flex items-center text-2xs font-button font-semibold px-1.5 py-0.5 rounded-md whitespace-nowrap ${
                              premium ? 'bg-gold/10' : 'bg-primary/10 text-primary'
                            }`}
                          >
                            <span className={premium ? 'premium-gold-text' : undefined}>{e.package_name}</span>
                          </span>
                        )}
                        <span className={`inline-flex items-center gap-1 font-button font-semibold whitespace-nowrap ${FOOD_TEXT_COLOR[food]}`}>
                          <FoodMark type={food} size={12} /> {foodBadge(e).label}
                        </span>
                        {isGroup && <span>Group {e.group_seq}/{e.group_size}</span>}
                        {e.has_child_addon && <span>Child fare</span>}
                      </div>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1.5">
                      {e.checked_in_at ? (
                        <>
                          <span className="inline-flex items-center gap-1 text-2xs font-button font-semibold px-2 py-1 rounded-md bg-indigo-100 text-indigo-700 whitespace-nowrap">
                            <LogIn size={11} aria-hidden="true" /> Checked In
                          </span>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => run(e, () => undoCheckInEnquiry(e.id), 'Failed to undo check-in.')}
                            className="text-2xs text-dark-muted hover:text-primary underline underline-offset-2 disabled:opacity-50"
                          >
                            {busy ? 'Undoing…' : 'Undo'}
                          </button>
                        </>
                      ) : e.is_no_show ? (
                        <span className="text-2xs font-button font-semibold px-2 py-1 rounded-md bg-orange-100 text-orange-700 whitespace-nowrap">No Show</span>
                      ) : (
                        <button
                          type="button"
                          disabled={!canCheckIn || busy}
                          title={canCheckIn ? 'Mark this traveller as checked in' : 'Check-in opens once the balance is fully paid'}
                          onClick={() => run(e, () => checkInEnquiry(e), 'Failed to check in.')}
                          className={`${smallBtn} border-2 border-primary text-primary hover:bg-primary hover:text-white`}
                        >
                          <LogIn size={13} aria-hidden="true" /> {busy ? 'Checking in…' : 'Check In'}
                        </button>
                      )}
                      <span className={`text-2xs whitespace-nowrap ${due > 0 ? 'text-amber-700 font-medium' : 'text-dark-muted'}`}>
                        {due > 0 ? `${formatPrice(due)} due` : 'Fully paid'}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}
