import { formatDate, formatPrice } from '../../utils/utils-index';
import { hasPackages, packageListPrice, includedOptions } from '../../utils/tripOptions';
import type { TripPricingSnapshot } from '../../types/types-index';

interface TripPricingSummaryProps {
  pricing: TripPricingSnapshot;
  totalSeats?: number | null;
  // option id -> how many bookings took it (shown next to each option).
  optionCounts?: Record<string, number>;
}

const money = (n?: number | null) => (n != null && n > 0 ? formatPrice(n) : null);

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-3">
      <span className="text-dark-muted">{label}</span>
      <span className="text-dark text-right">{value}</span>
    </div>
  );
}

/** Read-only view of a trip's pricing setup: trip prices, early-bird, special
 *  offer, packages and options. Rows only — the caller provides the box. */
export default function TripPricingSummary({ pricing: p, totalSeats, optionCounts = {} }: TripPricingSummaryProps) {
  const cfg = p.trip_options;
  const packages = hasPackages(cfg) ? cfg.packages : [];
  const priceBase = { price: p.price ?? undefined, early_bird_price: p.early_bird_price ?? null };

  const offerDates = p.special_offer_date
    ? p.special_offer_end_date && p.special_offer_end_date !== p.special_offer_date
      ? `${formatDate(p.special_offer_date, { day: 'numeric', month: 'short' })} – ${formatDate(p.special_offer_end_date, { day: 'numeric', month: 'short' })}`
      : formatDate(p.special_offer_date, { day: 'numeric', month: 'short' })
    : null;

  const hasAnything = money(p.price) || money(p.early_bird_price) || money(p.special_offer_price) || packages.length > 0;
  if (!hasAnything) return <p className="text-dark-muted">No pricing was entered for this trip.</p>;

  return (
    <>
      <Row label="Regular Price" value={money(p.price) ? `${money(p.price)} / person` : null} />
      <Row
        label="Early-Bird Price"
        value={money(p.early_bird_price)
          ? `${money(p.early_bird_price)}${p.early_bird_deadline ? ` · till ${formatDate(p.early_bird_deadline, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}`
          : null}
      />
      <Row label="Strikeout Price" value={money(p.strike_through_price)} />
      <Row label="Advance / Reservation" value={money(p.advance_amount)} />
      <Row
        label={`Special Offer${p.special_offer_name ? ` (${p.special_offer_name})` : ''}`}
        value={money(p.special_offer_price) ? `${money(p.special_offer_price)}${offerDates ? ` · ${offerDates}` : ''}` : null}
      />
      <Row label="Total Seats" value={totalSeats ? String(totalSeats) : null} />

      {packages.length > 0 && cfg && (
        <div className="pt-2 mt-1 border-t border-background-warm space-y-2">
          <p className="text-xs font-medium text-dark-muted">Packages</p>
          {packages.map(pkg => {
            const regular = packageListPrice(pkg, cfg, priceBase, 'normal');
            const early = pkg.early_bird ? packageListPrice(pkg, cfg, priceBase, 'early_bird') : undefined;
            const opts = includedOptions(pkg, cfg);
            return (
              <div key={pkg.id} className="flex justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-dark">{pkg.name || 'Unnamed package'}{pkg.highlight ? <span className="ml-1.5 text-[10px] uppercase tracking-wide text-primary">Most popular</span> : null}</p>
                  <p className="text-xs text-dark-muted">{opts.length ? opts.map(o => o.name).join(', ') : 'Base trip only'}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-dark">{regular != null ? formatPrice(regular) : '—'}</p>
                  {early != null && early !== regular && <p className="text-xs text-dark-muted">Early-bird {formatPrice(early)}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {cfg && cfg.options.length > 0 && (
        <div className="pt-2 mt-1 border-t border-background-warm space-y-1.5">
          <p className="text-xs font-medium text-dark-muted">Add-on options</p>
          {cfg.options.map(o => (
            <div key={o.id} className="flex justify-between gap-3 text-xs">
              <span className="text-dark-muted">{o.name || 'Unnamed option'}{optionCounts[o.id] ? ` · taken by ${optionCounts[o.id]}` : ''}</span>
              <span className="text-dark-muted">{o.price ? `+${formatPrice(o.price)}` : 'Included'}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
