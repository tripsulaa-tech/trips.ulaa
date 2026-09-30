import { Plus, Trash as Trash2 } from '@phosphor-icons/react';
import Select from '../../components/ui/Select';
import type { TripCostItem, TripCostBasis } from '../../types/types-index';
import { resolveCostItem } from '../../utils/tripFinance';
import { formatPrice } from '../../utils/utils-index';
import { inputClass } from './useTripFormModal';

// Generic "Other Trip Costs" editor for the Finances & Profit tab.
//
// Every line is just: Name + How it's charged + Rate (+ headcount when only
// some travelers take part). Three ways to charge, nothing else to learn:
//   Lump sum        — Transport, Stay, Parking, Toll
//   Per traveler    — Food (x every booked traveler, follows bookings live)
//   Selected people — Water Activities, Jatayu (you type how many opted in)

interface Preset {
  name: string;
  basis: TripCostBasis;
}

// One-tap starters — purely a convenience, every field stays editable.
const PRESETS: Preset[] = [
  { name: 'Transport', basis: 'fixed' },
  { name: 'Stay', basis: 'fixed' },
  { name: 'Food', basis: 'per_traveler' },
  { name: 'Parking', basis: 'fixed' },
  { name: 'Toll', basis: 'fixed' },
  { name: 'Activity', basis: 'per_selected' },
];

const BASIS_OPTIONS: { value: TripCostBasis; label: string }[] = [
  { value: 'fixed', label: 'Lump sum' },
  { value: 'per_traveler', label: 'Per traveler (all)' },
  { value: 'per_selected', label: 'Selected people only' },
];

let idCounter = 0;
const newId = () => `ci_${Date.now().toString(36)}_${(idCounter++).toString(36)}`;

interface TripCostItemsEditorProps {
  items: TripCostItem[];
  travelerCount: number;
  onChange: (items: TripCostItem[]) => void;
}

export default function TripCostItemsEditor({ items, travelerCount, onChange }: TripCostItemsEditorProps) {
  const update = (id: string, patch: Partial<TripCostItem>) =>
    onChange(items.map(it => (it.id === id ? { ...it, ...patch } : it)));
  const remove = (id: string) => onChange(items.filter(it => it.id !== id));
  const add = (preset?: Preset) =>
    onChange([
      ...items,
      { id: newId(), name: preset?.name ?? '', basis: preset?.basis ?? 'fixed', rate: null, quantity: null },
    ]);

  const total = items.reduce((sum, it) => sum + resolveCostItem(it, travelerCount).amount, 0);

  return (
    <div className="md:col-span-2 space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-dark mb-1">Other Trip Costs</h4>
        <p className="text-xs text-dark-muted -mt-0.5">
          Anything else this trip costs — one line each. Pick how it is charged: a <strong>lump sum</strong> (e.g. Transport),
          <strong> per traveler</strong> (e.g. Food, uses the {travelerCount} booked), or <strong>selected people only</strong> (e.g. Water Activities —
          enter how many opted in).
        </p>
      </div>

      {items.length > 0 && (
        <div className="space-y-2">
          {items.map(it => {
            const r = resolveCostItem(it, travelerCount);
            const overCount = it.basis === 'per_selected' && (it.quantity || 0) > travelerCount && travelerCount > 0;
            return (
              <div key={it.id} className="grid grid-cols-2 md:grid-cols-12 gap-2 items-end bg-background-warm/40 rounded-md p-2">
                <div className="col-span-2 md:col-span-3">
                  <label htmlFor={`ci-name-${it.id}`} className="block text-xs font-medium text-dark mb-1">Name</label>
                  <input
                    id={`ci-name-${it.id}`}
                    value={it.name}
                    onChange={e => update(it.id, { name: e.target.value })}
                    className={inputClass}
                    placeholder="e.g. Jatayu"
                  />
                </div>
                <div className="col-span-2 md:col-span-3">
                  <label htmlFor={`ci-basis-${it.id}`} className="block text-xs font-medium text-dark mb-1">Charged</label>
                  <Select
                    inputId={`ci-basis-${it.id}`}
                    value={it.basis}
                    onChange={val => update(it.id, { basis: val as TripCostBasis })}
                    options={BASIS_OPTIONS}
                  />
                </div>
                <div className="md:col-span-2">
                  <label htmlFor={`ci-rate-${it.id}`} className="block text-xs font-medium text-dark mb-1">
                    {it.basis === 'fixed' ? 'Amount (₹)' : 'Rate / person (₹)'}
                  </label>
                  <input
                    id={`ci-rate-${it.id}`}
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={it.rate ?? ''}
                    onChange={e => update(it.id, { rate: e.target.value === '' ? null : +e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div className="md:col-span-2">
                  <label htmlFor={`ci-qty-${it.id}`} className="block text-xs font-medium text-dark mb-1">People</label>
                  {it.basis === 'per_selected' ? (
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
                    <div id={`ci-qty-${it.id}`} className="px-3 py-2 text-sm text-dark-muted">
                      {it.basis === 'fixed' ? '—' : `${travelerCount} (all)`}
                    </div>
                  )}
                </div>
                <div className="col-span-2 md:col-span-2 flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-dark">{formatPrice(r.amount)}</span>
                  <button
                    type="button"
                    onClick={() => remove(it.id)}
                    className="p-1.5 text-dark-muted hover:text-red-600 transition-colors"
                    aria-label={`Remove ${it.name || 'cost line'}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                {overCount && (
                  <p className="col-span-2 md:col-span-12 text-xs text-amber-700">
                    {it.quantity} people selected, but only {travelerCount} are booked.
                  </p>
                )}
              </div>
            );
          })}
          <div className="flex justify-between text-sm px-2">
            <span className="text-dark-muted">Other Trip Costs total</span>
            <span className="text-dark font-medium">{formatPrice(total)}</span>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-dark-muted">Quick add:</span>
        {PRESETS.map(p => (
          <button
            key={p.name}
            type="button"
            onClick={() => add(p)}
            className="text-xs px-2.5 py-1 rounded-full border border-background-warm text-dark hover:bg-background-warm/60 transition-colors"
          >
            + {p.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => add()}
          className="text-xs px-2.5 py-1 rounded-full border border-primary/40 text-primary hover:bg-primary/5 inline-flex items-center gap-1 transition-colors"
        >
          <Plus size={12} /> Custom line
        </button>
      </div>
    </div>
  );
}
