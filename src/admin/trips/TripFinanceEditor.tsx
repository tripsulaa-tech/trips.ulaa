import Select from '../../components/ui/Select';
import { formatPrice } from '../../utils/utils-index';
import { computeTripFinanceSummary } from '../../utils/tripFinance';
import type { TripFinance, TripOption } from '../../types/types-index';
import type { TripRevenue } from './useTripFinanceData';
import { inputClass } from './useTripFormModal';
import TripCostItemsEditor from './TripCostItemsEditor';
import TripOrganiserExpensesEditor from './TripOrganiserExpensesEditor';

// Same responsive grids the Add/Edit Trip modal uses for groups of short
// fields (kept identical so this panel looks the same wherever it appears).
const FIELD_GRID_BASE =
  'md:col-span-2 grid gap-x-3 sm:gap-x-4 gap-y-4 items-start ' +
  '[&>div>label]:flex [&>div>label]:items-end [&>div>label]:min-h-10 sm:[&>div>label]:min-h-0';
const FIELD_GRID_4 = `${FIELD_GRID_BASE} grid-cols-2 md:grid-cols-4`;
const FIELD_GRID_3 = `${FIELD_GRID_BASE} grid-cols-2 sm:grid-cols-3`;

/** Label that shows a short word on phones and the full text from `sm` up. */
function ShortLabel({ full, short }: { full: string; short: string }) {
  return (
    <>
      <span className="sm:hidden">{short}</span>
      <span className="hidden sm:inline">{full}</span>
    </>
  );
}

interface TripFinanceEditorProps {
  finance: TripFinance;
  onChange: (next: TripFinance) => void;
  /** The trip's add-on options, so a cost line can be linked to one. */
  options: TripOption[];
  /** Real booking numbers. Null = nothing real to use yet, fall back to `estimate`. */
  revenue: TripRevenue | null;
  /** Seats x regular price, only used while `revenue` is null. */
  estimate: { seats: number; price: number };
}

/** The whole "Finances & Profit" form: Ulaa's costs, agency, child fare,
 *  organiser expenses, notes and the live Profit Summary. Shared by the
 *  Add/Edit Trip modal's tab and the Trip Finance page's edit dialog, so the
 *  two are always the same form. Renders a fragment of grid children — wrap it
 *  in `grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4`. */
