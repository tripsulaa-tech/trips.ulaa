import { Plus, Trash as Trash2 } from '@phosphor-icons/react';
import Select from '../../components/ui/Select';
import type { TripCostItem, TripCostBasis, TripOption } from '../../types/types-index';
import { resolveCostItem } from '../../utils/tripFinance';
import { formatPrice } from '../../utils/utils-index';
import { inputClass } from './useTripFormModal';

// Layout: one card per cost line (Name + a 3-button "Charged" switch on top;
// Rate, People and the worked-out ₹ result below), a clear total bar, and
// quick-add chips. Labels are kept as <label> because the modal's "Search
// fields" box scans them.
//
// Generic "Other Trip Costs" editor for the Finances & Profit tab.
//
// Every line is just: Name + How it's charged + Rate (+ headcount when only
// some travelers take part). Three ways to charge, nothing else to learn:
//   Lump sum        — Ad / Promotion, Transport, Stay, Parking, Toll
//   Per traveler    — Entry Ticket, Traveler Kit, Food (x every booked traveler, follows bookings live)
//   Selected people — Water Activities, Jatayu (you type how many opted in)

interface Preset {
  name: string;
  basis: TripCostBasis;
}

// One-tap starters — purely a convenience, every field stays editable.
const PRESETS: Preset[] = [
  { name: 'Ad / Promotion', basis: 'fixed' },
  { name: 'Entry Ticket', basis: 'per_traveler' },
  { name: 'Traveler Kit', basis: 'per_traveler' },
  { name: 'Transport', basis: 'fixed' },
  { name: 'Stay', basis: 'fixed' },
  { name: 'Food', basis: 'per_traveler' },
  { name: 'Parking', basis: 'fixed' },
  { name: 'Toll', basis: 'fixed' },
  { name: 'Activity', basis: 'per_selected' },
];

const BASIS_OPTIONS: { value: TripCostBasis; label: string }[] = [
  { value: 'fixed', label: 'Lump sum' },
  { value: 'per_traveler', label: 'Per traveler' },
  { value: 'per_selected', label: 'Selected people' },
];

let idCounter = 0;
const newId = () => `ci_${Date.now().toString(36)}_${(idCounter++).toString(36)}`;

interface TripCostItemsEditorProps {
  items: TripCostItem[];
  travelerCount: number;
  // The trip's public options (Water Activities, Jatayu, ...). A "Selected
  // people only" line can be linked to one so its headcount is COUNTED from
  // what travelers actually picked when booking, instead of typed in.
  options?: TripOption[];
  // option id -> how many booked travelers picked it.
  optionCounts?: Record<string, number>;
  onChange: (items: TripCostItem[]) => void;
  // Sits inside the "Ulaa's Costs" section instead of being its own block.
  embedded?: boolean;
}

