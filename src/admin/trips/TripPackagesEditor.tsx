import { Plus, Trash as Trash2 } from '@phosphor-icons/react';
import type { TripOptionsConfig, TripOption, TripPackage } from '../../types/types-index';
import { formatPrice } from '../../utils/utils-index';
import { hasOwnPrice, newOptionId, packageQuote, noPackageBase } from '../../utils/tripOptions';
import { inputClass } from './useTripFormModal';

// Admin editor for a trip's public packages (Basic / Premium / ...).
//
// Two simple lists:
//   1. Options   — things a traveler can add, with the extra ₹ they pay
//                  (Water Activities +₹1,200, Jatayu +₹900 ...).
//   2. Packages  — named presets that tick some of those options. A
//                  package's price is worked out for you (trip price +
//                  its options), so it can't drift out of sync.
// What ULAA pays for each option is entered in the Finances & Profit tab
// ("Other Trip Costs" → link a line to the option).

interface TripPackagesEditorProps {
  value: TripOptionsConfig;
  // Trip-level prices, only used to preview the price of a package whose own
  // price is left blank (trip price + options). `earlyBirdPrice` is the
  // trip's early-bird price and `earlyBirdOpen` says whether its deadline
  // hasn't passed yet.
  regularPrice: number;
  earlyBirdPrice: number | null;
  earlyBirdOpen: boolean;
  onChange: (next: TripOptionsConfig) => void;
}

