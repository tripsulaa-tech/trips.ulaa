import {
  Plus,
  Trash as Trash2,
  MagnifyingGlass as Search,
  X,
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
import { COVER_IMAGE_TARGET_SIZE_BYTES } from '../../services/api';
import type { UpcomingTrip } from '../../types/types-index';
import { slugify } from '../../utils/utils-index';
import { type TripForm, computeDuration, inputClass } from './tripsShared';

interface AdminTripFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingTrip: UpcomingTrip | null;
  form: TripForm;
  setForm: React.Dispatch<React.SetStateAction<TripForm>>;
  saving: boolean;
  onSave: () => void;
  modalSearch: string;
  setModalSearch: (v: string) => void;
  modalSearchNoMatch: boolean;
  modalBodyRef: React.RefObject<HTMLDivElement | null>;
  commitGroupBulletDraft: (gi: number, el: HTMLTextAreaElement) => void;
}

/** The Add/Edit Trip modal — every tab of the trip form (Basic Info,
 *  Pricing & Availability, Media, Overview & Itinerary, Inclusions & Prep,
 *  Accommodation, Meeting Point, Founder, End Banner, Terms & Conditions,
 *  FAQs, Cancellation Policy, Publish).
 *
 *  Extracted from AdminTrips.tsx (see that file's git history for the
 *  original single-component version). */