export default function TripCostItemsEditor({ items, travelerCount, options = [], optionCounts = {}, onChange, embedded = false }: TripCostItemsEditorProps) {
  const update = (id: string, patch: Partial<TripCostItem>) =>
    onChange(items.map(it => (it.id === id ? { ...it, ...patch } : it)));
  const remove = (id: string) => onChange(items.filter(it => it.id !== id));
  const add = (preset?: Preset) =>
    onChange([
      ...items,
      { id: newId(), name: preset?.name ?? '', basis: preset?.basis ?? 'fixed', rate: null, quantity: null },
    ]);

  const total = items.reduce((sum, it) => sum + resolveCostItem(it, travelerCount, optionCounts).amount, 0);

  const rupee = <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-dark-muted pointer-events-none" aria-hidden="true">₹</span>;

  return (
    <div className="md:col-span-2 space-y-3">
      <div>
        {embedded
          ? <h5 className="text-sm font-semibold text-dark mb-1">Other Trip Costs</h5>
          : <h4 className="text-sm font-semibold text-dark mb-1">Other Trip Costs</h4>}
        <p className="text-xs text-dark-muted -mt-0.5">
          One line per cost. Choose <strong>Lump sum</strong> (e.g. ads), <strong>Per traveler</strong> (uses the {travelerCount} booked) or <strong>Selected people</strong> (enter how many opted in).
        </p>
      </div>

      {items.length === 0 && (
        <p className="rounded-md border-2 border-dashed border-background-warm bg-background px-4 py-5 text-center text-xs text-dark-muted">
          No costs added yet. Tap a quick-add button below, or add a custom line.
        </p>
      )}

      {items.length > 0 && (
        <div className="space-y-3">
          {items.map(it => {
            const r = resolveCostItem(it, travelerCount, optionCounts);
            const linkedOption = it.basis === 'per_selected' && it.option_id ? options.find(o => o.id === it.option_id) : undefined;
            const overCount = it.basis === 'per_selected' && !it.option_id && (it.quantity || 0) > travelerCount && travelerCount > 0;
            const showFormula = it.basis !== 'fixed' && it.rate != null && it.rate > 0;
            return (
              <div key={it.id} className="rounded-md border-2 border-background-warm bg-white p-3 shadow-sm space-y-3">
                <div className="grid grid-cols-12 gap-x-3 gap-y-3 items-end">
                  <div className="col-span-12 md:col-span-5">
                    <label htmlFor={`ci-name-${it.id}`} className="block text-sm font-medium text-dark mb-1">Name</label>
                    <input
                      id={`ci-name-${it.id}`}
                      value={it.name}
                      onChange={e => update(it.id, { name: e.target.value })}
                      className={inputClass}
                      placeholder="e.g. Jatayu"
                    />
                  </div>
                  <div className="col-span-12 md:col-span-7">
                    <label htmlFor={`ci-basis-${it.id}`} className="block text-sm font-medium text-dark mb-1">Charged</label>
                    <div role="group" aria-label="How this cost is charged" className="grid grid-cols-3 gap-0.5 rounded-md bg-background-warm p-0.5">
                      {BASIS_OPTIONS.map((b, i) => {
                        const on = it.basis === b.value;
                        return (
                          <button
                            key={b.value}
                            id={i === 0 ? `ci-basis-${it.id}` : undefined}
                            type="button"
                            aria-pressed={on}
                            onClick={() => update(it.id, { basis: b.value })}
                            className={`rounded px-2 py-2 text-xs sm:text-sm font-medium transition-colors ${on ? 'bg-primary text-white shadow-sm' : 'text-dark hover:bg-white'}`}
                          >
                            {b.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-12 gap-x-3 gap-y-3 items-end">
                  <div className="col-span-6 md:col-span-3">
                    <label htmlFor={`ci-rate-${it.id}`} className="block text-sm font-medium text-dark mb-1">
                      {it.basis === 'fixed' ? 'Amount (₹)' : <><span className="sm:hidden">Rate (₹)</span><span className="hidden sm:inline">Rate / person (₹)</span></>}
                    </label>
                    <div className="relative">
                      {rupee}
                      <input
                        id={`ci-rate-${it.id}`}
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={it.rate ?? ''}
                        onChange={e => update(it.id, { rate: e.target.value === '' ? null : +e.target.value })}
                        className={`${inputClass} pl-7`}
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div className="col-span-6 md:col-span-3">
                    <label htmlFor={`ci-qty-${it.id}`} className="block text-sm font-medium text-dark mb-1">People</label>
                    {it.basis === 'per_selected' && it.option_id ? (
                      <div id={`ci-qty-${it.id}`} className="rounded-md bg-background-warm px-3 py-2 text-sm text-dark">
                        {r.qty} <span className="text-dark-muted text-xs">counted</span>
                      </div>
                    ) : it.basis === 'per_selected' ? (
                      <input
                        id={`ci-qty-${it.id}`}
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={it.quantity ?? ''}
                        onChange={e => update(it.id, { quantity: e.target.value === '' ? null : +e.target.value })}
                        className={inputClass}
                        placeholder={`of ${travelerCount}`}
                      />
                    ) : (
                      <div id={`ci-qty-${it.id}`} className="rounded-md bg-background-warm px-3 py-2 text-sm text-dark-muted">
                        {it.basis === 'fixed' ? 'Not needed' : `${travelerCount} (all)`}
                      </div>
                    )}
                  </div>
                  <div className="col-span-12 md:col-span-6 flex items-center justify-between gap-3 rounded-md bg-background-warm px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-2xs text-dark-muted">Cost</p>
                      <p className="flex flex-wrap items-baseline gap-x-2 leading-tight">
                        <span className="text-base font-semibold text-dark">{formatPrice(r.amount)}</span>
                        {showFormula && <span className="text-2xs text-dark-muted whitespace-nowrap">{r.qty} × {formatPrice(it.rate as number)}</span>}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(it.id)}
                      className="p-2 rounded-md text-primary/70 hover:text-primary hover:bg-white transition-colors flex-shrink-0"
                      aria-label={`Remove ${it.name || 'cost line'}`}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {it.basis === 'per_selected' && options.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-background-warm pt-3">
                    <label htmlFor={`ci-opt-${it.id}`} className="text-sm font-medium text-dark">Headcount from:</label>
                    <div className="w-full sm:w-64">
                      <Select
                        inputId={`ci-opt-${it.id}`}
                        size="sm"
                        value={it.option_id ?? ''}
                        onChange={val => update(it.id, { option_id: val || null })}
                        options={[
                          { value: '', label: 'Typed by hand' },
                          ...options.map(o => ({ value: o.id, label: `${o.name || 'Unnamed option'} (bookings)` })),
                        ]}
                      />
                    </div>
                    {linkedOption && <span className="text-xs text-dark-muted">{r.qty} traveler{r.qty === 1 ? '' : 's'} picked {linkedOption.name}</span>}
                  </div>
                )}
                {overCount && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                    {it.quantity} people selected, but only {travelerCount} are booked.
                  </p>
                )}
              </div>
            );
          })}

          <div className="flex items-center justify-between rounded-md bg-primary/10 px-4 py-3">
            <span className="text-sm font-medium text-dark">Other Trip Costs total</span>
            <span className="text-lg text-primary font-semibold">{formatPrice(total)}</span>
          </div>
        </div>
      )}

      <div className="rounded-md border-2 border-dashed border-background-warm p-3 space-y-2">
        <p className="text-sm font-medium text-dark">Quick add</p>
        <div className="flex flex-wrap gap-2 items-center">
          {PRESETS.map(p => (
            <button
              key={p.name}
              type="button"
              onClick={() => add(p)}
              className="text-xs font-medium px-3 py-1.5 rounded-md border-2 border-background-warm bg-background text-dark hover:border-primary/50 hover:bg-primary/5 transition-colors"
            >
              + {p.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => add()}
            className="flex items-center gap-1 text-xs font-medium text-primary border border-primary rounded-md px-3 py-1.5 hover:bg-primary/5 transition-colors"
          >
            <Plus size={13} aria-hidden="true" /> Custom line
          </button>
        </div>
      </div>
    </div>
  );
}
