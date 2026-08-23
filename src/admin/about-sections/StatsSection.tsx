import type { AboutContent } from '../../types/types-index';
import { inputClass, labelClass } from './shared';

export default function StatsSection({
  content,
  setStats,
  sectionRef,
}: {
  content: AboutContent['stats'];
  setStats: (field: keyof AboutContent['stats'], value: string) => void;
  sectionRef: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div ref={sectionRef} data-section={6} className="scroll-mt-4 space-y-4">
      <h2 className="font-display text-lg font-bold text-dark pb-3 border-b border-background-warm">6 · Statistics</h2>
      <p className="text-xs text-dark-muted -mt-1">
        The numbers themselves are calculated live from completed trips, so they're always accurate.
        Only the labels below are editable here — and they're shared by both this page and the
        Completed Trips page, so changing a name updates it in both places.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label htmlFor="about-stats-girls" className={labelClass}>Girls Travelled Label</label>
          <input
            id="about-stats-girls"
            value={content.girls_travelled_label}
            onChange={e => setStats('girls_travelled_label', e.target.value)}
            className={inputClass}
            placeholder="Girls travelled"
          />
        </div>
        <div>
          <label htmlFor="about-stats-trips" className={labelClass}>Trips Completed Label</label>
          <input
            id="about-stats-trips"
            value={content.trips_completed_label}
            onChange={e => setStats('trips_completed_label', e.target.value)}
            className={inputClass}
            placeholder="Trips completed"
          />
        </div>
        <div>
          <label htmlFor="about-stats-destinations" className={labelClass}>Destinations Label</label>
          <input
            id="about-stats-destinations"
            value={content.destinations_label}
            onChange={e => setStats('destinations_label', e.target.value)}
            className={inputClass}
            placeholder="Destinations"
          />
        </div>
      </div>
    </div>
  );
}
