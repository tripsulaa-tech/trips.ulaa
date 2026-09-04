// Traveller & Trip info sidebar card — split out of AdminEnquiryDetail.tsx.
// The pencil icon turns Full Name/Phone/Email/City/Age/Trip into inline
// inputs right in their existing spots (same layout as the read-only view,
// nothing rearranged) — same fields/save behaviour as the old Edit Details
// modal (useEditEnquiry / AdminEditDetailsModal's field set), just edited
// in place instead of in a popup. Food Preference, Date & Time, Source, and
// Package stay read-only — they're not part of that field set.
import type { Dispatch, SetStateAction } from 'react';
import {
  User, Briefcase, Buildings as Building2, ForkKnife as Utensils,
  CalendarBlank as CalendarDays, Globe, Package, Bird,
  Phone as PhoneIcon, EnvelopeSimple, Pencil, Check, X,
} from '@phosphor-icons/react';
import Select from '../../components/ui/Select';
import FoodMark from '../../components/ui/FoodMark';
import { ContactQuickLinks } from '../../components/ui/DataTableChrome';
import type { Enquiry, UpcomingTrip } from '../../types/types-index';
import { formatDate, formatTime } from '../../utils/utils-index';
import { PACKAGE_CONFIG, PACKAGE_OPTIONS, SOURCE_CONFIG, SOURCE_OPTIONS_ALL, FOOD_PREFERENCE_OPTIONS } from './AdminEnquiryCommon';
import type { EditDetailsForm } from './AdminEditDetailsModal';

interface AdminEnquiryTravellerCardProps {
  enquiry: Enquiry;
  isGeneralContactMessage: boolean;
  editing: boolean;
  editForm: EditDetailsForm;
  setEditForm: Dispatch<SetStateAction<EditDetailsForm>>;
  editTouched: Set<string>;
  setEditTouched: Dispatch<SetStateAction<Set<string>>>;
  trips: UpcomingTrip[];
  savingEdit: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
}

// Compact inline-input style — matches the surrounding "text-dark text-sm
// font-semibold" value text as closely as an <input> can, just with a
// visible edit affordance (border) instead of plain text.
const inlineInputClass =
  'w-full px-2 py-1 rounded-md border-2 border-background-warm bg-white text-dark text-sm font-semibold focus:border-primary outline-none';

