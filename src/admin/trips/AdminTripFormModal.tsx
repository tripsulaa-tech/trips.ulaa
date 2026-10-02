import { useState } from 'react';
import {
  Plus,
  Trash as Trash2,
  MagnifyingGlass as Search,
  MapPin,
  X,
  IdentificationCard,
  Tag,
  ChartLineUp,
  Images,
  Path,
  Backpack,
  Bed,
  UserCircle,
  Image as ImageIcon,
  FileText,
  Question,
  ShieldCheck,
  RocketLaunch,
  PencilSimple,
} from '@phosphor-icons/react';
import Button from '../../components/ui/Button';
import Select from '../../components/ui/Select';
import Modal from '../../components/ui/Modal';
import Tabs, { TabPanel } from '../../components/ui/Tabs';
import ImageUploadField from '../../components/ui/ImageUploadField';
import MultiImageUploadField from '../../components/ui/MultiImageUploadField';
import CoverImageCropEditor from '../../components/ui/CoverImageCropEditor';
import TagListEditor from '../../components/ui/TagListEditor';
import ItineraryEditor from '../../components/ui/ItineraryEditor';
import FAQEditor from '../../components/ui/FAQEditor';
import CancellationPolicyEditor from '../../components/ui/CancellationPolicyEditor';
import TermsEditor from '../../components/ui/TermsEditor';
import DatePicker from '../../components/ui/DatePicker';
import TripHighlightIconPicker from '../../components/ui/TripHighlightIconPicker';
import MeetingPointMapPicker from '../../components/ui/MeetingPointMapPicker';
import { COVER_IMAGE_TARGET_SIZE_BYTES } from '../../services/api';
import type { UpcomingTrip, TripLeader } from '../../types/types-index';
import { slugify, formatPrice } from '../../utils/utils-index';
import { computeTripFinanceSummary } from '../../utils/tripFinance';
import type { TripRevenue } from './useTripFinanceData';
import { computeDuration, type TripForm } from './tripFormTypes';
import { inputClass } from './useTripFormModal';
import TripCostItemsEditor from './TripCostItemsEditor';
import TripPackagesEditor from './TripPackagesEditor';

interface AdminTripFormModalProps {
  modalOpen: boolean;
  closeModal: () => void;
  editingTrip: UpcomingTrip | null;
  form: TripForm;
  setForm: React.Dispatch<React.SetStateAction<TripForm>>;
  modalSearch: string;
  setModalSearch: (value: string) => void;
  modalSearchNoMatch: boolean;
  modalBodyRef: React.RefObject<HTMLDivElement | null>;
  saving: boolean;
  handleSave: () => void;
  commitGroupBulletDraft: (gi: number, el: HTMLTextAreaElement) => void;
  // Real revenue for editingTrip, summed from actual bookings' total_amount
  // — see useTripFinanceData. Null while that fetch is still loading, and
  // for a brand-new trip that hasn't been saved yet (no id to look
  // enquiries up by); the Profit Summary below falls back to the old
  // seats_booked x price estimate in either case.
  actualRevenue?: TripRevenue | null;
  // The Trip Leaders directory (Admin → Trip Leaders) — see
  // AdminTripLeaders.tsx — offered as an "assign from directory" picker on
  // the Trip Leader tab so the admin doesn't have to retype the same bio.
  tripLeaders: TripLeader[];
  // Jumps to Admin → Trip Leaders to edit the given leader (or add a new one)
  // and brings the admin back to this modal, with everything typed so far
  // still in place, afterwards. See AdminTrips' openLeadersFromTrip.
  onManageLeader: (target: { leaderId?: string; create?: boolean }) => void;
}

/** The Add/Edit Trip modal — every field on the trip form, laid out across
 *  14 tabs (Basic Info, Pricing, Finances & Profit, Media, Itinerary,
 *  Inclusions, ...). Split
 *  out of the original single-file AdminTrips.tsx — see that component's
 *  own comment for the rest of the split. All form state lives in the
 *  parent's useTripFormModal hook; this component is deliberately just the
 *  view over `form`/`setForm`. */
// Responsive grids for groups of short fields (numbers, amounts, short text),
// so boxes don't stretch to half the modal for a value like "8000":
//   FIELD_GRID_4 (groups of 4): 2 per row on phones/tablets, 4 on desktop.
//   FIELD_GRID_3 (groups of 3 or 5): 2 per row on phones, 3 on tablets/desktop.
// Labels reserve two lines below `lg` so a wrapped label never pushes its
// input out of line with the input next to it.
const FIELD_GRID_BASE =
  'md:col-span-2 grid gap-x-3 sm:gap-x-4 gap-y-4 items-start ' +
  '[&>div>label]:flex [&>div>label]:items-end [&>div>label]:min-h-10 sm:[&>div>label]:min-h-0';
const FIELD_GRID_4 = `${FIELD_GRID_BASE} grid-cols-2 md:grid-cols-4`;
const FIELD_GRID_3 = `${FIELD_GRID_BASE} grid-cols-2 sm:grid-cols-3`;
// 5 short boxes: 2 per row on phones, 3 on tablets, all 5 on wide desktop.
const FIELD_GRID_5 = `${FIELD_GRID_BASE} grid-cols-2 sm:grid-cols-3 lg:grid-cols-5`;
// Same as FIELD_GRID_4 but without md:col-span-2, for use inside a nested box.
const FIELD_GRID_4_NESTED = FIELD_GRID_4.replace('md:col-span-2 ', '');

/** Label that shows a short word on phones and the full text from `sm` up. */
function ShortLabel({ full, short }: { full: string; short: string }) {
  return (
    <>
      <span className="sm:hidden">{short}</span>
      <span className="hidden sm:inline">{full}</span>
    </>
  );
}

/** "Open to ages 18–45" style summary of the Min/Max Age fields. */
function ageSummary(min: number | '', max: number | ''): string {
  const hasMin = min !== '';
  const hasMax = max !== '';
  if (hasMin && hasMax) return `Open to ages ${min}–${max}.`;
  if (hasMin) return `Open to ages ${min} and above.`;
  if (hasMax) return `Open to ages up to ${max}.`;
  return 'Open to all ages.';
}