export default function AdminTripFormModal({
  isOpen, onClose, editingTrip, form, setForm, saving, onSave,
  modalSearch, setModalSearch, modalSearchNoMatch, modalBodyRef, commitGroupBulletDraft,
}: AdminTripFormModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingTrip ? 'Edit Trip' : 'Add Trip'}
      size="xl"
      headerContent={
        <div className="relative w-full max-w-xs">
          <label htmlFor="trip-field-search" className="sr-only">Search fields</label>
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-muted pointer-events-none" aria-hidden="true" />
          <input
            id="trip-field-search"
            type="text"
            value={modalSearch}
            onChange={e => setModalSearch(e.target.value)}
            placeholder="Search fields (e.g. meeting point, pricing, media)..."
            className="w-full pl-9 pr-3 py-2 rounded-md border-2 border-background-warm bg-background font-body text-dark text-sm focus:border-primary outline-none transition-colors"
          />
        </div>
      }
      footer={
        <div className="flex gap-3">
          <Button variant="outline" size="md" className="max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="md" className="max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]" onClick={onSave} loading={saving}>
            {editingTrip ? 'Save Changes' : 'Create Trip'}
          </Button>
        </div>
      }
    >
      {modalSearchNoMatch && (
        <p role="status" className="text-xs text-red-500 -mt-2 mb-3">No matching field found for "{modalSearch}".</p>
      )}
      <div ref={modalBodyRef}>
        <Tabs>
        <TabPanel label="Basic Info">
          <div className="md:col-span-2">
            <label htmlFor="trip-title" className="block text-sm font-medium text-dark mb-1">Trip Title *</label>
            <input id="trip-title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className={inputClass} placeholder="e.g. Spiti Valley Winter Expedition" />
          </div>
          <div>
            <label htmlFor="trip-destination" className="block text-sm font-medium text-dark mb-1">Destination *</label>
            <input id="trip-destination" value={form.destination} onChange={e => setForm(f => ({ ...f, destination: e.target.value }))} className={inputClass} placeholder="e.g. Spiti, Himachal Pradesh" />
          </div>
          <div>
            <label htmlFor="trip-duration" className="block text-sm font-medium text-dark mb-1">Duration *</label>
            <input
              id="trip-duration"
              value={form.duration}
              readOnly
              aria-describedby="trip-duration-hint"
              className={`${inputClass} bg-background-warm/60 cursor-not-allowed`}
              placeholder="Auto-filled from Start/End Date"
            />
            <p id="trip-duration-hint" className="text-xs text-dark-muted mt-1">Calculated automatically from the Start and End Date fields.</p>
          </div>
          <div className="md:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-4">
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
                value={form.min_age}
                onChange={e => setForm(f => ({ ...f, min_age: e.target.value === '' ? '' : +e.target.value }))}
                className={inputClass}
                placeholder="e.g. 18 (optional)"
              />
            </div>
            <div>
              <label htmlFor="trip-max-age" className="block text-sm font-medium text-dark mb-1">Max Age</label>
              <input
                id="trip-max-age"
                type="number"
                min={0}
                value={form.max_age}
                onChange={e => setForm(f => ({ ...f, max_age: e.target.value === '' ? '' : +e.target.value }))}
                className={inputClass}
                placeholder="e.g. 65 (optional)"
              />
            </div>
            <p className="col-span-2 md:col-span-4 text-xs text-dark-muted -mt-2">
              Default: 18–65 years. Leave blank for no restriction.
            </p>
          </div>
          <div className="md:col-span-2">
            <label htmlFor="trip-description" className="block text-sm font-medium text-dark mb-1">Description *</label>
            <p id="trip-description-hint" className="text-xs text-dark-muted mb-1">Short overview only — put the day-by-day plan in Itinerary below, not here.</p>
            <textarea id="trip-description" aria-describedby="trip-description-hint" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} className={`${inputClass} resize-none`} />
          </div>
        </TabPanel>
        <TabPanel label="Pricing & Availability">
          <div className="md:col-span-2 grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="trip-total-seats" className="block text-sm font-medium text-dark mb-1">Total Seats</label>
              <input id="trip-total-seats" type="number" min={0} value={form.total_seats} onChange={e => setForm(f => ({ ...f, total_seats: +e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label htmlFor="trip-seats-filled" className="block text-sm font-medium text-dark mb-1">Seats Filled</label>
              <input
                id="trip-seats-filled"
                type="number"
                min={0}
                max={form.total_seats}
                value={form.seats_booked}
                onChange={e => setForm(f => ({ ...f, seats_booked: Math.max(0, Math.min(+e.target.value, f.total_seats)) }))}
                aria-describedby="trip-seats-filled-hint"
                className={inputClass}
              />
              <p id="trip-seats-filled-hint" className="text-xs text-dark-muted mt-1">
                {Math.max(0, form.total_seats - form.seats_booked)} of {form.total_seats} seats left
              </p>
            </div>
          </div>
          <div>
            <label htmlFor="trip-price" className="block text-sm font-medium text-dark mb-1">Regular Price per person (₹) *</label>
            <input
              id="trip-price"
              type="number"
              value={form.price}
              onChange={e => setForm(f => ({ ...f, price: e.target.value === '' ? '' : +e.target.value }))}
              className={inputClass}
              placeholder="e.g. 42999"
            />
          </div>
          <div>
            <label htmlFor="trip-strike-price" className="block text-sm font-medium text-dark mb-1">Strikeout Price per person (₹)</label>
            <input
              id="trip-strike-price"
              type="number"
              value={form.strike_through_price}
              onChange={e => setForm(f => ({ ...f, strike_through_price: e.target.value === '' ? '' : +e.target.value }))}
              className={inputClass}
              placeholder="e.g. 49999 (optional)"
            />
          </div>
          <div>
            <label htmlFor="trip-early-bird-price" className="block text-sm font-medium text-dark mb-1">Early-Bird Price per person (₹)</label>
            <input
              id="trip-early-bird-price"
              type="number"
              value={form.early_bird_price}
              onChange={e => setForm(f => ({ ...f, early_bird_price: e.target.value === '' ? '' : +e.target.value }))}
              className={inputClass}
              placeholder="e.g. 39999 (optional)"
            />
          </div>
          <div>
            <label htmlFor="trip-advance-amount" className="block text-sm font-medium text-dark mb-1">Advance/Reservation Amount (₹)</label>
            <input
              id="trip-advance-amount"
              type="number"
              min={0}
              value={form.advance_amount}
              onChange={e => setForm(f => ({ ...f, advance_amount: e.target.value === '' ? '' : +e.target.value }))}
              aria-describedby="trip-advance-amount-hint"
              className={inputClass}
              placeholder="e.g. 8999 (optional)"
            />
            <p id="trip-advance-amount-hint" className="text-xs text-dark-muted mt-1">
              Shown on the public trip page as "Reserve today with only ₹{form.advance_amount || 'X'}". Leave blank to show the seats-available badge instead.
            </p>
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
              Up to 4 fixed tags shown in the icon row on the public Trip Card, e.g. "Girls-Only". Leave empty to auto-show travelers, age range, duration, and destination count instead.
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
            <p className="text-xs text-dark-muted mt-1">Used to auto-fill the correct cancellation-window rules on bookings for this trip.</p>
          </div>
          <div>
            <label htmlFor="trip-early-bird-deadline" className="block text-sm font-medium text-dark mb-1">Early-Bird Deadline</label>
            <DatePicker
              id="trip-early-bird-deadline"
              value={form.early_bird_deadline}
              onChange={early_bird_deadline => setForm(f => ({ ...f, early_bird_deadline }))}
            />
            <p className="text-xs text-dark-muted mt-1">The early-bird price shows automatically until this date, then the page switches to the regular price on its own.</p>
          </div>
        </TabPanel>
        <TabPanel label="Media">
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
              hint="Landscape, at least 1600×1200px, with the main subject centered — this same photo is reused for the trip card and desktop hero, so you'll reposition/zoom it for each after uploading. The mobile hero uses its own separate image, uploaded below."
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
              hint="Tall portrait, 9:16 ratio, at least 1080×1920px — fills the full-height banner on phone screens edge to edge, in place of the cropped cover image. Optional: falls back to the Cover Image (repositioned above) if left empty."
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
              />
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
                    hint="4:3 landscape works best (e.g. 1200×900px) — shown in a cropped carousel tile."
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
              hint="Shown uncropped in a masonry grid, so portrait, landscape, or square all work — just keep each photo at least 800px on its shortest side."
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
              />
            </MultiImageUploadField>
          </div>
        </TabPanel>
        <TabPanel label="Overview & Itinerary">
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
            <div className="grid md:grid-cols-2 gap-3">
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
        <TabPanel label="Inclusions & Prep">
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
            <p className="text-xs text-dark-muted mb-3">Shown instead of the icon grid above when at least one group is added, e.g. a "Premium Stay Experience" heading with bulleted details below it.</p>
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
                  <p id={`trip-included-bullets-hint-${gi}`} className="text-[11px] text-dark-muted mt-1">Paste a list — each line or paragraph automatically becomes its own bullet below.</p>
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
            />
          </div>
          <div className="md:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-semibold text-dark">Things to Carry</label>
              <button type="button" onClick={() => setForm(f => ({ ...f, things_to_carry_items: [...f.things_to_carry_items, { icon: '', description: '' }] }))} className="flex items-center gap-1 text-xs font-medium text-primary border border-primary rounded-md px-2.5 py-1.5 hover:bg-primary/5 transition-colors"><Plus size={13} aria-hidden="true" /> Add Item</button>
            </div>
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
              />
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
        <TabPanel label="Accommodation">
          <div className="md:col-span-2">
            <label htmlFor="trip-accommodation-description" className="block text-sm font-medium text-dark mb-1">Section Description</label>
            <textarea
              id="trip-accommodation-description"
              value={form.accommodation_description}
              onChange={e => setForm(f => ({ ...f, accommodation_description: e.target.value }))}
              rows={4}
              className={`${inputClass} resize-none`}
              placeholder="Describe the accommodation experience for this trip..."
            />
          </div>
          <div className="md:col-span-2">
            <MultiImageUploadField
              label="Accommodation Photos"
              value={form.accommodation_photos}
              onChange={urls => setForm(f => ({ ...f, accommodation_photos: urls }))}
              bucket="ulaa"
              pathPrefix={`trips/${editingTrip ? editingTrip.slug : (slugify(form.title) || 'new-trip')}/accommodation`}
              hint="16:9 landscape works best (e.g. 1280×720px) — shown in cropped cards."
              allowUrl
            />
          </div>
        </TabPanel>
        <TabPanel label="Meeting Point">
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
            <p id="trip-meeting-point-hint" className="text-xs text-dark-muted mt-1.5">Shown as plain text on the trip page.</p>
          </div>

          <div className="md:col-span-2">
            <label htmlFor="trip-meeting-address" className="block text-sm font-medium text-dark mb-1">Address</label>
            <input
              id="trip-meeting-address"
              value={form.meeting_address}
              onChange={e => setForm(f => ({ ...f, meeting_address: e.target.value }))}
              className={inputClass}
              placeholder="e.g. Near HRTC Bus Terminal, Cart Road, Shimla - 171001"
            />
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
              In the Maps tab that opened: confirm the pin is on the right spot (search again if not) → tap <span className="font-medium text-dark">Share</span> → <span className="font-medium text-dark">Copy link</span> → paste it above.
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

          <div>
            <label htmlFor="trip-meeting-time" className="block text-sm font-medium text-dark mb-1">Time</label>
            <input
              id="trip-meeting-time"
              value={form.meeting_time}
              onChange={e => setForm(f => ({ ...f, meeting_time: e.target.value }))}
              className={inputClass}
              placeholder="e.g. 7:00 AM on Day 1"
            />
          </div>

          <div>
            <label htmlFor="trip-meeting-terminal" className="block text-sm font-medium text-dark mb-1">Terminal</label>
            <input
              id="trip-meeting-terminal"
              value={form.meeting_terminal}
              onChange={e => setForm(f => ({ ...f, meeting_terminal: e.target.value }))}
              className={inputClass}
              placeholder="e.g. Terminal 2, Departure Gate"
            />
          </div>

          <div className="md:col-span-2">
            <label htmlFor="trip-meeting-details" className="block text-sm font-medium text-dark mb-1">Details</label>
            <input
              id="trip-meeting-details"
              value={form.meeting_details}
              onChange={e => setForm(f => ({ ...f, meeting_details: e.target.value }))}
              aria-describedby="trip-meeting-details-hint"
              className={inputClass}
              placeholder="e.g. Look for the ULAA placard near the arrivals gate"
            />
            <p id="trip-meeting-details-hint" className="text-xs text-dark-muted mt-1.5">
              Time, Terminal, and Details are all optional — leave any of them blank and the trip page and PDF show a friendly "to be communicated" placeholder instead.
            </p>
          </div>
        </TabPanel>
        <TabPanel label="Founder">
          <div className="md:col-span-2">
            <ImageUploadField
              label="Founder Photo"
              value={form.trip_founder.photo}
              onChange={url => setForm(f => ({ ...f, trip_founder: { ...f.trip_founder, photo: url } }))}
              bucket="ulaa"
              pathPrefix="trip-founder"
              fileNamePrefix={editingTrip ? editingTrip.slug : (slugify(form.title) || undefined)}
              maxSizeBytes={COVER_IMAGE_TARGET_SIZE_BYTES}
              hint="Square, at least 400×400px, with the face centered — shown as a circular avatar."
              allowUrl
            />
          </div>
          <div>
            <label htmlFor="trip-founder-name" className="block text-sm font-medium text-dark mb-1">Name</label>
            <input
              id="trip-founder-name"
              value={form.trip_founder.name}
              onChange={e => setForm(f => ({ ...f, trip_founder: { ...f.trip_founder, name: e.target.value } }))}
              className={inputClass}
              placeholder="e.g. Priya Sharma"
            />
          </div>
          <div>
            <label htmlFor="trip-founder-designation" className="block text-sm font-medium text-dark mb-1">Designation</label>
            <input
              id="trip-founder-designation"
              value={form.trip_founder.designation ?? ''}
              onChange={e => setForm(f => ({ ...f, trip_founder: { ...f.trip_founder, designation: e.target.value } }))}
              className={inputClass}
              placeholder="e.g. Founder & CEO, ULAA"
            />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="trip-founder-about" className="block text-sm font-medium text-dark mb-1">Description / About</label>
            <textarea
              id="trip-founder-about"
              value={form.trip_founder.description}
              onChange={e => setForm(f => ({ ...f, trip_founder: { ...f.trip_founder, description: e.target.value } }))}
              rows={4}
              className={`${inputClass} resize-none`}
              placeholder="A short note from the founder about this trip..."
            />
          </div>
        </TabPanel>
        <TabPanel label="End Banner">
          <div className="md:col-span-2">
            <ImageUploadField
              label="Banner Image"
              value={form.end_banner.image}
              onChange={url => setForm(f => ({ ...f, end_banner: { ...f.end_banner, image: url } }))}
              bucket="ulaa"
              pathPrefix="trip-end-banners"
              fileNamePrefix={editingTrip ? editingTrip.slug : (slugify(form.title) || undefined)}
              hint="Wide landscape, at least 1600×900px — shown full-bleed behind the closing CTA text."
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
            />
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
            />
          </div>
          <div>
            <label htmlFor="trip-end-banner-cta-label" className="block text-sm font-medium text-dark mb-1">CTA Button Label (optional)</label>
            <input
              id="trip-end-banner-cta-label"
              value={form.end_banner.cta_label}
              onChange={e => setForm(f => ({ ...f, end_banner: { ...f.end_banner, cta_label: e.target.value } }))}
              className={inputClass}
              placeholder="Book Your Seat"
            />
          </div>
          <div>
            <label htmlFor="trip-end-banner-cta-url" className="block text-sm font-medium text-dark mb-1">CTA URL (optional)</label>
            <input
              id="trip-end-banner-cta-url"
              value={form.end_banner.cta_url}
              onChange={e => setForm(f => ({ ...f, end_banner: { ...f.end_banner, cta_url: e.target.value } }))}
              className={inputClass}
              placeholder="#booking or /trips/..."
            />
          </div>
        </TabPanel>
        <TabPanel label="Terms & Conditions">
          <div className="md:col-span-2">
            <TermsEditor
              value={form.terms_and_conditions}
              onChange={terms_and_conditions => setForm(f => ({ ...f, terms_and_conditions }))}
            />
          </div>
        </TabPanel>
        <TabPanel label="FAQs">
          <div className="md:col-span-2">
            <FAQEditor
              value={form.faqs}
              onChange={faqs => setForm(f => ({ ...f, faqs }))}
            />
          </div>
        </TabPanel>
        <TabPanel label="Cancellation Policy">
          <div className="md:col-span-2">
            <CancellationPolicyEditor
              value={form.cancellation_policy}
              onChange={cancellation_policy => setForm(f => ({ ...f, cancellation_policy }))}
            />
          </div>
        </TabPanel>
        <TabPanel label="Publish">
          <div className="md:col-span-2 space-y-3">
            <p className="text-sm font-medium text-dark">Status</p>
            <div className="space-y-2">
              {([
                { value: 'draft' as const, label: 'Draft', desc: 'Hidden everywhere on the public site.' },
                { value: 'coming_soon' as const, label: 'Coming Soon', desc: "Public, but only the cover image and title show — the trip card hides price/dates/seats and the trip detail page hides everything below the banner. Use this to put a trip up early while you're still filling in the rest of its content." },
                { value: 'published' as const, label: 'Published', desc: 'Public, full bookable trip page.' },
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
  );
}
