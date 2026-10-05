import { Plus, Trash as Trash2 } from '@phosphor-icons/react';
import type { TripOrganiserExpense } from '../../types/types-index';
import { formatPrice } from '../../utils/utils-index';
import { inputClass } from './useTripFormModal';

// "Trip Organiser's Expenses" editor for the Finances & Profit tab — the same
// idea as Other Trip Costs (TripCostItemsEditor): one card per expense line,
// a clear total bar and quick-add chips. Simpler on purpose: an organiser
// spends actual amounts, so every line is just Name + Amount (₹) and is never
// multiplied by traveler count. Labels are kept as <label> because the
// modal's "Search fields" box scans them.

// One-tap starters — purely a convenience, every field stays editable. The
// first four are the fields this editor replaced.
const PRESETS: string[] = [
  'Travel Tickets',
  'Agency Payment',
  'Miscellaneous',
  'Own Entry Ticket',
  'Food',
  'Stay',
  'Transport',
  'Tips',
];

let idCounter = 0;
const newId = () => `oe_${Date.now().toString(36)}_${(idCounter++).toString(36)}`;

interface TripOrganiserExpensesEditorProps {
  items: TripOrganiserExpense[];
  onChange: (items: TripOrganiserExpense[]) => void;
}

export default function TripOrganiserExpensesEditor({ items, onChange }: TripOrganiserExpensesEditorProps) {
  const update = (id: string, patch: Partial<TripOrganiserExpense>) =>
    onChange(items.map(it => (it.id === id ? { ...it, ...patch } : it)));
  const remove = (id: string) => onChange(items.filter(it => it.id !== id));
  const add = (name = '') => onChange([...items, { id: newId(), name, amount: null }]);

  const total = items.reduce((sum, it) => sum + Math.max(0, it.amount || 0), 0);

  const rupee = <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-dark-muted pointer-events-none" aria-hidden="true">₹</span>;

  return (
    <div className="md:col-span-2 space-y-3">
      {items.length === 0 && (
        <p className="rounded-md border-2 border-dashed border-background-warm bg-background px-4 py-5 text-center text-xs text-dark-muted">
          No expenses added yet. Tap a quick-add button below, or add a custom line.
        </p>
      )}

      {items.length > 0 && (
        <div className="space-y-3">
          {items.map(it => (
            <div key={it.id} className="rounded-md border-2 border-background-warm bg-white p-3 shadow-sm">
              <div className="grid grid-cols-12 gap-x-3 gap-y-3 items-end">
                <div className="col-span-12 md:col-span-5">
                  <label htmlFor={`oe-name-${it.id}`} className="block text-sm font-medium text-dark mb-1">Name</label>
                  <input
                    id={`oe-name-${it.id}`}
                    value={it.name}
                    onChange={e => update(it.id, { name: e.target.value })}
                    className={inputClass}
                    placeholder="e.g. Travel Tickets"
                  />
                </div>
                <div className="col-span-12 md:col-span-3">
                  <label htmlFor={`oe-amount-${it.id}`} className="block text-sm font-medium text-dark mb-1">Amount (₹)</label>
                  <div className="relative">
                    {rupee}
                    <input
                      id={`oe-amount-${it.id}`}
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={it.amount ?? ''}
                      onChange={e => update(it.id, { amount: e.target.value === '' ? null : +e.target.value })}
                      className={`${inputClass} pl-7`}
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="col-span-12 md:col-span-4 flex items-center justify-between gap-3 rounded-md bg-background-warm px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-2xs text-dark-muted">Expense</p>
                    <p className="text-base font-semibold text-dark leading-tight">{formatPrice(Math.max(0, it.amount || 0))}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(it.id)}
                    className="p-2 rounded-md text-primary/70 hover:text-primary hover:bg-white transition-colors flex-shrink-0"
                    aria-label={`Remove ${it.name || 'expense line'}`}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between rounded-md bg-primary/10 px-4 py-3">
            <span className="text-sm font-medium text-dark">Organiser's Expenses total</span>
            <span className="text-lg text-primary font-semibold">{formatPrice(total)}</span>
          </div>
        </div>
      )}

      <div className="rounded-md border-2 border-dashed border-background-warm p-3 space-y-2">
        <p className="text-sm font-medium text-dark">Quick add</p>
        <div className="flex flex-wrap gap-2 items-center">
          {PRESETS.map(name => (
            <button
              key={name}
              type="button"
              onClick={() => add(name)}
              className="text-xs font-medium px-3 py-1.5 rounded-md border-2 border-background-warm bg-background text-dark hover:border-primary/50 hover:bg-primary/5 transition-colors"
            >
              + {name}
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