export default function AdminTripFormModal({
  modalOpen, closeModal, editingTrip, form, setForm,
  modalSearch, setModalSearch, modalSearchNoMatch, modalBodyRef,
  saving, handleSave, commitGroupBulletDraft, actualRevenue, tripLeaders, onManageLeader,
}: AdminTripFormModalProps) {
  const [mapPickerOpen, setMapPickerOpen] = useState(false);

  return (
    <>
      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editingTrip ? 'Edit Trip' : 'Add Trip'}
        size="2xl"
        bodyRef={modalBodyRef}
        mobileFullScreen
        compactHeader
        headerContent={
          <div className="relative w-full sm:max-w-xs">
            <label htmlFor="trip-field-search" className="sr-only">Search fields</label>
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-muted pointer-events-none" aria-hidden="true" />
            <input
              id="trip-field-search"
              type="text"
              value={modalSearch}
              onChange={e => setModalSearch(e.target.value)}
              placeholder="Search fields..."
              className="w-full pl-9 pr-3 py-2 rounded-md border-2 border-background-warm bg-background font-body text-dark text-sm focus:border-primary outline-none transition-colors"
            />
          </div>
        }
        footer={
          <div className="flex gap-3">
            <Button variant="outline" size="md" className="flex-1 max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]" onClick={closeModal}>Cancel</Button>
            <Button variant="primary" size="md" className="flex-1 max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]" onClick={handleSave} loading={saving}>
              {editingTrip ? 'Save Changes' : 'Create Trip'}
            </Button>
          </div>
        }
      >
        {modalSearchNoMatch && (
          <p role="status" className="text-xs text-red-500 -mt-2 mb-3">No matching field found for "{modalSearch}".</p>
        )}
        <div>
          <Tabs scrollContainerRef={modalBodyRef}>
          <TabPanel label="Basic Info" icon={<IdentificationCard size={15} />}>
            <div className="md:col-span-2">
              <label htmlFor="trip-title" className="block text-sm font-medium text-dark mb-1">Trip Title *</label>
              <input id="trip-title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className={inputClass} placeholder="e.g. Spiti Valley Winter Expedition" aria-describedby="trip-title-hint" />
              <p id="trip-title-hint" className="text-xs text-dark-muted mt-1">Shown on the Trip Card and trip page.</p>
            </div>
            <div className="md:col-span-2 grid grid-cols-2 gap-x-3 sm:gap-x-4 items-start">
              <div>
                <label htmlFor="trip-destination" className="block text-sm font-medium text-dark mb-1">Destination *</label>
                <input id="trip-destination" value={form.destination} onChange={e => setForm(f => ({ ...f, destination: e.target.value }))} className={inputClass} placeholder="e.g. Spiti, HP" aria-describedby="trip-destination-hint" />
                <p id="trip-destination-hint" className="text-xs text-dark-muted mt-1">Place the trip goes to.</p>
              </div>
              <div>
                <label htmlFor="trip-duration" className="block text-sm font-medium text-dark mb-1">Duration *</label>
                <input
                  id="trip-duration"
                  value={form.duration}
                  readOnly
                  aria-describedby="trip-duration-hint"
                  className={`${inputClass} bg-background-warm/60 cursor-not-allowed`}
                  placeholder="Auto from dates"
                />
                <p id="trip-duration-hint" className="text-xs text-dark-muted mt-1">
                  Auto-calculated from the dates.
                </p>
              </div>
            </div>
            <div className={FIELD_GRID_4}>
              <div>
                <label htmlFor="trip-start-date" className="block text-sm font-medium text-dark mb-1">Start Date *</label>
                <DatePicker
                  id="trip-start-date"
                  value={form.start_date}
                  onChange={start_date => setForm(f => ({ ...f, start_date, duration: computeDuration(start_date, f.end_date) || f.duration }))}
                />
              </div>
              <div>
                <label htmlFor="trip-end-date" className="block text-sm font-medium text-dark mb-1">End Date *</label>
                <DatePicker
                  id="trip-end-date"
                  value={form.end_date}
                  onChange={end_date => setForm(f => ({ ...f, end_date, duration: computeDuration(f.start_date, end_date) || f.duration }))}
                  min={form.start_date || undefined}
                />
              </div>
              <div>
                <label htmlFor="trip-min-age" className="block text-sm font-medium text-dark mb-1">Min Age</label>
                <input
                  id="trip-min-age"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={form.min_age}
                  onChange={e => setForm(f => ({ ...f, min_age: e.target.value === '' ? '' : +e.target.value }))}
                  className={inputClass}
                  placeholder="e.g. 18"
                />
              </div>
              <div>
                <label htmlFor="trip-max-age" className="block text-sm font-medium text-dark mb-1">Max Age</label>
                <input
                  id="trip-max-age"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={form.max_age}
                  onChange={e => setForm(f => ({ ...f, max_age: e.target.value === '' ? '' : +e.target.value }))}
                  className={inputClass}
                  placeholder="e.g. 45"
                />
              </div>
              <p className="col-span-2 md:col-span-4 text-xs text-dark-muted -mt-2" aria-live="polite">
                {ageSummary(form.min_age, form.max_age)}{' '}
                Leave blank for no limit.
              </p>
            </div>
            <div className="md:col-span-2">
              <label htmlFor="trip-description" className="block text-sm font-medium text-dark mb-1">Description *</label>
              <p id="trip-description-hint" className="text-xs text-dark-muted mb-1">Short overview only. Add the day-wise plan under Itinerary.</p>
              <textarea id="trip-description" aria-describedby="trip-description-hint" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} className={`${inputClass} resize-none`} />
            </div>
          </TabPanel>
          <TabPanel label="Pricing & Availability" icon={<Tag size={15} />}>
            <div className={FIELD_GRID_4}>
              <div>
                <label htmlFor="trip-total-seats" className="block text-sm font-medium text-dark mb-1">Total Seats</label>
                <input id="trip-total-seats" type="number" min={0} inputMode="numeric" value={form.total_seats} onChange={e => setForm(f => ({ ...f, total_seats: +e.target.value }))} aria-describedby="trip-total-seats-hint" className={inputClass} />
                <p id="trip-total-seats-hint" className="text-xs text-dark-muted mt-1">Maximum seats available.</p>
              </div>
              <div>
                <label htmlFor="trip-seats-filled" className="block text-sm font-medium text-dark mb-1">Seats Filled</label>
                <input
                  id="trip-seats-filled"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  max={form.total_seats}
                  value={form.seats_booked}
                  onChange={e => setForm(f => ({ ...f, seats_booked: Math.max(0, Math.min(+e.target.value, f.total_seats)) }))}
                  aria-describedby="trip-seats-filled-hint"
                  className={inputClass}
                />
                <p id="trip-seats-filled-hint" className="text-xs text-dark-muted mt-1">
                  {Math.max(0, form.total_seats - form.seats_booked)} of {form.total_seats} left
                </p>
              </div>
              <div>
                <label htmlFor="trip-type" className="block text-sm font-medium text-dark mb-1">Trip Type</label>
                <Select
                  inputId="trip-type"
                  value={form.trip_type}
                  onChange={val => setForm(f => ({ ...f, trip_type: val as TripForm['trip_type'] }))}
                  options={[
                    { value: '', label: 'Not set' },
                    { value: 'domestic', label: 'Domestic' },
                    { value: 'international', label: 'International' },
                  ]}
                />
                <p className="text-xs text-dark-muted mt-1">
                  Sets the default cancellation rules.
                </p>
              </div>
              <div>
                <label htmlFor="trip-early-bird-deadline" className="block text-sm font-medium text-dark mb-1">
                  <ShortLabel full="Early-Bird Deadline" short="Early-Bird Till" />
                </label>
                <DatePicker
                  id="trip-early-bird-deadline"
                  value={form.early_bird_deadline}
                  onChange={early_bird_deadline => setForm(f => ({ ...f, early_bird_deadline }))}
                />
                <p className="text-xs text-dark-muted mt-1">
                  Early-bird price applies until this date.
                </p>
              </div>
            </div>
            <div className={FIELD_GRID_4}>
              <div>
                <label htmlFor="trip-price" className="block text-sm font-medium text-dark mb-1"><ShortLabel full="Regular Price per person (₹) *" short="Regular Price (₹) *" /></label>
                <input
                  id="trip-price"
                  type="number"
                  value={form.price}
                  onChange={e => setForm(f => ({ ...f, price: e.target.value === '' ? '' : +e.target.value }))}
                  className={inputClass}
                  placeholder="e.g. 42999"
                  aria-describedby="trip-price-hint"
                />
                <p id="trip-price-hint" className="text-xs text-dark-muted mt-1">Standard price per person.</p>
              </div>
              <div>
                <label htmlFor="trip-strike-price" className="block text-sm font-medium text-dark mb-1"><ShortLabel full="Strikeout Price per person (₹)" short="Strikeout (₹)" /></label>
                <input
                  id="trip-strike-price"
                  type="number"
                  value={form.strike_through_price}
                  onChange={e => setForm(f => ({ ...f, strike_through_price: e.target.value === '' ? '' : +e.target.value }))}
                  className={inputClass}
                  placeholder="e.g. 49999"
                  aria-describedby="trip-strike-price-hint"
                />
                <p id="trip-strike-price-hint" className="text-xs text-dark-muted mt-1">Old price, shown crossed out.</p>
              </div>
              <div>
                <label htmlFor="trip-early-bird-price" className="block text-sm font-medium text-dark mb-1"><ShortLabel full="Early-Bird Price per person (₹)" short="Early-Bird (₹)" /></label>
                <input
                  id="trip-early-bird-price"
                  type="number"
                  value={form.early_bird_price}
                  onChange={e => setForm(f => ({ ...f, early_bird_price: e.target.value === '' ? '' : +e.target.value }))}
                  className={inputClass}
                  placeholder="e.g. 39999"
                  aria-describedby="trip-early-bird-price-hint"
                />
                <p id="trip-early-bird-price-hint" className="text-xs text-dark-muted mt-1">Used until the Early-Bird Deadline.</p>
              </div>
              <div>
                <label htmlFor="trip-advance-amount" className="block text-sm font-medium text-dark mb-1"><ShortLabel full="Advance/Reservation Amount (₹)" short="Advance (₹)" /></label>
                <input
                  id="trip-advance-amount"
                  type="number"
                  min={0}
                  value={form.advance_amount}
                  onChange={e => setForm(f => ({ ...f, advance_amount: e.target.value === '' ? '' : +e.target.value }))}
                  aria-describedby="trip-advance-amount-hint"
                  className={inputClass}
                  placeholder="e.g. 8999"
                />
              </div>
              <p id="trip-advance-amount-hint" className="col-span-2 md:col-span-4 text-xs text-dark-muted -mt-1">Shown as "Reserve today with only ₹{form.advance_amount || 'X'}". Leave blank to show seats left instead.</p>
            </div>
            <div className="md:col-span-2 bg-primary/5 border border-primary/20 rounded-md p-3 space-y-3">
              <p className="text-xs text-dark-muted">
                Optional short sale (e.g. "Diwali Dhamaka"). Shows on the Trip Card with an "Offer ends in X days" countdown and stops after the End Date. For a one-day sale, use the same date or leave End Date blank.
              </p>
              <div className={FIELD_GRID_4_NESTED}>
                <div>
                  <label htmlFor="trip-special-offer-name" className="block text-sm font-medium text-dark mb-1">Offer Name</label>
                  <input
                    id="trip-special-offer-name"
                    value={form.special_offer_name}
                    onChange={e => setForm(f => ({ ...f, special_offer_name: e.target.value }))}
                    className={inputClass}
                    placeholder="e.g. Diwali Dhamaka"
                  />
                </div>
                <div>
                  <label htmlFor="trip-special-offer-price" className="block text-sm font-medium text-dark mb-1"><ShortLabel full="Offer Price per person (₹)" short="Offer Price (₹)" /></label>
                  <input
                    id="trip-special-offer-price"
                    type="number"
                    value={form.special_offer_price}
                    onChange={e => setForm(f => ({ ...f, special_offer_price: e.target.value === '' ? '' : +e.target.value }))}
                    className={inputClass}
                    placeholder="e.g. 34999"
                  />
                </div>
                <div>
                  <label htmlFor="trip-special-offer-date" className="block text-sm font-medium text-dark mb-1"><ShortLabel full="Offer Start Date" short="Starts" /></label>
                  <DatePicker
                    id="trip-special-offer-date"
                    value={form.special_offer_date}
                    onChange={special_offer_date => setForm(f => ({
                      ...f,
                      special_offer_date,
                      // Keep a set End Date from silently sitting before the
                      // new Start Date — nudge it forward instead of leaving
                      // an invalid range for the admin to notice at save time.
                      special_offer_end_date: f.special_offer_end_date && f.special_offer_end_date < special_offer_date
                        ? special_offer_date
                        : f.special_offer_end_date,
                    }))}
                  />
                </div>
                <div>
                  <label htmlFor="trip-special-offer-end-date" className="block text-sm font-medium text-dark mb-1"><ShortLabel full="Offer End Date" short="Ends" /></label>
                  <DatePicker
                    id="trip-special-offer-end-date"
                    value={form.special_offer_end_date}
                    onChange={special_offer_end_date => setForm(f => ({ ...f, special_offer_end_date }))}
                    min={form.special_offer_date || undefined}
                    placeholder="Same as start"
                  />
                </div>
              </div>
            </div>
            <div className="md:col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-semibold text-dark">Trip Card Feature Tags</label>
                {form.card_feature_tags.length < 4 && (
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, card_feature_tags: [...f.card_feature_tags, { icon: '', label: '' }] }))}
                    className="flex items-center gap-1 text-xs font-medium text-primary border border-primary rounded-md px-2.5 py-1.5 hover:bg-primary/5 transition-colors"
                  >
                    <Plus size={13} aria-hidden="true" /> Add Tag
                  </button>
                )}
              </div>
              <p className="text-xs text-dark-muted -mt-1">
                Up to 4 tags on the Trip Card (e.g. "Girls-Only"). Leave empty to show travelers, age range, duration and destinations automatically.
              </p>
              {form.card_feature_tags.map((tag, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="w-32 flex-shrink-0">
                    <label htmlFor={`trip-card-tag-icon-${i}`} className="sr-only">Icon for tag {i + 1}</label>
                    <TripHighlightIconPicker
                      id={`trip-card-tag-icon-${i}`}
                      value={tag.icon}
                      hintText={tag.label}
                      onChange={key => setForm(f => ({ ...f, card_feature_tags: f.card_feature_tags.map((t, idx) => idx === i ? { ...t, icon: key } : t) }))}
                    />
                  </div>
                  <label htmlFor={`trip-card-tag-label-${i}`} className="sr-only">Tag {i + 1} label</label>
                  <input id={`trip-card-tag-label-${i}`} value={tag.label} onChange={e => setForm(f => ({ ...f, card_feature_tags: f.card_feature_tags.map((t, idx) => idx === i ? { ...t, label: e.target.value } : t) }))} className={`${inputClass} flex-1`} placeholder="e.g. Girls-Only" />
                  <button type="button" onClick={() => setForm(f => ({ ...f, card_feature_tags: f.card_feature_tags.filter((_, idx) => idx !== i) }))} aria-label={`Remove tag ${i + 1}`} className="p-1.5 rounded text-primary/70 hover:text-primary hover:bg-primary/5 transition-colors flex-shrink-0"><Trash2 size={13} aria-hidden="true" /></button>
                </div>
              ))}
              {form.card_feature_tags.length === 0 && <p className="text-xs text-dark-muted">No custom tags. The card shows travelers, age range, duration and destinations.</p>}
            </div>
            <TripPackagesEditor
              value={form.trip_options}
              regularPrice={Number(form.price) || 0}
              earlyBirdPrice={form.early_bird_price ? Number(form.early_bird_price) : null}
              earlyBirdOpen={!!form.early_bird_deadline && form.early_bird_deadline >= new Date().toISOString().slice(0, 10)}
              onChange={trip_options => setForm(f => ({ ...f, trip_options }))}
            />
          </TabPanel>
          <TabPanel label="Finances & Profit" icon={<ChartLineUp size={15} />}>
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
              items={form.trip_finance.cost_items || []}
              travelerCount={actualRevenue ? actualRevenue.bookedCount : form.seats_booked}
              options={form.trip_options.options}
              optionCounts={actualRevenue?.optionCounts ?? {}}
              onChange={cost_items => setForm(f => ({ ...f, trip_finance: { ...f.trip_finance, cost_items } }))}
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
                  value={form.trip_finance.agency_name}
                  onChange={e => setForm(f => ({ ...f, trip_finance: { ...f.trip_finance, agency_name: e.target.value } }))}
                  className={inputClass}
                  placeholder="e.g. Spiti Adventures"
                />
              </div>
              <div>
                <label htmlFor="trip-agency-amount-type" className="block text-sm font-medium text-dark mb-1"><ShortLabel full="Payment Type" short="Pay Type" /></label>
                <Select
                  inputId="trip-agency-amount-type"
                  value={form.trip_finance.agency_amount_type}
                  onChange={val => setForm(f => ({ ...f, trip_finance: { ...f.trip_finance, agency_amount_type: val as 'fixed' | 'per_traveler' } }))}
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
                    full={`Amount Paid (₹${form.trip_finance.agency_amount_type === 'per_traveler' ? ' per person' : ' total'})`}
                    short={form.trip_finance.agency_amount_type === 'per_traveler' ? 'Per Person (₹)' : 'Total (₹)'}
                  />
                </label>
                <input
                  id="trip-agency-amount"
                  type="number"
                  min={0}
                  value={form.trip_finance.agency_amount ?? ''}
                  onChange={e => setForm(f => ({ ...f, trip_finance: { ...f.trip_finance, agency_amount: e.target.value === '' ? null : +e.target.value } }))}
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
                  value={form.trip_finance.child_fare_amount ?? ''}
                  onChange={e => setForm(f => ({ ...f, trip_finance: { ...f.trip_finance, child_fare_amount: e.target.value === '' ? null : +e.target.value } }))}
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
                  value={form.trip_finance.child_fare_vendor_amount ?? ''}
                  onChange={e => setForm(f => ({ ...f, trip_finance: { ...f.trip_finance, child_fare_vendor_amount: e.target.value === '' ? null : +e.target.value } }))}
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
                  value={form.trip_finance.child_fare_entry_ticket_cost ?? ''}
                  onChange={e => setForm(f => ({ ...f, trip_finance: { ...f.trip_finance, child_fare_entry_ticket_cost: e.target.value === '' ? null : +e.target.value } }))}
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
                  value={form.trip_finance.child_fare_kit_cost ?? ''}
                  onChange={e => setForm(f => ({ ...f, trip_finance: { ...f.trip_finance, child_fare_kit_cost: e.target.value === '' ? null : +e.target.value } }))}
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
                What the on-ground organiser spends. Enter actual amounts; they are not multiplied by traveler count.
              </p>
            </div>
            <div className={FIELD_GRID_5}>
              <div>
                <label htmlFor="trip-organiser-name" className="block text-sm font-medium text-dark mb-1"><ShortLabel full="Name" short="Name" /></label>
                <input
                  id="trip-organiser-name"
                  value={form.trip_finance.organiser_name}
                  onChange={e => setForm(f => ({ ...f, trip_finance: { ...f.trip_finance, organiser_name: e.target.value } }))}
                  className={inputClass}
                  placeholder="e.g. Rahul"
                  aria-describedby="trip-organiser-name-hint"
                />
                <p id="trip-organiser-name-hint" className="text-xs text-dark-muted mt-1">Person running the trip on the ground.</p>
              </div>
              <div>
                <label htmlFor="trip-organiser-travel" className="block text-sm font-medium text-dark mb-1"><ShortLabel full="Travel Tickets (₹)" short="Travel (₹)" /></label>
                <input
                  id="trip-organiser-travel"
                  type="number"
                  min={0}
                  value={form.trip_finance.organiser_travel_cost ?? ''}
                  onChange={e => setForm(f => ({ ...f, trip_finance: { ...f.trip_finance, organiser_travel_cost: e.target.value === '' ? null : +e.target.value } }))}
                  aria-describedby="trip-organiser-travel-hint"
                  className={inputClass}
                  placeholder="Flight / train / bus"
                />
                <p id="trip-organiser-travel-hint" className="text-xs text-dark-muted mt-1">Own fare to and from the trip.</p>
              </div>
              <div>
                <label htmlFor="trip-organiser-agency" className="block text-sm font-medium text-dark mb-1"><ShortLabel full="Agency Payment (₹)" short="Agency (₹)" /></label>
                <input
                  id="trip-organiser-agency"
                  type="number"
                  min={0}
                  value={form.trip_finance.organiser_agency_payment ?? ''}
                  onChange={e => setForm(f => ({ ...f, trip_finance: { ...f.trip_finance, organiser_agency_payment: e.target.value === '' ? null : +e.target.value } }))}
                  aria-describedby="trip-organiser-agency-hint"
                  className={inputClass}
                  placeholder="If any"
                />
                <p id="trip-organiser-agency-hint" className="text-xs text-dark-muted mt-1">Separate from the agency amount above. Leave blank or 0 if none.</p>
              </div>
              <div>
                <label htmlFor="trip-organiser-misc" className="block text-sm font-medium text-dark mb-1"><ShortLabel full="Miscellaneous (₹)" short="Misc (₹)" /></label>
                <input
                  id="trip-organiser-misc"
                  type="number"
                  min={0}
                  value={form.trip_finance.organiser_misc_expense ?? ''}
                  onChange={e => setForm(f => ({ ...f, trip_finance: { ...f.trip_finance, organiser_misc_expense: e.target.value === '' ? null : +e.target.value } }))}
                  className={inputClass}
                  placeholder="Transport, food, tips"
                  aria-describedby="trip-organiser-misc-hint"
                />
                <p id="trip-organiser-misc-hint" className="text-xs text-dark-muted mt-1">Other on-ground costs not listed above.</p>
              </div>
              <div>
                <label htmlFor="trip-organiser-own-entry-ticket" className="block text-sm font-medium text-dark mb-1"><ShortLabel full="Own Entry Ticket (₹)" short="Own Ticket (₹)" /></label>
                <input
                  id="trip-organiser-own-entry-ticket"
                  type="number"
                  min={0}
                  value={form.trip_finance.organiser_own_entry_ticket ?? ''}
                  onChange={e => setForm(f => ({ ...f, trip_finance: { ...f.trip_finance, organiser_own_entry_ticket: e.target.value === '' ? null : +e.target.value } }))}
                  aria-describedby="trip-organiser-own-entry-ticket-hint"
                  className={inputClass}
                  placeholder="Personal ticket"
                />
                <p id="trip-organiser-own-entry-ticket-hint" className="text-xs text-dark-muted mt-1">Separate from traveler entry tickets.</p>
              </div>
            </div>
            <div className="md:col-span-2">
              <label htmlFor="trip-finance-notes" className="block text-sm font-medium text-dark mb-1">Notes</label>
              <textarea
                id="trip-finance-notes"
                value={form.trip_finance.notes}
                onChange={e => setForm(f => ({ ...f, trip_finance: { ...f.trip_finance, notes: e.target.value } }))}
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
              const usingReal = !!actualRevenue;
              const s = actualRevenue
                ? computeTripFinanceSummary(form.trip_finance, actualRevenue.bookedCount, actualRevenue.totalRevenue, actualRevenue.childFareCount, actualRevenue.optionCounts)
                : computeTripFinanceSummary(form.trip_finance, form.seats_booked, (Number(form.price) || 0) * form.seats_booked);
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
                  <div className="flex justify-between pl-4 text-xs"><span className="text-dark-muted">Travel Tickets</span><span className="text-dark-muted">{formatPrice(form.trip_finance.organiser_travel_cost || 0)}</span></div>
                  <div className="flex justify-between pl-4 text-xs"><span className="text-dark-muted">Agency Payment</span><span className="text-dark-muted">{formatPrice(form.trip_finance.organiser_agency_payment || 0)}</span></div>
                  <div className="flex justify-between pl-4 text-xs"><span className="text-dark-muted">Miscellaneous</span><span className="text-dark-muted">{formatPrice(form.trip_finance.organiser_misc_expense || 0)}</span></div>
                  <div className="flex justify-between pl-4 text-xs"><span className="text-dark-muted">Own Entry Ticket</span><span className="text-dark-muted">{formatPrice(form.trip_finance.organiser_own_entry_ticket || 0)}</span></div>
                  <div className="flex justify-between border-t border-background-warm pt-1.5"><span className="text-dark-muted">Total Costs</span><span className="text-dark font-medium">{formatPrice(s.totalCosts)}</span></div>
                  <div className="flex justify-between border-t-2 border-primary/30 pt-1.5 text-base"><span className="font-semibold text-dark">Net Profit</span><span className={`font-bold ${s.netProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatPrice(s.netProfit)}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-dark-muted">Profit per Traveler</span><span className="text-dark-muted">{formatPrice(Math.round(s.profitPerPerson))}</span></div>
                </div>
              );
            })()}
          </TabPanel>
          <TabPanel label="Media" icon={<Images size={15} />}>
            <div className="md:col-span-2 space-y-3">
              <ImageUploadField
                label="Cover Image"
                value={form.cover_image}
                // A new/replaced image invalidates any saved position — the
                // old focal point/zoom was framed for a different photo —
                // so it resets to null (falls back to centered, no zoom)
                // rather than silently misapplying to the new one.
                onChange={url => setForm(f => ({ ...f, cover_image: url, cover_image_crop: null }))}
                bucket="ulaa"
                pathPrefix="trip-covers"
                fileNamePrefix={editingTrip ? editingTrip.slug : (slugify(form.title) || undefined)}
                maxSizeBytes={COVER_IMAGE_TARGET_SIZE_BYTES}
                hint="Landscape, min 1600×1200px, subject centered. Used for the Trip Card and desktop hero; reposition it for each after upload."
                allowUrl
              />
              {form.cover_image && (
                <CoverImageCropEditor
                  imageUrl={form.cover_image}
                  value={form.cover_image_crop}
                  onChange={cover_image_crop => setForm(f => ({ ...f, cover_image_crop }))}
                />
              )}
              <ImageUploadField
                label="Hero Banner Image (Mobile)"
                value={form.hero_mobile_image}
                onChange={url => setForm(f => ({ ...f, hero_mobile_image: url }))}
                bucket="ulaa"
                pathPrefix="trip-covers/hero-mobile"
                fileNamePrefix={editingTrip ? editingTrip.slug : (slugify(form.title) || undefined)}
                maxSizeBytes={COVER_IMAGE_TARGET_SIZE_BYTES}
                hint="Portrait 9:16, min 1080×1920px. Shown on phones. Optional; falls back to the Cover Image."
                allowUrl
              />
            </div>

            {/* Places You'll Post — gallery with captions */}
            <div className="md:col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-semibold text-dark">Places You'll Definitely Post</label>
                <button type="button" onClick={() => setForm(f => ({ ...f, gallery_items: [...f.gallery_items, { photo: '', description: '' }] }))} className="flex items-center gap-1 text-xs font-medium text-primary border border-primary rounded-md px-2.5 py-1.5 hover:bg-primary/5 transition-colors"><Plus size={13} aria-hidden="true" /> Add Item</button>
              </div>
              <div>
                <label htmlFor="trip-gallery-description" className="block text-sm font-medium text-dark mb-1">Section Description</label>
                <textarea
                  id="trip-gallery-description"
                  value={form.gallery_description}
                  onChange={e => setForm(f => ({ ...f, gallery_description: e.target.value }))}
                  rows={2}
                  className={`${inputClass} resize-none`}
                  placeholder="Short intro paragraph shown below the &quot;Places You'll Definitely Post&quot; heading..."
                  aria-describedby="trip-gallery-description-hint"
                />
                <p id="trip-gallery-description-hint" className="text-xs text-dark-muted mt-1">Intro text under the section heading.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {form.gallery_items.map((item, i) => (
                  <div key={i} className="border border-background-warm rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-dark-muted uppercase tracking-wide">Photo {i + 1}</span>
                      <button type="button" onClick={() => setForm(f => ({ ...f, gallery_items: f.gallery_items.filter((_, idx) => idx !== i) }))} aria-label={`Remove Photo ${i + 1}`} className="p-1 rounded text-primary/70 hover:text-primary hover:bg-primary/5 transition-colors"><Trash2 size={13} aria-hidden="true" /></button>
                    </div>
                    <ImageUploadField
                      label=""
                      value={item.photo}
                      onChange={url => setForm(f => ({ ...f, gallery_items: f.gallery_items.map((it, idx) => idx === i ? { ...it, photo: url } : it) }))}
                      bucket="ulaa"
                      pathPrefix={`trips/${editingTrip ? editingTrip.slug : (slugify(form.title) || 'new-trip')}/gallery`}
                      hint="4:3 landscape, e.g. 1200×900px. Shown in a cropped carousel."
                      aspectRatio="3/2"
                      allowUrl
                    />
                    <div>
                      <label htmlFor={`trip-gallery-caption-${i}`} className="block text-xs font-medium text-dark mb-1">Caption / Place Name</label>
                      <input id={`trip-gallery-caption-${i}`} value={item.description} onChange={e => setForm(f => ({ ...f, gallery_items: f.gallery_items.map((it, idx) => idx === i ? { ...it, description: e.target.value } : it) }))} className={inputClass} placeholder="e.g. Chandratal Lake at dawn" />
                    </div>
                  </div>
                ))}
              </div>
              {form.gallery_items.length === 0 && <p className="text-xs text-dark-muted">No gallery items yet.</p>}
            </div>

            {/* Fashion Aesthetics */}
            <div className="md:col-span-2">
              <MultiImageUploadField
                label="Fashion Aesthetics (outfit inspiration photos)"
                value={form.fashion_photos}
                onChange={urls => setForm(f => ({ ...f, fashion_photos: urls }))}
                bucket="ulaa"
                pathPrefix={`trips/${editingTrip ? editingTrip.slug : (slugify(form.title) || 'new-trip')}/fashion`}
                hint="Any orientation, min 800px on the shortest side. Shown uncropped in a grid."
                allowUrl
              >
                <label htmlFor="trip-fashion-description" className="block text-sm font-medium text-dark mb-1">Section Description</label>
                <textarea
                  id="trip-fashion-description"
                  value={form.fashion_description}
                  onChange={e => setForm(f => ({ ...f, fashion_description: e.target.value }))}
                  rows={2}
                  className={`${inputClass} resize-none`}
                  placeholder="Short intro paragraph shown below the &quot;Fashion Aesthetics&quot; heading..."
                  aria-describedby="trip-fashion-description-hint"
                />
                <p id="trip-fashion-description-hint" className="text-xs text-dark-muted mt-1">Intro text under the section heading.</p>
              </MultiImageUploadField>
            </div>
          </TabPanel>
          <TabPanel label="Overview & Itinerary" icon={<Path size={15} />}>
            {/* Rich Highlight Cards */}
            <div className="md:col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-semibold text-dark">Why You'll Love This Trip</label>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, highlight_cards: [...f.highlight_cards, { icon: '', heading: '', description: '' }] }))}
                  className="flex items-center gap-1 text-xs font-medium text-primary border border-primary rounded-md px-2.5 py-1.5 hover:bg-primary/5 transition-colors"
                >
                  <Plus size={13} aria-hidden="true" /> Add Card
                </button>
              </div>
              <p className="text-xs text-dark-muted -mt-1">Highlight cards on the trip page. Each has an icon, heading and short description.</p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {form.highlight_cards.map((card, i) => (
                  <div key={i} className="border border-background-warm rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-dark-muted uppercase tracking-wide">Card {i + 1}</span>
                      <button type="button" onClick={() => setForm(f => ({ ...f, highlight_cards: f.highlight_cards.filter((_, idx) => idx !== i) }))} aria-label={`Remove Card ${i + 1}`} className="p-1 rounded text-primary/70 hover:text-primary hover:bg-primary/5 transition-colors"><Trash2 size={13} aria-hidden="true" /></button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label htmlFor={`trip-highlight-icon-${i}`} className="block text-xs font-medium text-dark mb-1">Icon</label>
                        <TripHighlightIconPicker
                          id={`trip-highlight-icon-${i}`}
                          value={card.icon}
                          hintText={card.heading}
                          onChange={key => setForm(f => ({ ...f, highlight_cards: f.highlight_cards.map((c, idx) => idx === i ? { ...c, icon: key } : c) }))}
                        />
                      </div>
                      <div>
                        <label htmlFor={`trip-highlight-heading-${i}`} className="block text-xs font-medium text-dark mb-1">Heading</label>
                        <input id={`trip-highlight-heading-${i}`} value={card.heading} onChange={e => setForm(f => ({ ...f, highlight_cards: f.highlight_cards.map((c, idx) => idx === i ? { ...c, heading: e.target.value } : c) }))} className={inputClass} placeholder="e.g. Dreamy Beaches" />
                      </div>
                    </div>
                    <div>
                      <label htmlFor={`trip-highlight-desc-${i}`} className="block text-xs font-medium text-dark mb-1">Description</label>
                      <textarea id={`trip-highlight-desc-${i}`} value={card.description} onChange={e => setForm(f => ({ ...f, highlight_cards: f.highlight_cards.map((c, idx) => idx === i ? { ...c, description: e.target.value } : c) }))} rows={2} className={`${inputClass} resize-none`} />
                    </div>
                  </div>
                ))}
              </div>
              {form.highlight_cards.length === 0 && (
                <p className="text-xs text-dark-muted">No highlight cards yet. Click "Add Card" to begin.</p>
              )}
            </div>

            <div className="md:col-span-2">
              <ItineraryEditor
                value={form.itinerary}
                onChange={days => setForm(f => ({ ...f, itinerary: days }))}
                tripSlug={editingTrip ? editingTrip.slug : (slugify(form.title) || 'new-trip')}
              />
            </div>
          </TabPanel>
          <TabPanel label="Inclusions & Prep" icon={<Backpack size={15} />}>
            {/* Grouped What's Included — heading + bulleted sub-items (e.g. "Premium Stay Experience") */}
            <div className="md:col-span-2">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-dark">What's Included</label>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, included_groups: [...f.included_groups, { icon: '', heading: '', bullets: [] }] }))}
                  className="flex items-center gap-1 text-xs font-medium text-primary border border-primary rounded-md px-2.5 py-1.5 hover:bg-primary/5 transition-colors"
                >
                  <Plus size={13} aria-hidden="true" /> Add Group
                </button>
              </div>
              <p className="text-xs text-dark-muted mb-3">Replaces the icon grid above once a group is added (e.g. "Premium Stay Experience" with bullet details).</p>
              <div className="space-y-3">
              {form.included_groups.map((group, gi) => (
                <div key={gi} className="border border-background-warm rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-dark-muted uppercase tracking-wide">Group {gi + 1}</span>
                    <button type="button" onClick={() => setForm(f => ({ ...f, included_groups: f.included_groups.filter((_, idx) => idx !== gi) }))} aria-label={`Remove Group ${gi + 1}`} className="p-1 rounded text-primary/70 hover:text-primary hover:bg-primary/5 transition-colors"><Trash2 size={13} aria-hidden="true" /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label htmlFor={`trip-included-icon-${gi}`} className="block text-xs font-medium text-dark mb-1">Icon</label>
                      <TripHighlightIconPicker
                        id={`trip-included-icon-${gi}`}
                        value={group.icon}
                        hintText={group.heading}
                        onChange={key => setForm(f => ({ ...f, included_groups: f.included_groups.map((g, idx) => idx === gi ? { ...g, icon: key } : g) }))}
                      />
                    </div>
                    <div>
                      <label htmlFor={`trip-included-heading-${gi}`} className="block text-xs font-medium text-dark mb-1">Heading</label>
                      <input id={`trip-included-heading-${gi}`} value={group.heading} onChange={e => setForm(f => ({ ...f, included_groups: f.included_groups.map((g, idx) => idx === gi ? { ...g, heading: e.target.value } : g) }))} className={inputClass} placeholder="e.g. Premium Stay Experience" />
                    </div>
                  </div>
                  <div>
                    <label htmlFor={`trip-included-bullets-${gi}`} className="block text-xs font-medium text-dark mb-1">Bullet Points</label>
                    <textarea
                      id={`trip-included-bullets-${gi}`}
                      placeholder="Paste bullet points here — one per line or paragraph. Press Enter or click away to add."
                      aria-describedby={`trip-included-bullets-hint-${gi}`}
                      rows={2}
                      className={`${inputClass} resize-none`}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          commitGroupBulletDraft(gi, e.currentTarget);
                        }
                      }}
                      onBlur={e => commitGroupBulletDraft(gi, e.currentTarget)}
                      onPaste={e => {
                        const text = e.clipboardData.getData('text');
                        const lines = text.split(/\r?\n\s*\n|\r?\n/).map(l => l.trim()).filter(Boolean);
                        if (lines.length > 1) {
                          e.preventDefault();
                          setForm(f => ({ ...f, included_groups: f.included_groups.map((g, idx) => idx === gi ? { ...g, bullets: [...g.bullets, ...lines] } : g) }));
                          e.currentTarget.value = '';
                        }
                      }}
                    />
                    <p id={`trip-included-bullets-hint-${gi}`} className="text-2xs text-dark-muted mt-1">Paste a list. Each line becomes a bullet.</p>
                    {group.bullets.length > 0 && (
                      <ul className="space-y-2 mt-2">
                        {group.bullets.map((bullet, bi) => (
                          <li key={bi} className="flex items-center gap-2 bg-background-warm rounded-lg px-3 py-2">
                            <span className="flex-1 text-sm text-dark">{bullet}</span>
                            <button
                              type="button"
                              onClick={() => setForm(f => ({ ...f, included_groups: f.included_groups.map((g, idx) => idx === gi ? { ...g, bullets: g.bullets.filter((_, i) => i !== bi) } : g) }))}
                              className="text-dark-muted hover:text-primary transition-colors shrink-0"
                              aria-label={`Remove bullet: ${bullet}`}
                              title="Remove"
                            >
                              <X size={15} aria-hidden="true" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ))}
              {form.included_groups.length === 0 && <p className="text-xs text-dark-muted">No groups yet. Click "Add Group" to begin.</p>}
              </div>
            </div>

            <div className="md:col-span-2">
              <TagListEditor
                label="What's Not Included"
                value={form.not_included}
                onChange={items => setForm(f => ({ ...f, not_included: items }))}
                placeholder="e.g. Flights"
                helperText="Items not covered by the trip price."
              />
            </div>
            <div className="md:col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-semibold text-dark">Things to Carry</label>
                <button type="button" onClick={() => setForm(f => ({ ...f, things_to_carry_items: [...f.things_to_carry_items, { icon: '', description: '' }] }))} className="flex items-center gap-1 text-xs font-medium text-primary border border-primary rounded-md px-2.5 py-1.5 hover:bg-primary/5 transition-colors"><Plus size={13} aria-hidden="true" /> Add Item</button>
              </div>
              <p className="text-xs text-dark-muted -mt-1">Packing list shown to travelers.</p>
              {form.things_to_carry_items.map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="w-32 flex-shrink-0">
                    <label htmlFor={`trip-carry-icon-${i}`} className="sr-only">Icon for item {i + 1}</label>
                    <TripHighlightIconPicker
                      id={`trip-carry-icon-${i}`}
                      value={item.icon}
                      hintText={item.description}
                      onChange={key => setForm(f => ({ ...f, things_to_carry_items: f.things_to_carry_items.map((it, idx) => idx === i ? { ...it, icon: key } : it) }))}
                    />
                  </div>
                  <label htmlFor={`trip-carry-desc-${i}`} className="sr-only">Item {i + 1} description</label>
                  <input id={`trip-carry-desc-${i}`} value={item.description} onChange={e => setForm(f => ({ ...f, things_to_carry_items: f.things_to_carry_items.map((it, idx) => idx === i ? { ...it, description: e.target.value } : it) }))} className={`${inputClass} flex-1`} placeholder="e.g. Warm jacket" />
                  <button type="button" onClick={() => setForm(f => ({ ...f, things_to_carry_items: f.things_to_carry_items.filter((_, idx) => idx !== i) }))} aria-label={`Remove item ${i + 1}`} className="p-1.5 rounded text-primary/70 hover:text-primary hover:bg-primary/5 transition-colors flex-shrink-0"><Trash2 size={13} aria-hidden="true" /></button>
                </div>
              ))}
              {form.things_to_carry_items.length === 0 && <p className="text-xs text-dark-muted">No items yet. Click "Add Item" to begin.</p>}
            </div>

            {/* Travel with Confidence */}
            <div className="md:col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-semibold text-dark">Travel with Confidence</label>
                <button type="button" onClick={() => setForm(f => ({ ...f, confidence_items: [...f.confidence_items, { icon: '', description: '' }] }))} className="flex items-center gap-1 text-xs font-medium text-primary border border-primary rounded-md px-2.5 py-1.5 hover:bg-primary/5 transition-colors"><Plus size={13} aria-hidden="true" /> Add Item</button>
              </div>
              <div>
                <label htmlFor="trip-confidence-description" className="block text-sm font-medium text-dark mb-1">Section Description</label>
                <textarea
                  id="trip-confidence-description"
                  value={form.confidence_description}
                  onChange={e => setForm(f => ({ ...f, confidence_description: e.target.value }))}
                  rows={3}
                  className={`${inputClass} resize-none`}
                  placeholder="Short intro paragraph shown below the &quot;Travel with Confidence&quot; heading..."
                  aria-describedby="trip-confidence-description-hint"
                />
                <p id="trip-confidence-description-hint" className="text-xs text-dark-muted mt-1">Intro text under the section heading.</p>
              </div>
              {form.confidence_items.map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="w-32 flex-shrink-0">
                    <label htmlFor={`trip-confidence-icon-${i}`} className="sr-only">Icon for item {i + 1}</label>
                    <TripHighlightIconPicker
                      id={`trip-confidence-icon-${i}`}
                      value={item.icon}
                      hintText={item.description}
                      onChange={key => setForm(f => ({ ...f, confidence_items: f.confidence_items.map((it, idx) => idx === i ? { ...it, icon: key } : it) }))}
                    />
                  </div>
                  <label htmlFor={`trip-confidence-desc-${i}`} className="sr-only">Item {i + 1} description</label>
                  <input id={`trip-confidence-desc-${i}`} value={item.description} onChange={e => setForm(f => ({ ...f, confidence_items: f.confidence_items.map((it, idx) => idx === i ? { ...it, description: e.target.value } : it) }))} className={`${inputClass} flex-1`} placeholder="e.g. 24/7 on-ground support" />
                  <button type="button" onClick={() => setForm(f => ({ ...f, confidence_items: f.confidence_items.filter((_, idx) => idx !== i) }))} aria-label={`Remove item ${i + 1}`} className="p-1.5 rounded text-primary/70 hover:text-primary hover:bg-primary/5 transition-colors flex-shrink-0"><Trash2 size={13} aria-hidden="true" /></button>
                </div>
              ))}
              {form.confidence_items.length === 0 && <p className="text-xs text-dark-muted">No confidence items yet.</p>}
            </div>
          </TabPanel>
          <TabPanel label="Accommodation" icon={<Bed size={15} />}>
            <div className="md:col-span-2">
              <label htmlFor="trip-accommodation-description" className="block text-sm font-medium text-dark mb-1">Section Description</label>
              <textarea
                id="trip-accommodation-description"
                value={form.accommodation_description}
                onChange={e => setForm(f => ({ ...f, accommodation_description: e.target.value }))}
                rows={4}
                className={`${inputClass} resize-none`}
                placeholder="Describe the accommodation experience for this trip..."
                aria-describedby="trip-accommodation-description-hint"
              />
              <p id="trip-accommodation-description-hint" className="text-xs text-dark-muted mt-1">Intro text for the accommodation section.</p>
            </div>
            <div className="md:col-span-2">
              <MultiImageUploadField
                label="Accommodation Photos"
                value={form.accommodation_photos}
                onChange={urls => setForm(f => ({ ...f, accommodation_photos: urls }))}
                bucket="ulaa"
                pathPrefix={`trips/${editingTrip ? editingTrip.slug : (slugify(form.title) || 'new-trip')}/accommodation`}
                hint="16:9 landscape, e.g. 1280×720px. Shown in cropped cards."
                allowUrl
              />
            </div>
          </TabPanel>
          <TabPanel label="Meeting Point" icon={<MapPin size={15} />}>
            <div className="md:col-span-2">
              <label htmlFor="trip-meeting-point" className="block text-sm font-medium text-dark mb-1">Location Name</label>
              <div className="flex gap-2">
                <input
                  id="trip-meeting-point"
                  value={form.meeting_point}
                  onChange={e => setForm(f => ({ ...f, meeting_point: e.target.value }))}
                  aria-describedby="trip-meeting-point-hint"
                  className={inputClass}
                  placeholder="e.g. Shimla Bus Stand, Himachal Pradesh — 7:00 AM on Day 1"
                />
                <button
                  type="button"
                  onClick={() => setMapPickerOpen(true)}
                  className="shrink-0 flex items-center gap-1.5 px-3 rounded-md border-2 border-primary bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors whitespace-nowrap"
                  title="Pick this location on a map without leaving the page"
                >
                  <MapPin size={16} aria-hidden="true" /> Pick on Map
                </button>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(form.meeting_point || form.destination)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => { if (!form.meeting_point.trim() && !form.destination.trim()) e.preventDefault(); }}
                  className="shrink-0 flex items-center gap-1.5 px-3 rounded-md border-2 border-background-warm bg-background text-dark text-sm font-medium hover:border-primary hover:text-primary transition-colors whitespace-nowrap"
                  title="Opens Google Maps in a new tab, already searching for this"
                >
                  Find on Maps <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span>
                </a>
              </div>
              <p id="trip-meeting-point-hint" className="text-xs text-dark-muted mt-1.5">Shown as plain text on the trip page. Use "Pick on Map" to auto-fill the address and map link.</p>
            </div>

            <div className="md:col-span-2">
              <label htmlFor="trip-meeting-address" className="block text-sm font-medium text-dark mb-1">Address</label>
              <input
                id="trip-meeting-address"
                value={form.meeting_address}
                onChange={e => setForm(f => ({ ...f, meeting_address: e.target.value }))}
                className={inputClass}
                placeholder="e.g. Near HRTC Bus Terminal, Cart Road, Shimla - 171001"
                aria-describedby="trip-meeting-address-hint"
              />
              <p id="trip-meeting-address-hint" className="text-xs text-dark-muted mt-1.5">Full address shown with the meeting point.</p>
            </div>

            <div className="md:col-span-2">
              <label htmlFor="trip-meeting-map-url" className="block text-sm font-medium text-dark mb-1">Meeting Point — Google Maps Link</label>
              <input
                id="trip-meeting-map-url"
                value={form.meeting_point_map_url}
                onChange={e => setForm(f => ({ ...f, meeting_point_map_url: e.target.value }))}
                aria-describedby="trip-meeting-map-url-hint"
                className={inputClass}
                placeholder="Paste the link here"
              />
              <p id="trip-meeting-map-url-hint" className="text-xs text-dark-muted mt-1.5">
                On Google Maps: confirm the pin → <span className="font-medium text-dark">Share</span> → <span className="font-medium text-dark">Copy link</span> → paste above.
                {form.meeting_point_map_url.trim() && (
                  <>
                    {' '}
                    <a
                      href={form.meeting_point_map_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary font-medium hover:underline"
                    >
                      Open this link <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </>
                )}
              </p>
            </div>

            <div className="md:col-span-2 grid grid-cols-2 gap-x-3 sm:gap-x-4 items-start">
              <div>
                <label htmlFor="trip-meeting-time" className="block text-sm font-medium text-dark mb-1">Time</label>
                <input
                  id="trip-meeting-time"
                  value={form.meeting_time}
                  onChange={e => setForm(f => ({ ...f, meeting_time: e.target.value }))}
                  className={inputClass}
                  placeholder="e.g. 7:00 AM"
                />
              </div>
              <div>
                <label htmlFor="trip-meeting-terminal" className="block text-sm font-medium text-dark mb-1">Terminal</label>
                <input
                  id="trip-meeting-terminal"
                  value={form.meeting_terminal}
                  onChange={e => setForm(f => ({ ...f, meeting_terminal: e.target.value }))}
                  className={inputClass}
                  placeholder="e.g. Terminal 2"
                />
              </div>
            </div>

            <div className="md:col-span-2">
              <label htmlFor="trip-meeting-details" className="block text-sm font-medium text-dark mb-1">Details</label>
              <input
                id="trip-meeting-details"
                value={form.meeting_details}
                onChange={e => setForm(f => ({ ...f, meeting_details: e.target.value }))}
                aria-describedby="trip-meeting-details-hint"
                className={inputClass}
                placeholder="e.g. Look for the Ulaa placard near the arrivals gate"
              />
              <p id="trip-meeting-details-hint" className="text-xs text-dark-muted mt-1.5">
                Time, Terminal and Details are optional. If blank, "to be communicated" is shown.
              </p>
            </div>
          </TabPanel>
          <TabPanel label="Trip Leader" icon={<UserCircle size={15} />}>
            <div className="md:col-span-2">
              <label htmlFor="trip-leader-select" className="block text-sm font-medium text-dark mb-1">Assign Trip Leader</label>
              <Select
                inputId="trip-leader-select"
                value={form.trip_leader_id}
                onChange={id => setForm(f => ({ ...f, trip_leader_id: id }))}
                options={[
                  { value: '', label: 'Not linked — no trip leader shown' },
                  ...tripLeaders.map(l => ({ value: l.id, label: l.designation ? `${l.name} — ${l.designation}` : l.name })),
                ]}
                placeholder="Select a trip leader..."
              />
              <p className="text-xs text-dark-muted mt-1.5">
                Optional. Leader details come from Admin → Trip Leaders and update here automatically.
              </p>
              <button
                type="button"
                onClick={() => onManageLeader({ create: true })}
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Plus size={13} aria-hidden="true" /> Add a new trip leader
              </button>
            </div>
            {(() => {
              const leader = tripLeaders.find(l => l.id === form.trip_leader_id);
              if (!leader) return null;
              return (
                <div className="md:col-span-2">
                  <div className="flex gap-3 items-start bg-background-warm/60 rounded-md p-3">
                    {leader.photo ? (
                      <img src={leader.photo} alt="" className="w-14 h-14 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-primary font-display font-bold">{leader.name.charAt(0)}</span>
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium text-dark">{leader.name}</p>
                      {leader.designation && <p className="text-primary text-xs font-semibold">{leader.designation}</p>}
                      {leader.description && (
                        <p className="text-dark-muted text-xs mt-0.5 whitespace-pre-line line-clamp-3">{leader.description}</p>
                      )}
                      <button
                        type="button"
                        onClick={() => onManageLeader({ leaderId: leader.id })}
                        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary border border-primary rounded-md px-2.5 py-1.5 hover:bg-primary/5 transition-colors"
                      >
                        <PencilSimple size={13} aria-hidden="true" /> Edit this leader
                      </button>
                      <p className="text-2xs text-dark-muted mt-1">Your unsaved trip changes are kept — you'll be brought back here.</p>
                    </div>
                  </div>
                </div>
              );
            })()}
          </TabPanel>
          <TabPanel label="End Banner" icon={<ImageIcon size={15} />}>
            <div className="md:col-span-2">
              <ImageUploadField
                label="Banner Image"
                value={form.end_banner.image}
                onChange={url => setForm(f => ({ ...f, end_banner: { ...f.end_banner, image: url } }))}
                bucket="ulaa"
                pathPrefix="trip-end-banners"
                fileNamePrefix={editingTrip ? editingTrip.slug : (slugify(form.title) || undefined)}
                hint="Wide landscape, min 1600×900px. Shown behind the closing banner text."
                allowUrl
              />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="trip-end-banner-heading" className="block text-sm font-medium text-dark mb-1">Heading (left side)</label>
              <input
                id="trip-end-banner-heading"
                value={form.end_banner.heading}
                onChange={e => setForm(f => ({ ...f, end_banner: { ...f.end_banner, heading: e.target.value } }))}
                className={inputClass}
                placeholder="e.g. Ready to Experience the Magic?"
                aria-describedby="trip-end-banner-heading-hint"
              />
              <p id="trip-end-banner-heading-hint" className="text-xs text-dark-muted mt-1">Main heading, shown on the left of the banner.</p>
            </div>
            <div className="md:col-span-2">
              <label htmlFor="trip-end-banner-description" className="block text-sm font-medium text-dark mb-1">Description</label>
              <textarea
                id="trip-end-banner-description"
                value={form.end_banner.description}
                onChange={e => setForm(f => ({ ...f, end_banner: { ...f.end_banner, description: e.target.value } }))}
                rows={3}
                className={`${inputClass} resize-none`}
                placeholder="A short compelling call-to-action paragraph..."
                aria-describedby="trip-end-banner-description-hint"
              />
              <p id="trip-end-banner-description-hint" className="text-xs text-dark-muted mt-1">One or two lines below the heading.</p>
            </div>
            <div className="md:col-span-2 grid grid-cols-2 gap-x-3 sm:gap-x-4 items-start">
            <div>
              <label htmlFor="trip-end-banner-cta-label" className="block text-sm font-medium text-dark mb-1"><ShortLabel full="CTA Button Label (optional)" short="Button Label" /></label>
              <input
                id="trip-end-banner-cta-label"
                value={form.end_banner.cta_label}
                onChange={e => setForm(f => ({ ...f, end_banner: { ...f.end_banner, cta_label: e.target.value } }))}
                className={inputClass}
                placeholder="Book Your Seat"
                aria-describedby="trip-end-banner-cta-label-hint"
              />
              <p id="trip-end-banner-cta-label-hint" className="text-xs text-dark-muted mt-1">Leave blank to hide the button.</p>
            </div>
            <div>
              <label htmlFor="trip-end-banner-cta-url" className="block text-sm font-medium text-dark mb-1"><ShortLabel full="CTA URL (optional)" short="Button Link" /></label>
              <input
                id="trip-end-banner-cta-url"
                value={form.end_banner.cta_url}
                onChange={e => setForm(f => ({ ...f, end_banner: { ...f.end_banner, cta_url: e.target.value } }))}
                className={inputClass}
                placeholder="#booking"
                aria-describedby="trip-end-banner-cta-url-hint"
              />
              <p id="trip-end-banner-cta-url-hint" className="text-xs text-dark-muted mt-1">Leave blank to open the booking form.</p>
            </div>
            </div>
          </TabPanel>
          <TabPanel label="Terms & Conditions" icon={<FileText size={15} />}>
            <div className="md:col-span-2">
              <TermsEditor
                value={form.terms_and_conditions}
                onChange={terms_and_conditions => setForm(f => ({ ...f, terms_and_conditions }))}
              />
            </div>
          </TabPanel>
          <TabPanel label="FAQs" icon={<Question size={15} />}>
            <div className="md:col-span-2">
              <FAQEditor
                value={form.faqs}
                onChange={faqs => setForm(f => ({ ...f, faqs }))}
              />
            </div>
          </TabPanel>
          <TabPanel label="Cancellation Policy" icon={<ShieldCheck size={15} />}>
            <div className="md:col-span-2">
              <CancellationPolicyEditor
                value={form.cancellation_policy}
                onChange={cancellation_policy => setForm(f => ({ ...f, cancellation_policy }))}
              />
            </div>
          </TabPanel>
          <TabPanel label="Publish" icon={<RocketLaunch size={15} />}>
            <div className="md:col-span-2 space-y-3">
              <p className="text-sm font-medium text-dark">Status</p>
              <div className="space-y-2">
                {([
                  { value: 'draft' as const, label: 'Draft', desc: 'Hidden on the public site.' },
                  { value: 'coming_soon' as const, label: 'Coming Soon', desc: 'Public, but only the cover image and title show. Price, dates, seats and details stay hidden.' },
                  { value: 'published' as const, label: 'Published', desc: 'Public and bookable.' },
                ]).map(opt => (
                  <label key={opt.value} className={`flex items-start gap-3 rounded-md border-2 p-3 cursor-pointer transition-colors ${form.status === opt.value ? 'border-primary bg-primary/5' : 'border-background-warm bg-background'}`}>
                    <input
                      type="radio"
                      name="status"
                      checked={form.status === opt.value}
                      onChange={() => setForm(f => ({ ...f, status: opt.value }))}
                      className="w-4 h-4 accent-primary mt-0.5 flex-shrink-0"
                    />
                    <span>
                      <span className="block text-sm font-medium text-dark">{opt.label}</span>
                      <span className="block text-xs text-dark-muted mt-0.5">{opt.desc}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </TabPanel>
        </Tabs>
        </div>
      </Modal>

      <MeetingPointMapPicker
        isOpen={mapPickerOpen}
        onClose={() => setMapPickerOpen(false)}
        initialQuery={form.meeting_point || form.destination}
        onSelect={({ name, address, mapUrl }) => {
          setForm(f => ({
            ...f,
            meeting_point: name,
            meeting_address: address || f.meeting_address,
            meeting_point_map_url: mapUrl,
          }));
        }}
      />
    </>
  );
}
