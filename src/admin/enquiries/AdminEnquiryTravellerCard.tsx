// Traveller & Trip info sidebar card — split out of AdminEnquiryDetail.tsx.
import {
  User, Briefcase, Buildings as Building2, ForkKnife as Utensils,
  CalendarBlank as CalendarDays, Globe, Package, Bird,
  Phone as PhoneIcon, EnvelopeSimple,
} from '@phosphor-icons/react';
import FoodMark from '../../components/ui/FoodMark';
import { ContactQuickLinks } from '../../components/ui/DataTableChrome';
import type { Enquiry } from '../../types/types-index';
import { formatDate, formatTime } from '../../utils/utils-index';
import { PACKAGE_CONFIG, SOURCE_CONFIG } from './AdminEnquiryCommon';

interface AdminEnquiryTravellerCardProps {
  enquiry: Enquiry;
  isGeneralContactMessage: boolean;
}

export default function AdminEnquiryTravellerCard({ enquiry, isGeneralContactMessage }: AdminEnquiryTravellerCardProps) {
  const srcCfg = SOURCE_CONFIG[enquiry.source] || SOURCE_CONFIG.other;

  return (
    <div className="bg-white rounded-lg shadow-card p-4 sm:p-5">
      <p className="text-dark text-base font-display font-bold mb-4 flex items-center gap-2">
        <User size={18} className="shrink-0 text-dark-muted" aria-hidden="true" /> Traveller &amp; Trip
      </p>

      <div className="grid grid-cols-2 gap-x-3 gap-y-3 pb-4 border-b border-background-warm">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
            <PhoneIcon size={15} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-dark-muted text-xs">Phone</p>
            <p className="text-dark text-sm font-semibold truncate">{enquiry.phone}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
            <EnvelopeSimple size={15} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-dark-muted text-xs">Email</p>
            <p className="text-dark text-sm font-semibold truncate">{enquiry.email}</p>
          </div>
        </div>
        <div className="col-span-2 mt-1">
          <ContactQuickLinks phone={enquiry.phone} email={enquiry.email} name={enquiry.full_name} tripTitle={enquiry.trip_title} size="md" />
        </div>
      </div>

      <div className="divide-y divide-background-warm">
        <div className="grid grid-cols-2 gap-x-3 gap-y-3 py-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
              <Briefcase size={15} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-dark-muted text-xs">Trip</p>
              <p className="text-dark text-sm font-semibold truncate">
                {enquiry.trip_id ? enquiry.trip_title : (
                  <span className="text-dark-muted italic font-normal">
                    {isGeneralContactMessage ? 'None — Contact Us message' : 'None — logged without a trip'}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
              <User size={15} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-dark-muted text-xs">Age</p>
              <p className="text-dark text-sm font-semibold truncate">{enquiry.age ?? '—'}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-3 py-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
              <Building2 size={15} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-dark-muted text-xs">City</p>
              <p className="text-dark text-sm font-semibold truncate">{enquiry.city || '—'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
              <Utensils size={15} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-dark-muted text-xs">Food Preference</p>
              <p className={`text-sm font-semibold truncate flex items-center gap-1 ${
                enquiry.food_preference === 'veg' ? 'text-green-700' : enquiry.food_preference === 'non_veg' ? 'text-red-700' : 'text-dark'
              }`}>
                {(enquiry.food_preference === 'veg' || enquiry.food_preference === 'non_veg') && <FoodMark type={enquiry.food_preference} size={11} />}
                {enquiry.food_preference === 'veg' ? 'Veg' : enquiry.food_preference === 'non_veg' ? 'Non-veg' : '—'}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-3 py-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
              <CalendarDays size={15} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-dark-muted text-xs">Date &amp; Time</p>
              <p className="text-dark text-sm font-semibold truncate">{formatDate(enquiry.created_at, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
              <p className="text-dark-muted text-xs truncate">{formatTime(enquiry.created_at)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
              <Globe size={15} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-dark-muted text-xs">Source</p>
              <p className="text-dark text-sm font-semibold truncate">{srcCfg.label}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-3 py-4 items-center">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
              {enquiry.package_type === 'early_bird' ? <Bird size={15} aria-hidden="true" /> : <Package size={15} aria-hidden="true" />}
            </span>
            <div className="min-w-0">
              <p className="text-dark-muted text-xs">Package</p>
              <p className="text-dark text-sm font-semibold truncate">{PACKAGE_CONFIG[enquiry.package_type || 'normal'].label}</p>
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
