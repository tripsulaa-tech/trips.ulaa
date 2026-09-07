import type { Icon } from '@phosphor-icons/react';

interface KpiCardData {
  label: string;
  value: number;
  sub: string;
  icon: Icon;
}

// Explicit lookup rather than a template literal (`lg:grid-cols-${n}`) so
// Tailwind's JIT compiler sees each class name as a literal it can find in
// the source and doesn't purge it from the build.
const LG_COLS: Record<number, string> = {
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5',
  6: 'lg:grid-cols-6',
};

// Desktop grid of KPI summary cards, e.g. the "Total / Open / Booked /
// Cancelled" row at the top of Enquiries and Waitlist. Icon style matches
// the Dashboard's KPI cards: no background circle, every icon in the same
// brand color. `columns` should match however many cards the caller passes
// (defaults to 5, Enquiries' count) — otherwise a caller with a different
// count than the grid's column count gets a lone card orphaned on its own
// row at the lg breakpoint, as Waitlist's 6th card did against a
// hardcoded 5-column grid.
export function KpiCards({ cards, columns = 5 }: { cards: readonly KpiCardData[]; columns?: 3 | 4 | 5 | 6 }) {
  return (
    <div className={`hidden sm:grid sm:grid-cols-3 ${LG_COLS[columns]} gap-3 sm:gap-4`}>
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