export default function TripPackagesEditor({ value, regularPrice, earlyBirdPrice, earlyBirdOpen, onChange }: TripPackagesEditorProps) {
  const { options, packages } = value;

  const patchOption = (id: string, patch: Partial<TripOption>) =>
    onChange({ ...value, options: options.map(o => (o.id === id ? { ...o, ...patch } : o)) });
  const removeOption = (id: string) =>
    onChange({
      options: options.filter(o => o.id !== id),
      packages: packages.map(p => ({ ...p, option_ids: p.option_ids.filter(x => x !== id) })),
    });
  const addOption = () =>
    onChange({ ...value, options: [...options, { id: newOptionId('opt'), name: '', description: '', price: null }] });

  const patchPackage = (id: string, patch: Partial<TripPackage>) =>
    onChange({ ...value, packages: packages.map(p => (p.id === id ? { ...p, ...patch } : p)) });
  const removePackage = (id: string) => onChange({ ...value, packages: packages.filter(p => p.id !== id) });
  const addPackage = () =>
    onChange({ ...value, packages: [...packages, { id: newOptionId('pkg'), name: '', description: '', option_ids: [] }] });
  const toggleOptionInPackage = (pkg: TripPackage, optionId: string) =>
    patchPackage(pkg.id, {
      option_ids: pkg.option_ids.includes(optionId)
        ? pkg.option_ids.filter(x => x !== optionId)
        : [...pkg.option_ids, optionId],
    });

  // One-click starter for the most common setup.
  const startBasicPremium = () => {
    const water: TripOption = { id: newOptionId('opt'), name: 'Water Activities', description: '', price: null };
    onChange({
      options: [water],
      packages: [
        { id: newOptionId('pkg'), name: 'Basic', description: 'The trip, without water activities', option_ids: [] },
        { id: newOptionId('pkg'), name: 'Premium', description: 'Everything in Basic, plus water activities', option_ids: [water.id], highlight: true, early_bird: true },
      ],
    });
  };

  // What this package would be charged today (for the preview line).
  const quoteFor = (p: TripPackage) =>
    packageQuote(p, value, {
      ...noPackageBase,
      regular: regularPrice,
      active: earlyBirdPrice != null && earlyBirdOpen ? earlyBirdPrice : regularPrice,
      isEarlyBird: earlyBirdPrice != null && earlyBirdOpen,
      earlyWindowOpen: earlyBirdOpen,
    });

  const numOrNull = (v: string) => (v === '' ? null : Math.max(0, +v));

  const isEmpty = options.length === 0 && packages.length === 0;

  return (
    <div className="md:col-span-2 space-y-4 pt-2 border-t border-background-warm">
      <div>
        <h4 className="text-sm font-semibold text-dark mb-1">Packages & Options</h4>
        <p className="text-xs text-dark-muted -mt-0.5">
          Optional. Let travelers pick a package (e.g. Basic or Premium) on the public trip page and booking form. Leave empty for a normal single-price trip.
        </p>
      </div>

      {isEmpty && (
        <button
          type="button"
          onClick={startBasicPremium}
          className="flex items-center gap-1 text-xs font-medium text-primary border border-primary rounded-md px-2.5 py-1.5 hover:bg-primary/5 transition-colors"
        >
          <Plus size={13} aria-hidden="true" /> Start with Basic &amp; Premium (Water Activities)
        </button>
      )}

      {/* Options */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-dark">1. Options — what travelers can add</p>
        {options.map(o => (
          <div key={o.id} className="grid grid-cols-2 md:grid-cols-12 gap-2 items-end bg-background-warm rounded-lg p-3">
            <div className="col-span-2 md:col-span-4">
              <label htmlFor={`opt-name-${o.id}`} className="block text-sm font-medium text-dark mb-1">Name</label>
              <input id={`opt-name-${o.id}`} value={o.name} onChange={e => patchOption(o.id, { name: e.target.value })} className={inputClass} placeholder="e.g. Water Activities" />
            </div>
            <div className="col-span-2 md:col-span-5">
              <label htmlFor={`opt-desc-${o.id}`} className="block text-sm font-medium text-dark mb-1">Short description (optional)</label>
              <input id={`opt-desc-${o.id}`} value={o.description} onChange={e => patchOption(o.id, { description: e.target.value })} className={inputClass} placeholder="e.g. Rafting & kayaking" />
            </div>
            <div className="col-span-1 md:col-span-2">
              <label htmlFor={`opt-price-${o.id}`} className="block text-sm font-medium text-dark mb-1">Extra price (₹)</label>
              <input
                id={`opt-price-${o.id}`}
                type="number"
                min={0}
                inputMode="numeric"
                value={o.price ?? ''}
                onChange={e => patchOption(o.id, { price: e.target.value === '' ? null : +e.target.value })}
                className={inputClass}
              />
            </div>
            <div className="col-span-1 md:col-span-1 flex justify-end">
              <button type="button" onClick={() => removeOption(o.id)} className="p-1.5 rounded text-primary/70 hover:text-primary hover:bg-primary/5 transition-colors flex-shrink-0" aria-label={`Remove option ${o.name || ''}`}>
                <Trash2 size={13} aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
        <button type="button" onClick={addOption} className="flex items-center gap-1 text-xs font-medium text-primary border border-primary rounded-md px-2.5 py-1.5 hover:bg-primary/5 transition-colors">
          <Plus size={13} aria-hidden="true" /> Add option
        </button>
      </div>

      {/* Packages */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-dark">2. Packages — presets travelers choose from (the first one is the default)</p>
        {packages.map(p => (
          <div key={p.id} className="bg-background-warm rounded-lg p-3 space-y-2">
            <div className="grid grid-cols-2 md:grid-cols-12 gap-2 items-end">
              <div className="col-span-2 md:col-span-3">
                <label htmlFor={`pkg-name-${p.id}`} className="block text-sm font-medium text-dark mb-1">Package name</label>
                <input id={`pkg-name-${p.id}`} value={p.name} onChange={e => patchPackage(p.id, { name: e.target.value })} className={inputClass} placeholder="e.g. Premium" />
              </div>
              <div className="col-span-2 md:col-span-2">
                <label htmlFor={`pkg-desc-${p.id}`} className="block text-sm font-medium text-dark mb-1">Short description (optional)</label>
                <input id={`pkg-desc-${p.id}`} value={p.description} onChange={e => patchPackage(p.id, { description: e.target.value })} className={inputClass} />
              </div>
              <div className="col-span-1 md:col-span-2">
                <label htmlFor={`pkg-price-${p.id}`} className="block text-sm font-medium text-dark mb-1">Price / person (₹)</label>
                <input
                  id={`pkg-price-${p.id}`}
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={p.price ?? ''}
                  onChange={e => patchPackage(p.id, { price: numOrNull(e.target.value) })}
                  className={inputClass}
                  placeholder="Auto"
                />
              </div>
              <div className="col-span-1 md:col-span-2">
                <label htmlFor={`pkg-eb-price-${p.id}`} className="block text-sm font-medium text-dark mb-1">Early-bird (₹)</label>
                <input
                  id={`pkg-eb-price-${p.id}`}
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={p.early_bird_price ?? ''}
                  onChange={e => patchPackage(p.id, { early_bird_price: numOrNull(e.target.value) })}
                  disabled={!p.early_bird || !hasOwnPrice(p)}
                  className={`${inputClass} disabled:opacity-50 disabled:cursor-not-allowed`}
                  placeholder={p.early_bird ? (hasOwnPrice(p) ? 'Early-bird price' : 'Set price first') : 'Off'}
                />
              </div>
              <div className="col-span-1 md:col-span-1 flex justify-end">
                <button type="button" onClick={() => removePackage(p.id)} className="p-1.5 rounded text-primary/70 hover:text-primary hover:bg-primary/5 transition-colors flex-shrink-0" aria-label={`Remove package ${p.name || ''}`}>
                  <Trash2 size={13} aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-dark">Includes:</span>
              {options.length === 0 && <span className="text-xs text-dark-muted">add an option above first</span>}
              {options.map(o => {
                const on = p.option_ids.includes(o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleOptionInPackage(p, o.id)}
                    className={`text-xs font-medium px-2.5 py-1.5 rounded-md border-2 transition-colors ${on ? 'border-primary bg-primary/10 text-primary' : 'border-background-warm bg-background text-dark-muted hover:border-primary/50'}`}
                  >
                    {on ? '✓ ' : ''}{o.name || 'Unnamed option'}
                  </button>
                );
              })}
              <label className="ml-auto inline-flex items-center gap-2 text-sm text-dark cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-primary" checked={!!p.early_bird} onChange={e => patchPackage(p.id, { early_bird: e.target.checked })} />
                Early-bird price applies
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-dark cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-primary" checked={!!p.highlight} onChange={e => patchPackage(p.id, { highlight: e.target.checked })} />
                Show "Most popular"
              </label>
            </div>
            {(() => {
              const q = quoteFor(p);
              return (
                <p className="text-xs text-dark-muted">
                  Traveler pays today:{' '}
                  <span className="font-semibold text-dark">
                    {q.price != null && q.price > 0 ? formatPrice(q.price) : `+${formatPrice(q.extra)}`}
                  </span>
                  {q.isEarlyBird ? ' (early-bird)' : ''}
                  {!hasOwnPrice(p) && ' — no price set, so trip price + options'}
                </p>
              );
            })()}
          </div>
        ))}
        <button type="button" onClick={addPackage} className="flex items-center gap-1 text-xs font-medium text-primary border border-primary rounded-md px-2.5 py-1.5 hover:bg-primary/5 transition-colors">
          <Plus size={13} aria-hidden="true" /> Add package
        </button>
      </div>

      {!isEmpty && (
        <p className="text-xs text-dark-muted">
          Type a price for each package (e.g. Basic ₹10,000, Premium ₹12,000). Leave it blank to use trip price + its options. Tick "Early-bird price applies" on a package to give it an early-bird price while the trip's early-bird date is still open. What ULAA pays for an option goes in the Finances &amp; Profit tab → Other Trip Costs.
        </p>
      )}
    </div>
  );
}
