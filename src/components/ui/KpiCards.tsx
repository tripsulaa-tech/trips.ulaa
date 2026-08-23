import type { Icon } from '@phosphor-icons/react';

export interface KpiCardData {
  label: string;
  value: number;
  sub: string;
  icon: Icon;
}

// Desktop grid of KPI summary cards, e.g. the "Total / Open / Booked /
// Cancelled" row at the top of Enquiries and Waitlist. Icon style matches
// the Dashboard's KPI cards: no background circle, every icon in the same
// brand color.
export function KpiCards({ cards }: { cards: readonly KpiCardData[] }) {
  return (
    <div className="hidden sm:grid sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
      {cards.map(card => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className="bg-white rounded-lg p-4 shadow-card min-w-0"
          >
            <div className="flex items-center gap-2">
              <Icon size={20} className="shrink-0 text-primary" aria-hidden="true" />
              <p className="font-display text-2xl font-bold text-dark leading-tight">{card.value}</p>
            </div>
            <p className="text-dark-muted text-xs font-medium truncate mt-1">{card.label}</p>
          </div>
        );
      })}
    </div>
  );
}

// Mobile-only: same KPI data as KpiCards, but laid out as a horizontally-
// scrolling carousel of compact cards, rather than a cramped 2-col grid.
export function KpiCarousel({ cards }: { cards: readonly KpiCardData[] }) {
  return (
    <div className="sm:hidden">
      <div className="flex gap-2.5 overflow-x-auto pb-1 snap-x snap-mandatory scrollbar-hide">
        {cards.map(card => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="shrink-0 w-[132px] snap-start bg-white rounded-lg p-3 shadow-card"
            >
              <div className="flex items-center gap-2">
                <Icon size={18} className="shrink-0 text-primary" aria-hidden="true" />
                <p className="font-display text-2xl font-bold text-dark leading-tight">{card.value}</p>
              </div>
              <p className="text-dark-muted text-xs font-medium truncate mt-1">{card.label}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
