import { Users, MapTrifold, Flag } from '@phosphor-icons/react';
import type { AboutContent } from '../../types/types-index';
import { inputClass, iconLabelClass, previewLabelClass } from './shared';

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
      <div className="pb-3 border-b border-background-warm">
        <h2 className="font-display text-lg font-bold text-dark">6 · Statistics</h2>
        <p className="text-xs text-dark-muted mt-1">
          The numbers themselves are calculated live from completed trips, so they're always accurate.
          Only the labels below are editable here — and they're shared by both this page and the
          Completed Trips page, so changing a name updates it in both places.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label htmlFor="about-stats-girls" className={iconLabelClass}>
            <Users size={14} className="text-primary" aria-hidden="true" />
            Girls Travelled Label
          </label>
          <input
            id="about-stats-girls"
            value={content.girls_travelled_label}
            onChange={e => setStats('girls_travelled_label', e.target.value)}
            className={inputClass}
            placeholder="Girls travelled"
          />
        </div>
        <div>
          <label htmlFor="about-stats-trips" className={iconLabelClass}>
            <Flag size={14} className="text-primary" aria-hidden="true" />
            Trips Completed Label
          </label>
          <input
            id="about-stats-trips"
            value={content.trips_completed_label}
            onChange={e => setStats('trips_completed_label', e.target.value)}
            className={inputClass}
            placeholder="Trips completed"
          />
        </div>
        <div>
          <label htmlFor="about-stats-destinations" className={iconLabelClass}>
            <MapTrifold size={14} className="text-primary" aria-hidden="true" />
            Destinations Label
          </label>
          <input
            id="about-stats-destinations"
            value={content.destinations_label}
            onChange={e => setStats('destinations_label', e.target.value)}
            className={inputClass}
            placeholder="Destinations"
          />
        </div>
      </div>

      {/* Live preview — mirrors the primary-colored stats strip on the public page */}
      <div>
        <p className={previewLabelClass}>Live preview</p>
        <div className="rounded-lg bg-primary px-5 py-6 grid grid-cols-3 gap-4 text-center text-white">
          <div>
            <div className="font-display text-2xl font-bold">120+</div>
            <div className="text-white/80 text-xs mt-1">{content.girls_travelled_label || 'Girls travelled'}</div>
          </div>
          <div>
            <div className="font-display text-2xl font-bold">18+</div>
            <div className="text-white/80 text-xs mt-1">{content.trips_completed_label || 'Trips completed'}</div>
          </div>
          <div>
            <div className="font-display text-2xl font-bold">12+</div>
            <div className="text-white/80 text-xs mt-1">{content.destinations_label || 'Destinations'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
