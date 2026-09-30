import { CheckCircle, Minus, Plus } from '@phosphor-icons/react';
import type { TripOptionsConfig } from '../../types/types-index';
import { formatPrice } from '../../utils/utils-index';
import { hasOwnPrice, includedOptions, isPremiumPackage, packagePriceLabel, packageQuote, seatPackageAssignments, type PackageBase } from '../../utils/tripOptions';

interface BookingPackagePickerProps {
  config: TripOptionsConfig;
  // Today's price for the plain trip. Each package picks its own base from
  // it (only early-bird packages get the early-bird price). No price at all
  // -> only the "+₹ extra" part is shown.
  base: PackageBase;
  mode: 'solo' | 'group';
  groupSize: number;
  // Solo: the one chosen package.
  packageId: string | null;
  onPackageChange: (id: string) => void;
  // Group: people per package. The FIRST package takes whatever isn't
  // assigned to the others, so the split always adds up to groupSize.
  groupCounts: Record<string, number>;
  onGroupCountsChange: (counts: Record<string, number>) => void;
}

export default function BookingPackagePicker({
  config,
  base,
  mode,
  groupSize,
  packageId,
  onPackageChange,
  groupCounts,
  onGroupCountsChange,
}: BookingPackagePickerProps) {
  const quoteOf = (id: string) => {
    const pkg = config.packages.find(p => p.id === id) ?? config.packages[0];
    return packageQuote(pkg, config, base);
  };
  const labelOf = (id: string) => packagePriceLabel(quoteOf(id), formatPrice);
  const hasBase = base.active != null || config.packages.some(hasOwnPrice);

  if (mode === 'solo') {
    const chosen = packageId ?? config.packages[0].id;
    return (
      <div>
        <p id="package-picker-label" className="block text-sm font-medium text-dark mb-1">Package *</p>
        <div role="radiogroup" aria-labelledby="package-picker-label" className="grid gap-2">
          {config.packages.map(pkg => {
            const selected = chosen === pkg.id;
            const extras = includedOptions(pkg, config);
            const premium = isPremiumPackage(pkg.name);
            return (
              <button
                key={pkg.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onPackageChange(pkg.id)}
                className={`text-left rounded-lg border-2 px-4 py-3 transition-colors ${
                  isPremiumPackage(pkg.name)
                    ? `premium-gold-border ${selected ? 'premium-gold-border--selected' : ''}`
                    : selected ? 'border-primary bg-primary/10' : 'border-background-warm hover:border-primary/40'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 font-medium text-dark">
                    <CheckCircle
                      size={18}
                      weight={selected ? 'fill' : 'regular'}
                      className={premium ? 'text-gold' : selected ? 'text-primary' : 'text-dark-muted/50'}
                      aria-hidden="true"
                    />
                    <span className={premium ? 'premium-gold-text' : undefined}>{pkg.name}</span>
                  </span>
                  <span className={`font-semibold ${premium ? 'premium-gold-text' : 'text-primary'}`}>{labelOf(pkg.id)}</span>
                </div>
                <p className="text-xs text-dark-muted mt-1 pl-7">
                  {extras.length > 0 ? `Includes ${extras.map(o => o.name).join(', ')}` : pkg.description || 'The trip, without add-on activities'}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Group: how many people take each package.
  const assignments = seatPackageAssignments(config, groupSize, groupCounts);
  const countOf = (id: string) => assignments.filter(a => a.package_id === id).length;
  const [first, ...rest] = config.packages;
  const total = config.packages.reduce(
    (sum, p) => sum + countOf(p.id) * (quoteOf(p.id).price ?? 0),
    0,
  );
  const setCount = (id: string, next: number) => {
    const othersUsed = rest.filter(p => p.id !== id).reduce((s, p) => s + countOf(p.id), 0);
    const clamped = Math.max(0, Math.min(next, groupSize - othersUsed));
    const nextCounts: Record<string, number> = {};
    rest.forEach(p => { nextCounts[p.id] = p.id === id ? clamped : countOf(p.id); });
    onGroupCountsChange(nextCounts);
  };

  return (
    <div>
      <p className="block text-sm font-medium text-dark mb-1">Package — how many people for each? *</p>
      <div className="grid gap-2">
        <div className={`flex items-center justify-between gap-3 rounded-lg border-2 px-4 py-2.5 ${isPremiumPackage(first.name) ? 'premium-gold-border' : 'border-background-warm'}`}>
          <div>
            <span className={`font-medium ${isPremiumPackage(first.name) ? 'premium-gold-text' : 'text-dark'}`}>{first.name}</span>
            <span className={`text-sm font-semibold ml-2 ${isPremiumPackage(first.name) ? 'premium-gold-text' : 'text-primary'}`}>{labelOf(first.id)}</span>
          </div>
          <span className="text-sm text-dark-muted">{countOf(first.id)} {countOf(first.id) === 1 ? 'person' : 'people'} (the rest)</span>
        </div>
        {rest.map(pkg => (
          <div key={pkg.id} className={`flex items-center justify-between gap-3 rounded-lg border-2 px-4 py-2.5 ${isPremiumPackage(pkg.name) ? 'premium-gold-border' : 'border-background-warm'}`}>
            <div>
              <span className={`font-medium ${isPremiumPackage(pkg.name) ? 'premium-gold-text' : 'text-dark'}`}>{pkg.name}</span>
              <span className={`text-sm font-semibold ml-2 ${isPremiumPackage(pkg.name) ? 'premium-gold-text' : 'text-primary'}`}>{labelOf(pkg.id)}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCount(pkg.id, countOf(pkg.id) - 1)}
                disabled={countOf(pkg.id) <= 0}
                aria-label={`Fewer people for ${pkg.name}`}
                className="h-8 w-8 flex items-center justify-center rounded-full border border-background-warm text-dark disabled:opacity-40"
              >
                <Minus size={14} />
              </button>
              <span className="w-6 text-center font-medium text-dark" aria-live="polite">{countOf(pkg.id)}</span>
              <button
                type="button"
                onClick={() => setCount(pkg.id, countOf(pkg.id) + 1)}
                disabled={countOf(first.id) <= 0}
                aria-label={`More people for ${pkg.name}`}
                className="h-8 w-8 flex items-center justify-center rounded-full border border-background-warm text-dark disabled:opacity-40"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
      {hasBase && (
        <p className="text-xs text-dark-muted mt-1">
          Estimated total for {groupSize} {groupSize === 1 ? 'person' : 'people'}: <span className="font-semibold text-dark">{formatPrice(total)}</span>
        </p>
      )}
    </div>
  );
}
