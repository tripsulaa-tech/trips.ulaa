import { Plus, Trash as Trash2, Star, Info, Check } from '@phosphor-icons/react';
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
// Layout: each option and package is its own card — options show which packages
// use them, packages show their includes as +₹ chips and end with a live
// "Traveler pays today" bar. Field labels/headings are kept as <label>/<h4>
// because the modal's "Search fields" box scans those.
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
  // Early bird is limited by seats (first N paid), not a date: it is then a
  // trip-level price for every package without its own fixed price.
  earlyBirdSeatLimited?: boolean;
  onChange: (next: TripOptionsConfig) => void;
}

export default function TripPackagesEditor({ value, regularPrice, earlyBirdPrice, earlyBirdOpen, earlyBirdSeatLimited = false, onChange }: TripPackagesEditorProps) {
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

  // The first package is the default one travelers land on.
  const makeDefault = (id: string) => {
    const pkg = packages.find(p => p.id === id);
    if (!pkg) return;
    onChange({ ...value, packages: [pkg, ...packages.filter(p => p.id !== id)] });
  };

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
      earlyWindowOpen: earlyBirdOpen && !earlyBirdSeatLimited,
      seatLimited: earlyBirdSeatLimited,
      seatDiscount: earlyBirdSeatLimited && earlyBirdPrice != null ? Math.max(0, regularPrice - earlyBirdPrice) : 0,
    });

  const numOrNull = (v: string) => (v === '' ? null : Math.max(0, +v));

  const isEmpty = options.length === 0 && packages.length === 0;

  const smallBtn = 'inline-flex items-center gap-1 text-xs font-medium text-primary border border-primary rounded-md px-2.5 py-1.5 hover:bg-primary/5 transition-colors';
  const iconBtn = 'p-2 rounded-md text-primary/70 hover:text-primary hover:bg-primary/5 transition-colors flex-shrink-0';
  const pill = (on: boolean) =>
    `inline-flex items-center gap-2 text-sm text-dark cursor-pointer rounded-md border-2 px-3 py-1.5 transition-colors ${on ? 'border-primary/50 bg-primary/5' : 'border-background-warm bg-background hover:border-primary/30'}`;

  // ₹ prefix inside a number field.
  const rupee = <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-dark-muted pointer-events-none" aria-hidden="true">₹</span>;

  return (
    <div className="md:col-span-2 space-y-5 pt-2 border-t border-background-warm">
      <div>
        <h4 className="text-sm font-semibold text-dark mb-1">Packages & Options</h4>
        <p className="text-xs text-dark-muted -mt-0.5">
          Optional. Lets travelers choose a package (e.g. Basic or Premium). Leave empty for a single-price trip.
        </p>
      </div>

      {isEmpty && (
        <div className="rounded-md border-2 border-dashed border-background-warm bg-background p-5 text-center space-y-3">
          <p className="text-sm text-dark">This trip has a single price right now.</p>
          <p className="text-xs text-dark-muted">Add options (extras travelers can pay for) and bundle them into packages like Basic and Premium.</p>
          <button type="button" onClick={startBasicPremium} className={smallBtn}>
            <Plus size={13} aria-hidden="true" /> Start with Basic &amp; Premium (Water Activities)
          </button>
        </div>
      )}

      {/* Options */}
      <section className="space-y-3" aria-label="Options">
        <div>
          <h4 className="text-sm font-semibold text-dark">1. Options — what travelers can add</h4>
          <p className="text-xs text-dark-muted">Extras with their own price. Tick them inside a package below.</p>
        </div>
        {options.map(o => {
          const usedIn = packages.filter(p => p.option_ids.includes(o.id));
          return (
            <div key={o.id} className="rounded-md border-2 border-background-warm bg-white p-3 shadow-sm">
              <div className="grid grid-cols-12 gap-x-3 gap-y-2 items-end">
                <div className="col-span-12 sm:col-span-4">
                  <label htmlFor={`opt-name-${o.id}`} className="block text-sm font-medium text-dark mb-1">Name</label>
                  <input id={`opt-name-${o.id}`} value={o.name} onChange={e => patchOption(o.id, { name: e.target.value })} className={inputClass} placeholder="e.g. Water Activities" />
                </div>
                <div className="col-span-12 sm:col-span-5">
                  <label htmlFor={`opt-desc-${o.id}`} className="block text-sm font-medium text-dark mb-1">Short description (optional)</label>
                  <input id={`opt-desc-${o.id}`} value={o.description} onChange={e => patchOption(o.id, { description: e.target.value })} className={inputClass} placeholder="e.g. Rafting & kayaking" />
                </div>
                <div className="col-span-9 sm:col-span-2">
                  <label htmlFor={`opt-price-${o.id}`} className="block text-sm font-medium text-dark mb-1">Extra price (₹)</label>
                  <div className="relative">
                    {rupee}
                    <input
                      id={`opt-price-${o.id}`}
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={o.price ?? ''}
                      onChange={e => patchOption(o.id, { price: e.target.value === '' ? null : +e.target.value })}
                      className={`${inputClass} pl-7`}
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="col-span-3 sm:col-span-1 flex justify-end">
                  <button type="button" onClick={() => removeOption(o.id)} className={iconBtn} aria-label={`Remove option ${o.name || ''}`}>
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
              <p className="mt-2 text-xs text-dark-muted flex flex-wrap items-center gap-1.5">
                {usedIn.length > 0 ? (
                  <>
                    <span>Included in:</span>
                    {usedIn.map(p => (
                      <span key={p.id} className="rounded-md bg-primary/10 text-primary font-medium px-2 py-0.5">{p.name || 'Unnamed package'}</span>
                    ))}
                  </>
                ) : (
                  <span>Not in any package yet — tick it inside a package below.</span>
                )}
              </p>
            </div>
          );
        })}
        <button type="button" onClick={addOption} className={smallBtn}>
          <Plus size={13} aria-hidden="true" /> Add option
        </button>
      </section>

      {/* Packages */}
      <section className="space-y-3" aria-label="Packages">
        <div>
          <h4 className="text-sm font-semibold text-dark">2. Packages — presets travelers choose from</h4>
          <p className="text-xs text-dark-muted">The first package is the default one travelers land on.</p>
        </div>

        {packages.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-background-warm px-3 py-2" aria-label="Packages at a glance">
            <span className="text-xs font-medium text-dark-muted">At a glance:</span>
            {packages.map(p => {
              const q = quoteFor(p);
              return (
                <span key={p.id} className="inline-flex items-center gap-1.5 rounded-md bg-white border border-background-warm px-2.5 py-1 text-xs text-dark">
                  {p.highlight && <Star size={11} weight="fill" className="text-primary" aria-hidden="true" />}
                  <span className="font-medium">{p.name || 'Unnamed'}</span>
                  <span className="text-dark-muted">{q.price != null && q.price > 0 ? formatPrice(q.price) : `+${formatPrice(q.extra)}`}</span>
                </span>
              );
            })}
          </div>
        )}

        {packages.map((p, index) => {
          const q = quoteFor(p);
          const ebDisabled = !p.early_bird || !hasOwnPrice(p);
          return (
            <div key={p.id} className={`rounded-md border-2 bg-white p-4 space-y-4 shadow-sm ${p.highlight ? 'border-primary/40' : 'border-background-warm'}`}>
              {/* Card header: position badge, popular badge, actions */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Two tabs: where this package sits (Default) and the popularity flag */}
                {index === 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-primary text-white text-xs font-semibold px-3 py-1.5" title="Travelers land on this package first">
                    <Check size={12} weight="bold" aria-hidden="true" /> Default
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => makeDefault(p.id)}
                    title="Move to the top so travelers land on it first"
                    className="inline-flex items-center rounded-md border-2 border-primary/40 text-primary text-xs font-semibold px-3 py-1 hover:bg-primary/5 transition-colors"
                  >
                    Make default
                  </button>
                )}
                <button
                  type="button"
                  aria-pressed={!!p.highlight}
                  onClick={() => patchPackage(p.id, { highlight: !p.highlight })}
                  title={p.highlight ? 'Tap to remove the "Most popular" badge' : 'Tap to show a "Most popular" badge on this package'}
                  className={`inline-flex items-center gap-1 rounded-md border-2 text-xs font-semibold px-3 py-1 transition-colors ${
                    p.highlight
                      ? 'border-amber-400 bg-amber-100 text-amber-800'
                      : 'border-background-warm text-dark-muted hover:border-amber-300 hover:text-amber-800'
                  }`}
                >
                  <Star size={12} weight={p.highlight ? 'fill' : 'regular'} aria-hidden="true" /> Most popular
                </button>
                <div className="flex-1" />
                <button type="button" onClick={() => removePackage(p.id)} className={iconBtn} aria-label={`Remove package ${p.name || ''}`}>
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>

              <div className="grid grid-cols-12 gap-x-3 gap-y-3 items-end">
                <div className="col-span-12 sm:col-span-4">
                  <label htmlFor={`pkg-name-${p.id}`} className="block text-sm font-medium text-dark mb-1">Package name</label>
                  <input id={`pkg-name-${p.id}`} value={p.name} onChange={e => patchPackage(p.id, { name: e.target.value })} className={inputClass} placeholder="e.g. Premium" />
                </div>
                <div className="col-span-12 sm:col-span-8">
                  <label htmlFor={`pkg-desc-${p.id}`} className="block text-sm font-medium text-dark mb-1">Short description (optional)</label>
                  <input id={`pkg-desc-${p.id}`} value={p.description} onChange={e => patchPackage(p.id, { description: e.target.value })} className={inputClass} placeholder="e.g. Everything in Basic, plus water activities" />
                </div>
                <div className="col-span-6 sm:col-span-4">
                  <label htmlFor={`pkg-price-${p.id}`} className="block text-sm font-medium text-dark mb-1">Price / person (₹)</label>
                  <div className="relative">
                    {rupee}
                    <input
                      id={`pkg-price-${p.id}`}
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={p.price ?? ''}
                      onChange={e => patchPackage(p.id, { price: numOrNull(e.target.value) })}
                      className={`${inputClass} pl-7`}
                      placeholder="Auto"
                    />
                  </div>
                </div>
                <div className="col-span-6 sm:col-span-4">
                  <label htmlFor={`pkg-eb-price-${p.id}`} className="block text-sm font-medium text-dark mb-1">Early-bird (₹)</label>
                  <div className="relative">
                    {rupee}
                    <input
                      id={`pkg-eb-price-${p.id}`}
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={p.early_bird_price ?? ''}
                      onChange={e => patchPackage(p.id, { early_bird_price: numOrNull(e.target.value) })}
                      disabled={ebDisabled}
                      className={`${inputClass} pl-7 disabled:opacity-50 disabled:cursor-not-allowed`}
                      placeholder={p.early_bird ? (hasOwnPrice(p) ? 'Early-bird price' : 'Set price first') : 'Off'}
                    />
                  </div>
                </div>
                <div className="col-span-12 sm:col-span-4 flex flex-wrap gap-2 sm:justify-end">
                  <label className={pill(!!p.early_bird)}>
                    <input type="checkbox" className="w-4 h-4 accent-primary" checked={!!p.early_bird} onChange={e => patchPackage(p.id, { early_bird: e.target.checked })} />
                    Early-bird price applies
                  </label>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-dark mb-1.5">Includes</p>
                <div className="flex flex-wrap items-center gap-2">
                  {options.length === 0 && <span className="text-xs text-dark-muted">add an option above first</span>}
                  {options.map(o => {
                    const on = p.option_ids.includes(o.id);
                    return (
                      <button
                        key={o.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleOptionInPackage(p, o.id)}
                        className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border-2 transition-colors ${on ? 'border-primary bg-primary/10 text-primary' : 'border-background-warm bg-background text-dark-muted hover:border-primary/50'}`}
                      >
                        {on ? '✓ ' : '+ '}{o.name || 'Unnamed option'}
                        {o.price != null && o.price > 0 && <span className="opacity-70">{formatPrice(o.price)}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Live result: exactly what a traveler is charged today */}
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-md bg-background-warm px-3 py-2.5">
                <span className="text-xs text-dark-muted">Traveler pays today{q.isEarlyBird ? ' (early-bird)' : ''}</span>
                <span className="text-base font-semibold text-dark">
                  {q.price != null && q.price > 0 ? formatPrice(q.price) : `+${formatPrice(q.extra)}`}
                </span>
                {!hasOwnPrice(p) && (
                  <span className="basis-full text-2xs text-dark-muted">No price set — using trip price + options.</span>
                )}
              </div>
            </div>
          );
        })}
        <button type="button" onClick={addPackage} className={smallBtn}>
          <Plus size={13} aria-hidden="true" /> Add package
        </button>
      </section>

      {!isEmpty && (
        <div className="flex gap-2 rounded-md bg-background-warm px-3 py-2.5 text-xs text-dark-muted">
          <Info size={14} className="shrink-0 mt-0.5 text-dark-muted" aria-hidden="true" />
          <p>
            Set a price per package, or leave blank to use trip price + options. Tick "Early-bird price applies" to use early-bird pricing until the deadline. Option costs go under Finances &amp; Profit → Other Trip Costs.
          </p>
        </div>
      )}
    </div>
  );
}
