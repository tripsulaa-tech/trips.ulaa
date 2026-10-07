import { useEffect, useMemo, useState } from 'react';
import Modal from '../../components/ui/Modal';
import TripCard from '../../components/ui/TripCard';
import { getWaitlistReservedCounts } from '../../services/api/trips';
import type { UpcomingTrip } from '../../types/types-index';

interface AdminTripsPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  trips: UpcomingTrip[];
}

type View = 'home' | 'listing';

const HOME_LIMIT = 3;

// Same ordering the public site uses (see getUpcomingTrips): manual
// sort_order first (unset last), start_date as the tiebreaker.
const publicOrder = (a: UpcomingTrip, b: UpcomingTrip) => {
  const ao = a.sort_order ?? Number.POSITIVE_INFINITY;
  const bo = b.sort_order ?? Number.POSITIVE_INFINITY;
  if (ao !== bo) return ao < bo ? -1 : 1;
  return a.start_date.localeCompare(b.start_date);
};

/** Admin-only, read-only preview of the public Upcoming Trips cards — the
 *  homepage strip and the full /trips listing — including Draft and Coming
 *  Soon trips, which can't be seen on the public site. Nothing here is
 *  published or saved; card links are disabled. */
export default function AdminTripsPreviewModal({ isOpen, onClose, trips }: AdminTripsPreviewModalProps) {
  const [view, setView] = useState<View>('listing');
  const [includeDrafts, setIncludeDrafts] = useState(true);
  const [reserved, setReserved] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!isOpen) return;
    getWaitlistReservedCounts().then(setReserved).catch(() => setReserved({}));
  }, [isOpen]);

  const { items, pastCount } = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = trips.filter(t => t.start_date >= today);
    const visible = includeDrafts ? upcoming : upcoming.filter(t => t.status !== 'draft');
    const sorted = [...visible]
      .sort(publicOrder)
      .map(t => ({ ...t, waitlist_reserved: reserved[t.id] || 0 }));
    return { items: sorted, pastCount: trips.length - upcoming.length };
  }, [trips, includeDrafts, reserved]);

  const shown = view === 'home' ? items.slice(0, HOME_LIMIT) : items;

  const tab = (v: View, label: string) => (
    <button
      type="button"
      onClick={() => setView(v)}
      className={`text-xs font-button font-semibold px-3 py-1.5 rounded-md transition-colors ${
        view === v ? 'bg-primary text-white' : 'bg-primary/10 text-primary hover:bg-primary/20'
      }`}
    >
      {label}
    </button>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Preview — Upcoming Trips" size="2xl">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {tab('home', `Homepage (first ${HOME_LIMIT})`)}
            {tab('listing', 'Trips page (all)')}
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-dark-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeDrafts}
              onChange={e => setIncludeDrafts(e.target.checked)}
              className="accent-primary"
            />
            Include drafts (preview as if published)
          </label>
        </div>

        <p className="text-xs text-dark-muted">
          Preview only — nothing is published. Cards follow the public order (set with the ↑/↓ arrows in the table).
          {!includeDrafts && ' Showing only what is live right now.'}
          {pastCount > 0 && ` ${pastCount} trip${pastCount === 1 ? '' : 's'} with a past start date ${pastCount === 1 ? 'is' : 'are'} not listed.`}
        </p>

        {shown.length === 0 ? (
          <div className="text-center py-12 text-dark-muted">No trips to preview.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {shown.map((trip, i) => (
              <div key={trip.id} className="relative">
                {/* Disable every link/button inside the card — this is a
                    look-only preview, and draft slugs 404 on the public site. */}
                <div
                  onClickCapture={e => { e.preventDefault(); e.stopPropagation(); }}
                  className={`h-full ${trip.status === 'draft' ? 'opacity-80' : ''}`}
                >
                  <TripCard trip={trip} index={i} />
                </div>
                <span className="absolute -top-2 -left-2 z-10 w-7 h-7 rounded-full bg-dark text-white text-xs font-button font-bold flex items-center justify-center shadow-card pointer-events-none">
                  {i + 1}
                </span>
                {trip.status === 'draft' && (
                  <span className="absolute top-2 right-2 z-10 text-[10px] font-button font-bold uppercase tracking-wide px-2 py-1 rounded-md bg-dark text-white pointer-events-none">
                    Draft · hidden
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