export default function AdminEnquiryTravellerCard({
  enquiry, isGeneralContactMessage, editing, editForm, setEditForm, editTouched, setEditTouched,
  trips, savingEdit, onStartEdit, onCancelEdit, onSaveEdit,
}: AdminEnquiryTravellerCardProps) {
  const srcCfg = SOURCE_CONFIG[enquiry.source] || SOURCE_CONFIG.other;

  const editErrors: { full_name?: string; phone?: string } = {};
  if (!editForm.full_name.trim()) editErrors.full_name = 'Full name is required.';
  if (!editForm.phone.trim()) editErrors.phone = 'Phone number is required.';
  const hasEditErrors = !!(editErrors.full_name || editErrors.phone);

  const handleSaveClick = () => {
    setEditTouched(new Set(['full_name', 'phone']));
    if (!hasEditErrors) onSaveEdit();
  };

  return (
    <div className="bg-white rounded-lg shadow-card p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-dark text-base font-display font-bold flex items-center gap-2">
          <User size={18} className="shrink-0 text-dark-muted" aria-hidden="true" /> Traveller &amp; Trip
        </p>
        {editing ? (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onCancelEdit}
              title="Cancel"
              className="w-8 h-8 rounded-full inline-flex items-center justify-center text-dark-muted hover:bg-background-warm hover:text-dark transition-colors"
            >
              <X size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={handleSaveClick}
              disabled={savingEdit}
              title={hasEditErrors ? 'Fix the highlighted fields before saving' : 'Save changes'}
              className="w-8 h-8 rounded-full inline-flex items-center justify-center text-white bg-primary hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              <Check size={15} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onStartEdit}
            title="Edit these details — fixes who this enquiry is actually about, doesn't affect payments, status, or booking journey"
            className="w-8 h-8 rounded-full inline-flex items-center justify-center text-dark-muted hover:bg-background-warm hover:text-dark transition-colors shrink-0"
          >
            <Pencil size={15} aria-hidden="true" />
          </button>
        )}
      </div>

      {editing && (
        <div className="flex items-center gap-2.5 min-w-0 pb-4 mb-1 border-b border-background-warm">
          <span className="w-9 h-9 rounded-full bg-primary/10 text-primary inline-flex items-center justify-center shrink-0">
            <User size={15} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <label htmlFor="eq-detail-edit-name" className="text-dark-muted text-xs">Full Name</label>
            <input
              id="eq-detail-edit-name"
              type="text"
              value={editForm.full_name}
              onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))}
              onBlur={() => setEditTouched(prev => new Set(prev).add('full_name'))}
              aria-describedby={editTouched.has('full_name') && editErrors.full_name ? 'eq-detail-edit-name-error' : undefined}
              className={`${inlineInputClass} mt-0.5`}
              placeholder="e.g. Priya Sharma"
            />
            {editTouched.has('full_name') && editErrors.full_name && <p id="eq-detail-edit-name-error" role="alert" className="text-red-500 text-xs mt-1">{editErrors.full_name}</p>}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-3 gap-y-3 pb-4 border-b border-background-warm">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-9 h-9 rounded-full bg-primary/10 text-primary inline-flex items-center justify-center shrink-0">
            <PhoneIcon size={15} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <label htmlFor="eq-detail-edit-phone" className="text-dark-muted text-xs">Phone</label>
            {editing ? (
              <>
                <input
                  id="eq-detail-edit-phone"
                  type="tel"
                  value={editForm.phone}
                  onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                  onBlur={() => setEditTouched(prev => new Set(prev).add('phone'))}
                  aria-describedby={editTouched.has('phone') && editErrors.phone ? 'eq-detail-edit-phone-error' : undefined}
                  className={`${inlineInputClass} mt-0.5`}
                  placeholder="e.g. 98765 43210"
                />
                {editTouched.has('phone') && editErrors.phone && <p id="eq-detail-edit-phone-error" role="alert" className="text-red-500 text-xs mt-1">{editErrors.phone}</p>}
              </>
            ) : (
              <p className="text-dark text-sm font-semibold truncate">{enquiry.phone}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-9 h-9 rounded-full bg-primary/10 text-primary inline-flex items-center justify-center shrink-0">
            <EnvelopeSimple size={15} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <label htmlFor="eq-detail-edit-email" className="text-dark-muted text-xs">Email</label>
            {editing ? (
              <input
                id="eq-detail-edit-email"
                type="email"
                value={editForm.email}
                onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                className={`${inlineInputClass} mt-0.5`}
                placeholder="Optional"
              />
            ) : (
              <p title={enquiry.email} className="text-dark text-sm font-semibold truncate">{enquiry.email}</p>
            )}
          </div>
        </div>
        {!editing && (
          <div className="col-span-2 mt-1">
            <ContactQuickLinks phone={enquiry.phone} email={enquiry.email} name={enquiry.full_name} tripTitle={enquiry.trip_title} size="md" />
          </div>
        )}
      </div>

      <div className="divide-y divide-background-warm">
        <div className="grid grid-cols-2 gap-x-3 gap-y-3 py-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-full bg-primary/10 text-primary inline-flex items-center justify-center shrink-0">
              <Briefcase size={15} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <label htmlFor="eq-detail-edit-trip" className="text-dark-muted text-xs">Trip</label>
              {editing ? (
                <div className="mt-0.5">
                  <Select
                    inputId="eq-detail-edit-trip"
                    size="sm"
                    value={editForm.trip_id}
                    onChange={val => setEditForm(f => ({ ...f, trip_id: val }))}
                    options={[{ value: '', label: '— No specific trip —' }, ...trips.map(t => ({ value: t.id, label: t.title }))]}
                  />
                  {editForm.trip_id !== (enquiry.trip_id || '') && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1.5 mt-1.5">
                      Changing the trip doesn't update an already-tracked total amount — open Payment afterwards to re-check the price for the new trip.
                    </p>
                  )}
                </div>
              ) : (
                <p title={enquiry.trip_id ? enquiry.trip_title : undefined} className="text-dark text-sm font-semibold truncate">
                  {enquiry.trip_id ? enquiry.trip_title : (
                    <span className="text-dark-muted italic font-normal">
                      {isGeneralContactMessage ? 'None — Contact Us message' : 'None — logged without a trip'}
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-full bg-primary/10 text-primary inline-flex items-center justify-center shrink-0">
              <User size={15} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <label htmlFor="eq-detail-edit-age" className="text-dark-muted text-xs">Age</label>
              {editing ? (
                <input
                  id="eq-detail-edit-age"
                  type="number"
                  min={0}
                  value={editForm.age}
                  onChange={e => setEditForm(f => ({ ...f, age: e.target.value === '' ? '' : Number(e.target.value) }))}
                  className={`${inlineInputClass} mt-0.5`}
                  placeholder="Optional"
                />
              ) : (
                <p className="text-dark text-sm font-semibold truncate">{enquiry.age ?? '—'}</p>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-3 py-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-full bg-primary/10 text-primary inline-flex items-center justify-center shrink-0">
              <Building2 size={15} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <label htmlFor="eq-detail-edit-city" className="text-dark-muted text-xs">City</label>
              {editing ? (
                <input
                  id="eq-detail-edit-city"
                  type="text"
                  value={editForm.city}
                  onChange={e => setEditForm(f => ({ ...f, city: e.target.value }))}
                  className={`${inlineInputClass} mt-0.5`}
                  placeholder="Optional"
                />
              ) : (
                <p className="text-dark text-sm font-semibold truncate">{enquiry.city || '—'}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-full bg-primary/10 text-primary inline-flex items-center justify-center shrink-0">
              <Utensils size={15} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <label htmlFor="eq-detail-edit-food" className="text-dark-muted text-xs">Food Preference</label>
              {editing ? (
                <div className="mt-0.5">
                  <Select
                    inputId="eq-detail-edit-food"
                    size="sm"
                    value={editForm.food_preference}
                    onChange={val => setEditForm(f => ({ ...f, food_preference: val as 'veg' | 'non_veg' | '' }))}
                    options={FOOD_PREFERENCE_OPTIONS}
                  />
                </div>
              ) : (
                <p className={`text-sm font-semibold truncate flex items-center gap-1 ${
                  enquiry.food_preference === 'veg' ? 'text-green-700' : enquiry.food_preference === 'non_veg' ? 'text-red-700' : 'text-dark'
                }`}>
                  {(enquiry.food_preference === 'veg' || enquiry.food_preference === 'non_veg') && <FoodMark type={enquiry.food_preference} size={11} />}
                  {enquiry.food_preference === 'veg' ? 'Veg' : enquiry.food_preference === 'non_veg' ? 'Non-veg' : '—'}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-3 py-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-full bg-primary/10 text-primary inline-flex items-center justify-center shrink-0">
              <CalendarDays size={15} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-dark-muted text-xs">Date &amp; Time</p>
              <p className="text-dark text-sm font-semibold truncate">{formatDate(enquiry.created_at, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
              <p className="text-dark-muted text-xs truncate">{formatTime(enquiry.created_at)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-full bg-primary/10 text-primary inline-flex items-center justify-center shrink-0">
              <Globe size={15} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <label htmlFor="eq-detail-edit-source" className="text-dark-muted text-xs">Source</label>
              {editing ? (
                <div className="mt-0.5">
                  <Select
                    inputId="eq-detail-edit-source"
                    size="sm"
                    value={editForm.source}
                    onChange={val => setEditForm(f => ({ ...f, source: val as Enquiry['source'] }))}
                    options={SOURCE_OPTIONS_ALL}
                  />
                </div>
              ) : (
                <p className="text-dark text-sm font-semibold truncate">{srcCfg.label}</p>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-3 py-4 items-center">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-full bg-primary/10 text-primary inline-flex items-center justify-center shrink-0">
              {enquiry.package_type === 'early_bird' ? <Bird size={15} aria-hidden="true" /> : <Package size={15} aria-hidden="true" />}
            </span>
            <div className="min-w-0 flex-1">
              <label htmlFor="eq-detail-edit-package" className="text-dark-muted text-xs">Package</label>
              {editing && !enquiry.booking_id ? (
                <div className="mt-0.5">
                  <Select
                    inputId="eq-detail-edit-package"
                    size="sm"
                    value={editForm.package_type}
                    onChange={val => setEditForm(f => ({ ...f, package_type: val as 'early_bird' | 'normal' }))}
                    options={PACKAGE_OPTIONS}
                  />
                </div>
              ) : (
                <p className="text-dark text-sm font-semibold truncate">
                  {PACKAGE_CONFIG[enquiry.package_type || 'normal'].label}
                  {/* Once a booking exists, changing package here would write
                      package_type straight to the row with no price
                      reconciliation — Track Payment's own Package field is
                      the only place that updates both together. */}
                  {editing && enquiry.booking_id && (
                    <span className="block text-[11px] text-dark-muted font-normal">Change via Track Payment</span>
                  )}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {enquiry.message && (
        <div className="mt-1 pt-4 border-t border-background-warm">
          <p className="text-dark-muted text-xs mb-1">Message</p>
          <p className="text-dark text-sm whitespace-pre-wrap">{enquiry.message}</p>
        </div>
      )}
    </div>
  );
}
