import SectionTitle from '../../components/ui/SectionTitle';
import Button from '../../components/ui/Button';
import type { UpcomingTrip, ButtonLabelsConfig } from '../../types/types-index';
import { formatPrice, earlyBirdSeatsLabel } from '../../utils/utils-index';
import { getPackageBase, hasOwnPrice, includedOptions, isPackageSoldOut, packageListPrice, packageQuote, packagePriceLabel } from '../../utils/tripOptions';
import { CheckCircle, Star } from '@phosphor-icons/react';

interface TripPackagesSectionProps {
  trip: UpcomingTrip;
  buttonLabels: ButtonLabelsConfig;
  onChoose: (packageId: string) => void;
}

// "Choose your package" — public cards for the trip's Basic / Premium / …
// packages. Picking one opens the booking form with it preselected.
export default function TripPackagesSection({ trip, buttonLabels, onChoose }: TripPackagesSectionProps) {
  const cfg = trip.trip_options;
  const base = getPackageBase(trip);
  if (!cfg || cfg.packages.length === 0) return null;
  // Nothing to price from: no trip price and no package has its own price.
  if (base.active == null && !cfg.packages.some(hasOwnPrice)) return null;

  // The cheapest/entry package (listed first, e.g. Basic) is what the
  // highlighted one is compared against: "Just ₹500 more than Basic".
  // (A sold-out early-bird package can't be the entry: skip to the first open one.)
  const entry = cfg.packages.find(p => !isPackageSoldOut(p, base)) ?? cfg.packages[0];
  const entryPrice = packageQuote(entry, cfg, base).price;
  // "Most popular" on an early-bird-only package lasts only while its seats do.
  const hasHighlight = cfg.packages.some(p => p.highlight && !isPackageSoldOut(p, base));
  const seatsLabel = earlyBirdSeatsLabel(trip);

  return (
    <section id="packages" className="scroll-mt-44">
      <SectionTitle
        variant="plain"
        align="left"
        label="Pick what suits you"
        title="Choose Your Package"
        titleClassName="mb-4"
      />
      <div className={`grid gap-4 grid-cols-1 ${cfg.packages.length >= 3 ? 'md:grid-cols-3' : cfg.packages.length === 2 ? 'md:grid-cols-2' : ''}`}>
        {cfg.packages.map(pkg => {
          const extras = includedOptions(pkg, cfg);
          // Early-bird pricing only reaches packages flagged for it (e.g.
          // Premium); the others always show the regular trip price.
          const quote = packageQuote(pkg, cfg, base);
          const earlyBird = quote.isEarlyBird;
          const soldOut = isPackageSoldOut(pkg, base);
          const popular = !!pkg.highlight && !soldOut;
          // While the seats last, the early-bird-only card says how many are left.
          const showSeats = !!pkg.early_bird_only && !soldOut && !!seatsLabel;
          // Sold out: show what the early-bird price WAS (struck through) instead of
          // the regular price, which would just look like the Normal package.
          const wasPrice = soldOut ? packageListPrice(pkg, cfg, trip, 'early_bird') : undefined;
          const gap = popular && pkg.id !== entry.id && quote.price != null && entryPrice != null ? quote.price - entryPrice : 0;
          const tick = popular ? 'text-gold-700' : 'text-primary';
          return (
            <div
              key={pkg.id}
              aria-disabled={soldOut || undefined}
              className={`relative flex flex-col rounded-lg p-6 ${popular ? 'popular-gold-card' : 'bg-background-warm border-2 border-transparent'} ${soldOut ? 'opacity-60 grayscale select-none' : ''}`}
            >
              {soldOut && (
                <span className="absolute -top-3 left-6 inline-flex items-center gap-1 bg-dark text-white text-xs font-semibold px-3 py-1 rounded-full">
                  Sold out
                </span>
              )}
              {popular && (
                <span className="absolute -top-3 left-6 inline-flex items-center gap-1 popular-gold-badge text-xs font-semibold px-3 py-1 rounded-full">
                  <Star size={12} weight="fill" aria-hidden="true" /> Most popular
                </span>
              )}
              <h3 className="font-display text-xl font-bold text-dark">{pkg.name}</h3>
              {pkg.description && <p className="text-sm text-dark-muted mt-1">{pkg.description}</p>}
              <p className="mt-3 font-display text-3xl font-bold text-primary">
                {soldOut && wasPrice != null ? (
                  <span className="line-through decoration-2">{formatPrice(wasPrice)}</span>
                ) : (
                  <span className={popular ? 'premium-gold-text' : undefined}>{packagePriceLabel(quote, formatPrice)}</span>
                )}
                <span className="text-sm font-normal text-dark-muted"> / person</span>
              </p>
              {soldOut && <p className="text-xs font-semibold mt-1 text-dark-muted">All early-bird seats are taken</p>}
              {showSeats && <p className="text-xs font-semibold mt-1 text-gold-deep">{seatsLabel}</p>}
              {gap > 0 && (
                <p className="text-xs font-semibold text-gold-deep mt-1">
                  Just {formatPrice(gap)} more than {entry.name}
                </p>
              )}
              {earlyBird && !showSeats && <p className={`text-xs font-semibold mt-1 ${popular ? 'text-gold-deep' : 'text-primary'}`}>Early-bird price</p>}
              <ul className="mt-4 space-y-2 text-sm text-dark flex-1">
                <li className="flex items-start gap-2">
                  <CheckCircle size={18} weight="fill" className={`${tick} shrink-0 mt-0.5`} aria-hidden="true" />
                  <span>Everything in the trip</span>
                </li>
                {extras.map(o => (
                  <li key={o.id} className="flex items-start gap-2">
                    <CheckCircle size={18} weight="fill" className={`${tick} shrink-0 mt-0.5`} aria-hidden="true" />
                    <span>
                      <span className="font-medium">{o.name}</span>
                      {o.description && <span className="text-dark-muted"> — {o.description}</span>}
                    </span>
                  </li>
                ))}
              </ul>
              <Button
                onClick={() => onChoose(pkg.id)}
                disabled={soldOut}
                fullWidth
                // With a highlighted package, the others step back to an
                // outline button so the recommended choice stands out.
                variant={hasHighlight && !popular ? 'outline' : 'primary'}
                className={`mt-5 ${popular ? 'popular-gold-btn' : ''}`}
              >
                {soldOut ? 'Sold out' : buttonLabels.primaryCta}
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
