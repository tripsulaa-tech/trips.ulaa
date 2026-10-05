import DatePicker from '../../components/ui/DatePicker';
import { FORM_INPUT_CLASS as inputClass } from '../../constants/formStyles';
import { parseNum, type PricingDraft } from './tripPricingDraft';
import TripPackagesEditor from './TripPackagesEditor';

// Pricing & Availability + Packages for a FINISHED trip, edited from the Trip
// Finance tab. A finished trip has no upcoming_trips row any more, so this is
// saved into its trip_finance_snapshots row (admin-only), never to the public
// trip. Same fields and wording as Edit Trip > Pricing & Availability.

interface Props {
  value: PricingDraft;
  onChange: (next: PricingDraft) => void;
}

const grid = 'grid grid-cols-2 md:grid-cols-4 gap-x-3 sm:gap-x-4 gap-y-4 items-start';
const label = 'block text-sm font-medium text-dark mb-1';

export default function TripPricingEditor({ value: v, onChange }: Props) {
  const set = (patch: Partial<PricingDraft>) => onChange({ ...v, ...patch });
  const today = new Date().toLocaleDateString('en-CA');
  const left = Math.max(0, (Number(v.total_seats) || 0) - (Number(v.seats_booked) || 0));

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-dark">Pricing & Availability</h3>
        <p className="text-xs text-dark-muted">Prices and seats this trip ran with. Saved with the trip's finance, never shown on the public site.</p>
      </div>

      <div className={grid}>
        <div>
          <label htmlFor="tf-total-seats" className={label}>Total Seats</label>
          <input id="tf-total-seats" type="number" min={0} inputMode="numeric" value={v.total_seats} onChange={e => set({ total_seats: parseNum(e.target.value) })} className={inputClass} />
        </div>
        <div>
          <label htmlFor="tf-seats-filled" className={label}>Seats Filled</label>
          <input id="tf-seats-filled" type="number" min={0} inputMode="numeric" value={v.seats_booked} onChange={e => set({ seats_booked: parseNum(e.target.value) })} className={inputClass} />
          {v.total_seats !== '' && <p className="text-xs text-dark-muted mt-1">{left} of {v.total_seats} left</p>}
        </div>
        <div>
          <label htmlFor="tf-price" className={label}>Regular Price (₹)</label>
          <input id="tf-price" type="number" min={0} inputMode="numeric" value={v.price} onChange={e => set({ price: parseNum(e.target.value) })} className={inputClass} placeholder="e.g. 5699" />
        </div>
        <div>
          <label htmlFor="tf-strike" className={label}>Strikeout Price (₹)</label>
          <input id="tf-strike" type="number" min={0} inputMode="numeric" value={v.strike_through_price} onChange={e => set({ strike_through_price: parseNum(e.target.value) })} className={inputClass} />
        </div>
        <div>
          <label htmlFor="tf-early-price" className={label}>Early-Bird Price (₹)</label>
          <input id="tf-early-price" type="number" min={0} inputMode="numeric" value={v.early_bird_price} onChange={e => set({ early_bird_price: parseNum(e.target.value) })} className={inputClass} />
        </div>
        <div>
          <label htmlFor="tf-early-deadline" className={label}>Early-Bird Till</label>
          <DatePicker id="tf-early-deadline" value={v.early_bird_deadline} onChange={early_bird_deadline => set({ early_bird_deadline })} />
        </div>
        <div>
          <label htmlFor="tf-advance" className={label}>Advance / Reservation (₹)</label>
          <input id="tf-advance" type="number" min={0} inputMode="numeric" value={v.advance_amount} onChange={e => set({ advance_amount: parseNum(e.target.value) })} className={inputClass} />
        </div>
      </div>

      <div className="rounded-lg border border-background-warm p-3 space-y-3">
        <p className="text-sm font-medium text-dark">Special Offer <span className="text-xs font-normal text-dark-muted">(optional)</span></p>
        <div className={grid}>
          <div>
            <label htmlFor="tf-offer-name" className={label}>Offer Name</label>
            <input id="tf-offer-name" value={v.special_offer_name} onChange={e => set({ special_offer_name: e.target.value })} className={inputClass} placeholder="e.g. Diwali Dhamaka" />
          </div>
          <div>
            <label htmlFor="tf-offer-price" className={label}>Offer Price (₹)</label>
            <input id="tf-offer-price" type="number" min={0} inputMode="numeric" value={v.special_offer_price} onChange={e => set({ special_offer_price: parseNum(e.target.value) })} className={inputClass} />
          </div>
          <div>
            <label htmlFor="tf-offer-start" className={label}>Starts</label>
            <DatePicker
              id="tf-offer-start"
              value={v.special_offer_date}
              onChange={special_offer_date => set({
                special_offer_date,
                special_offer_end_date: v.special_offer_end_date && v.special_offer_end_date < special_offer_date ? special_offer_date : v.special_offer_end_date,
              })}
            />
          </div>
          <div>
            <label htmlFor="tf-offer-end" className={label}>Ends</label>
            <DatePicker id="tf-offer-end" value={v.special_offer_end_date} onChange={special_offer_end_date => set({ special_offer_end_date })} min={v.special_offer_date || undefined} />
          </div>
        </div>
      </div>

      <TripPackagesEditor
        value={v.trip_options}
        regularPrice={Number(v.price) || 0}
        earlyBirdPrice={v.early_bird_price === '' ? null : Number(v.early_bird_price)}
        earlyBirdOpen={!!v.early_bird_deadline && v.early_bird_deadline >= today}
        onChange={trip_options => set({ trip_options })}
      />
    </div>
  );
}