export default function TripFinanceEditor({ finance, onChange, options, revenue, estimate }: TripFinanceEditorProps) {
  return (
    <>
      <div className="md:col-span-2 bg-amber-50 border border-amber-200 rounded-md p-3">
        <p className="text-xs text-amber-800">
          Internal record only — none of this is ever shown on the public site. Use it to track what this trip costs to run and what it earns.
        </p>
      </div>

      <div className="md:col-span-2">
        <h4 className="text-sm font-semibold text-dark mb-1">Ulaa's Costs</h4>
        <p className="text-xs text-dark-muted -mt-0.5 mb-2">What Ulaa spends on this trip: ads, tickets, kits, transport, stay, food and more. One line per cost.</p>
      </div>
      <TripCostItemsEditor
        embedded
        items={finance.cost_items || []}
        travelerCount={revenue ? revenue.bookedCount : estimate.seats}
        options={options}
        optionCounts={revenue?.optionCounts ?? {}}
        onChange={cost_items => onChange({ ...finance, cost_items })}
      />

      <div className="md:col-span-2 pt-2 border-t border-background-warm">
        <h4 className="text-sm font-semibold text-dark mb-1">On-Ground Agency (paid by Ulaa)</h4>
        <p className="text-xs text-dark-muted -mt-0.5 mb-2">Local agency that runs the trip.</p>
      </div>
      <div className={FIELD_GRID_3}>
        <div>
          <label htmlFor="trip-agency-name" className="block text-sm font-medium text-dark mb-1">Name</label>
          <input
            id="trip-agency-name"
            value={finance.agency_name}
            onChange={e => onChange({ ...finance, agency_name: e.target.value })}
            className={inputClass}
            placeholder="e.g. Spiti Adventures"
          />
        </div>
        <div>
          <label htmlFor="trip-agency-amount-type" className="block text-sm font-medium text-dark mb-1"><ShortLabel full="Payment Type" short="Pay Type" /></label>
          <Select
            inputId="trip-agency-amount-type"
            value={finance.agency_amount_type}
            onChange={val => onChange({ ...finance, agency_amount_type: val as 'fixed' | 'per_traveler' })}
            options={[
              { value: 'fixed', label: 'Fixed lump sum' },
              { value: 'per_traveler', label: 'Per traveler' },
            ]}
          />
          <p id="trip-agency-type-hint" className="text-xs text-dark-muted mt-1">Fixed total, or a rate per traveler.</p>
        </div>
        <div>
          <label htmlFor="trip-agency-amount" className="block text-sm font-medium text-dark mb-1">
            <ShortLabel
              full={`Amount Paid (₹${finance.agency_amount_type === 'per_traveler' ? ' per person' : ' total'})`}
              short={finance.agency_amount_type === 'per_traveler' ? 'Per Person (₹)' : 'Total (₹)'}
            />
          </label>
          <input
            id="trip-agency-amount"
            type="number"
            min={0}
            value={finance.agency_amount ?? ''}
            onChange={e => onChange({ ...finance, agency_amount: e.target.value === '' ? null : +e.target.value })}
            aria-describedby="trip-agency-amount-hint"
            className={inputClass}
            placeholder="e.g. 29300"
          />
        </div>
        <p id="trip-agency-amount-hint" className="col-span-2 sm:col-span-3 text-xs text-dark-muted -mt-1">Example: traveler pays ₹39,999, agency gets ₹29,300.</p>
      </div>

      <div className="md:col-span-2 pt-2 border-t border-background-warm">
        <h4 className="text-sm font-semibold text-dark mb-1">Child Fare</h4>
        <p className="text-xs text-dark-muted -mt-0.5 mb-2">
          One flat rate for the whole trip, used for every child add-on. Once set, the add-on amount auto-fills and stays locked.
        </p>
      </div>
      <div className={FIELD_GRID_4}>
        <div>
          <label htmlFor="trip-child-fare-amount" className="block text-sm font-medium text-dark mb-1"><ShortLabel full="Amount (₹)" short="Amount (₹)" /></label>
          <input
            id="trip-child-fare-amount"
            type="number"
            min={0}
            value={finance.child_fare_amount ?? ''}
            onChange={e => onChange({ ...finance, child_fare_amount: e.target.value === '' ? null : +e.target.value })}
            aria-describedby="trip-child-fare-amount-hint"
            className={inputClass}
            placeholder="e.g. 8000"
          />
          <p id="trip-child-fare-amount-hint" className="text-xs text-dark-muted mt-1">
            Charged to the traveler per child.
          </p>
        </div>
        <div>
          <label htmlFor="trip-child-fare-vendor" className="block text-sm font-medium text-dark mb-1"><ShortLabel full="Vendor Amount (₹)" short="Vendor (₹)" /></label>
          <input
            id="trip-child-fare-vendor"
            type="number"
            min={0}
            value={finance.child_fare_vendor_amount ?? ''}
            onChange={e => onChange({ ...finance, child_fare_vendor_amount: e.target.value === '' ? null : +e.target.value })}
            aria-describedby="trip-child-fare-vendor-hint"
            className={inputClass}
            placeholder="e.g. 7000"
          />
          <p id="trip-child-fare-vendor-hint" className="text-xs text-dark-muted mt-1">
            Ulaa pays the agency per child. Separate from the adult rate.
          </p>
        </div>
        <div>
          <label htmlFor="trip-child-fare-entry-ticket" className="block text-sm font-medium text-dark mb-1"><ShortLabel full="Entry Ticket Cost (₹)" short="Entry Ticket (₹)" /></label>
          <input
            id="trip-child-fare-entry-ticket"
            type="number"
            min={0}
            value={finance.child_fare_entry_ticket_cost ?? ''}
            onChange={e => onChange({ ...finance, child_fare_entry_ticket_cost: e.target.value === '' ? null : +e.target.value })}
            className={inputClass}
            placeholder="Per child"
          />
        </div>
        <div>
          <label htmlFor="trip-child-fare-kit" className="block text-sm font-medium text-dark mb-1"><ShortLabel full="Kit Cost (₹)" short="Kit (₹)" /></label>
          <input
            id="trip-child-fare-kit"
            type="number"
            min={0}
            value={finance.child_fare_kit_cost ?? ''}
            onChange={e => onChange({ ...finance, child_fare_kit_cost: e.target.value === '' ? null : +e.target.value })}
            aria-describedby="trip-child-fare-kit-hint"
            className={inputClass}
            placeholder="Per child"
          />
          <p id="trip-child-fare-kit-hint" className="text-xs text-dark-muted mt-1">
            Enter 0 only if no kit is given.
          </p>
        </div>
      </div>

      <div className="md:col-span-2 pt-2 border-t border-background-warm">
        <h4 className="text-sm font-semibold text-dark mb-1">Trip Organiser's Expenses</h4>
        <p className="text-xs text-dark-muted -mt-0.5 mb-2">
          What the on-ground organiser spends: travel tickets, agency payment, food, tips and more. One line per expense. Enter actual amounts; they are not multiplied by traveler count.
        </p>
      </div>
      <div className={FIELD_GRID_3}>
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="trip-organiser-name" className="block text-sm font-medium text-dark mb-1"><ShortLabel full="Name" short="Name" /></label>
          <input
            id="trip-organiser-name"
            value={finance.organiser_name}
            onChange={e => onChange({ ...finance, organiser_name: e.target.value })}
            className={inputClass}
            placeholder="e.g. Rahul"
            aria-describedby="trip-organiser-name-hint"
          />
          <p id="trip-organiser-name-hint" className="text-xs text-dark-muted mt-1">Person running the trip on the ground.</p>
        </div>
      </div>
      <TripOrganiserExpensesEditor
        items={finance.organiser_expenses || []}
        onChange={organiser_expenses => onChange({ ...finance, organiser_expenses })}
      />
      <div className="md:col-span-2">
        <label htmlFor="trip-finance-notes" className="block text-sm font-medium text-dark mb-1">Notes</label>
        <textarea
          id="trip-finance-notes"
          value={finance.notes}
          onChange={e => onChange({ ...finance, notes: e.target.value })}
          rows={3}
          className={`${inputClass} resize-none`}
          placeholder="Payment terms, receipts, anything worth remembering about this trip's money"
          aria-describedby="trip-finance-notes-hint"
        />
        <p id="trip-finance-notes-hint" className="text-xs text-dark-muted mt-1">Internal only. Not shown to travelers.</p>
      </div>

      {(() => {
        // Prefer real revenue (sum of actual bookings' total_amount)
        // whenever we have it. Falls back to booked seats x regular
        // price only while that fetch is loading or for a brand-new
        // trip with nothing booked yet — see useTripFinanceData.
        const usingReal = !!revenue;
        const s = revenue
          ? computeTripFinanceSummary(finance, revenue.bookedCount, revenue.totalRevenue, revenue.childFareCount, revenue.optionCounts)
          : computeTripFinanceSummary(finance, estimate.seats, estimate.price * estimate.seats);
        return (
          <div className="md:col-span-2 bg-background-warm/60 rounded-md p-4 space-y-1.5 text-sm">
            <h4 className="text-sm font-semibold text-dark mb-1">Profit Summary <span className="font-normal text-dark-muted text-xs">
              {usingReal
                ? `(${s.travelerCount} real booking${s.travelerCount === 1 ? '' : 's'}, actual invoiced amounts)`
                : `(estimate: ${s.travelerCount} seats × regular price; no bookings yet)`}
            </span></h4>
            <div className="flex justify-between"><span className="text-dark-muted">Total Revenue</span><span className="text-dark font-medium">{formatPrice(s.totalRevenue)}</span></div>
            <div className="flex justify-between border-t border-background-warm pt-1.5"><span className="text-dark-muted">Ulaa's Total Costs</span><span className="text-dark font-medium">{formatPrice(s.ulaaCosts)}</span></div>
            <div className="flex justify-between pl-4 text-xs"><span className="text-dark-muted">Agency Cost</span><span className="text-dark-muted">{formatPrice(s.agencyCost)}</span></div>
            {s.costItems.map(c => (
              <div key={c.id} className="flex justify-between pl-4 text-xs"><span className="text-dark-muted">{c.name || 'Unnamed cost'}{c.basis !== 'fixed' ? ` (${c.qty} × ${formatPrice(c.rate)})` : ''}</span><span className="text-dark-muted">{formatPrice(c.amount)}</span></div>
            ))}
            {s.childFareCount > 0 && (
              <>
                <div className="flex justify-between pl-4 text-xs"><span className="text-dark-muted">Child Fare Costs ({s.childFareCount})</span><span className="text-dark-muted">{formatPrice(s.childFareCosts)}</span></div>
                <div className="flex justify-between pl-8 text-xs"><span className="text-dark-muted">Vendor</span><span className="text-dark-muted">{formatPrice(s.childFareVendorCost)}</span></div>
                <div className="flex justify-between pl-8 text-xs"><span className="text-dark-muted">Entry Ticket</span><span className="text-dark-muted">{formatPrice(s.childFareEntryTicketCost)}</span></div>
                <div className="flex justify-between pl-8 text-xs"><span className="text-dark-muted">Kit</span><span className="text-dark-muted">{formatPrice(s.childFareKitCost)}</span></div>
              </>
            )}
            <div className="flex justify-between border-t border-background-warm pt-1.5"><span className="text-dark-muted">Trip Organiser's Expenses</span><span className="text-dark font-medium">{formatPrice(s.organiserCosts)}</span></div>
            {s.organiserItems.map(c => (
              <div key={c.id} className="flex justify-between pl-4 text-xs"><span className="text-dark-muted">{c.name || 'Unnamed expense'}</span><span className="text-dark-muted">{formatPrice(c.amount)}</span></div>
            ))}
            <div className="flex justify-between border-t border-background-warm pt-1.5"><span className="text-dark-muted">Total Costs</span><span className="text-dark font-medium">{formatPrice(s.totalCosts)}</span></div>
            <div className="flex justify-between border-t-2 border-primary/30 pt-1.5 text-base"><span className="font-semibold text-dark">Net Profit</span><span className={`font-bold ${s.netProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatPrice(s.netProfit)}</span></div>
            <div className="flex justify-between text-xs"><span className="text-dark-muted">Profit per Traveler</span><span className="text-dark-muted">{formatPrice(Math.round(s.profitPerPerson))}</span></div>
          </div>
        );
      })()}
    </>
  );
}
