import { motion } from 'framer-motion';
import {
  Trash as Trash2,
  Envelope as Mail,
  Phone,
  ChatDots as MessageSquare,
  Users,
  CheckCircle as CheckCircle2,
  XCircle,
  Confetti as PartyPopper,
  UserPlus,
  CalendarBlank as CalendarDays,
  Clock,
  User,
} from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';
import Select from '../../components/ui/Select';
import FoodMark from '../../components/ui/FoodMark';
import { TablePagination, ContactQuickLinks } from '../../components/ui/DataTableChrome';
import type { WaitlistEntry } from '../../types/types-index';
import { formatDate } from '../../utils/utils-index';
import {
  STATUS_CONFIG, EDITABLE_STATUS_OPTIONS, offerExpiryLabel,
  foodBreakdown, messageWithoutFoodBreakdown,
  seatsNeeded, convertedIds, convertedCount, seatsRemaining, hasSeatOpen, canConvert,
} from './waitlistShared';

interface AdminWaitlistMobileCardsProps {
  paginatedEntries: WaitlistEntry[];
  waitlistSafePage: number;
  waitlistTotalPages: number;
  waitlistRangeStart: number;
  waitlistRangeEnd: number;
  totalFiltered: number;
  onPageChange: (page: number) => void;
  seatsAvailable: Record<string, number>;
  cancelledEnquiryIds: Set<string>;
  groupLabel: (e: WaitlistEntry) => string;
  queueRank: Map<string, { rank: number; total: number }>;
  updating: string | null;
  onStatusChange: (id: string, status: WaitlistEntry['status']) => void;
  onDelete: (entry: WaitlistEntry) => void;
  onConvert: (entry: WaitlistEntry) => void;
}

/** The mobile card layout for the waitlist list — below sm. Purely
 *  presentational; all state, filtering/sorting, and row actions live in
 *  the page's hooks.
 *
 *  Extracted from AdminWaitlist.tsx (see that file's history for the
 *  original single-component version). */
export default function AdminWaitlistMobileCards({
  paginatedEntries, waitlistSafePage, waitlistTotalPages, waitlistRangeStart, waitlistRangeEnd,
  totalFiltered, onPageChange, seatsAvailable, cancelledEnquiryIds, groupLabel,
  queueRank, updating, onStatusChange, onDelete, onConvert,
}: AdminWaitlistMobileCardsProps) {
  const navigate = useNavigate();

  return (
    <>
      <div className="sm:hidden space-y-3">
        {paginatedEntries.map(e => {
          const cfg = STATUS_CONFIG[e.status];
          return (
            <motion.div
              key={e.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-white rounded-lg shadow-card p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-dark truncate flex items-center gap-1.5">
                    {e.full_name}
                    {e.group_size && e.group_size > 1 && (
                      <span
                        title={`${groupLabel(e)} — waiting for ${e.group_size} seats together`}
                        className="inline-flex items-center gap-1 text-[10px] font-button font-semibold px-1.5 py-0.5 rounded-md bg-background-warm text-dark-muted whitespace-nowrap"
                      >
                        <Users size={9} aria-hidden="true" /> {groupLabel(e)} · {e.group_size}
                      </span>
                    )}
                    {canConvert(e) && (queueRank.get(e.id)?.total ?? 0) > 1 && (
                      <span
                        title={queueRank.get(e.id)!.rank === 1
                          ? `First in line for this trip — ${queueRank.get(e.id)!.total} waiting in total`
                          : `#${queueRank.get(e.id)!.rank} of ${queueRank.get(e.id)!.total} waiting for this trip — ${queueRank.get(e.id)!.rank - 1} waited longer`}
                        className={`inline-flex items-center gap-1 text-[10px] font-button font-semibold px-1.5 py-0.5 rounded-md whitespace-nowrap ${
                          queueRank.get(e.id)!.rank === 1 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        #{queueRank.get(e.id)!.rank} of {queueRank.get(e.id)!.total} waiting
                      </span>
                    )}
                    {e.status !== 'converted' && convertedCount(e) > 0 && (
                      <span
                        title={`${convertedCount(e)} of ${seatsNeeded(e)} in this group converted so far — ${seatsRemaining(e)} left to go`}
                        className="inline-flex items-center gap-1 text-[10px] font-button font-semibold px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-700 whitespace-nowrap"
                      >
                        <CheckCircle2 size={9} aria-hidden="true" /> {convertedCount(e)}/{seatsNeeded(e)} converted
                      </span>
                    )}
                  </p>
                  <p className="text-dark-muted text-xs truncate">{e.trip_title || 'Untitled trip'}</p>
                  {hasSeatOpen(e, seatsAvailable) && (
                    <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-button font-semibold px-2 py-0.5 rounded-md bg-green-100 text-green-700 whitespace-nowrap">
                      <PartyPopper size={10} className="shrink-0" aria-hidden="true" />
                      {seatsAvailable[e.trip_id]} seat{seatsAvailable[e.trip_id] === 1 ? '' : 's'} open
                    </span>
                  )}
                  {!hasSeatOpen(e, seatsAvailable) && e.status === 'waiting' && seatsRemaining(e) > 1 && (seatsAvailable[e.trip_id] ?? 0) > 0 && (
                    <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-button font-semibold px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 whitespace-nowrap">
                      {seatsAvailable[e.trip_id]}/{seatsRemaining(e)} seats open
                    </span>
                  )}
                </div>
                <span className={`shrink-0 inline-flex items-center gap-1 text-[11px] font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap ${cfg.color}`}>
                  <cfg.icon size={11} className="shrink-0" aria-hidden="true" />
                  {cfg.label}
                </span>
              </div>

              <div className="text-xs text-dark-muted space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
                      <Mail size={10} aria-hidden="true" />
                    </span>
                    <span className="truncate">{e.email}</span>
                  </p>
                  <ContactQuickLinks phone={e.phone} email={e.email} name={e.full_name} tripTitle={e.trip_title} />
                </div>
                <p className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
                    <Phone size={10} aria-hidden="true" />
                  </span>
                  {e.phone}
                </p>
                <div className="border-b border-background-warm !mt-2.5 !mb-2.5" />
                {(e.age || e.food_preference || foodBreakdown(e)) && (
                  <p className="flex items-center flex-wrap gap-x-2 gap-y-1.5">
                    {e.age && (
                      <>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
                            <User size={10} aria-hidden="true" />
                          </span>
                          {e.age} yrs
                        </span>
                        <span className="w-px h-3.5 bg-background-warm shrink-0" />
                      </>
                    )}
                    {foodBreakdown(e) ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 text-green-700">
                          <FoodMark type="veg" size={11} /> {foodBreakdown(e)![1]} veg
                        </span>
                        <span className="text-dark-muted/40">/</span>
                        <span className="inline-flex items-center gap-1 text-red-700">
                          <FoodMark type="non_veg" size={11} /> {foodBreakdown(e)![2]} non-veg
                        </span>
                      </span>
                    ) : e.food_preference && (
                      <span className={`inline-flex items-center gap-1 ${e.food_preference === 'veg' ? 'text-green-700' : 'text-red-700'}`}>
                        <FoodMark type={e.food_preference} size={11} /> {e.food_preference === 'veg' ? 'Veg' : 'Non-veg'}
                      </span>
                    )}
                    {(foodBreakdown(e) || e.food_preference) && (
                      <span className="w-px h-3.5 bg-background-warm shrink-0" />
                    )}
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
                        <CalendarDays size={10} aria-hidden="true" />
                      </span>
                      {formatDate(e.created_at, { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </p>
                )}
                {e.city && <p>{e.city}</p>}
                {e.emergency_contact && <p>Emergency: {e.emergency_contact}</p>}
                {!(e.age || e.food_preference || foodBreakdown(e)) && (
                  <p className="flex items-center gap-1.5">
                    <CalendarDays size={11} className="shrink-0" aria-hidden="true" /> {formatDate(e.created_at, { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                )}
                {messageWithoutFoodBreakdown(e) && (
                  <p className="flex items-start gap-1.5 mt-1.5">
                    <MessageSquare size={12} className="shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{messageWithoutFoodBreakdown(e)}</span>
                  </p>
                )}
              </div>

              {canConvert(e) && (
                <button
                  onClick={() => onConvert(e)}
                  className={`w-full inline-flex items-center justify-center gap-1.5 text-sm font-button font-semibold py-2 rounded border transition-colors ${
                    hasSeatOpen(e, seatsAvailable)
                      ? 'bg-green-600 text-white border-green-600 hover:bg-green-700'
                      : 'border-primary/40 text-primary hover:bg-primary/10'
                  }`}
                >
                  <UserPlus size={14} className="shrink-0" aria-hidden="true" />
                  Convert to Enquiry
                </button>
              )}

              <div className="flex items-center gap-2 pt-1">
                {e.status === 'converted' ? (
                  <div className="flex-1 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="inline-flex items-center gap-1 text-xs font-button font-semibold px-2.5 py-1 rounded-md bg-green-100 text-green-700 whitespace-nowrap">
                        <CheckCircle2 size={12} className="shrink-0" aria-hidden="true" />
                        Converted{convertedCount(e) > 1 ? ` (${convertedCount(e)}/${convertedCount(e)})` : ''}
                      </span>
                      {convertedIds(e).some(id => cancelledEnquiryIds.has(id)) && (
                        <span className="inline-flex items-center gap-1 text-xs font-button font-semibold px-2.5 py-1 rounded-md bg-red-100 text-red-700 whitespace-nowrap">
                          <XCircle size={12} className="shrink-0" aria-hidden="true" />
                          {convertedIds(e).length > 1
                            ? `${convertedIds(e).filter(id => cancelledEnquiryIds.has(id)).length}/${convertedIds(e).length} cancelled`
                            : 'Booking cancelled'}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      {convertedIds(e).map((id, i) => (
                        <button
                          key={id}
                          onClick={() => navigate(`/admin/enquiries?enquiry=${id}`)}
                          className="text-xs font-button font-semibold text-primary underline underline-offset-2 whitespace-nowrap"
                        >
                          View booking{convertedIds(e).length > 1 ? ` ${i + 1}` : ''}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col gap-1">
                    <label htmlFor={`waitlist-status-mobile-${e.id}`} className="sr-only">Status for {e.full_name}</label>
                    <Select
                      inputId={`waitlist-status-mobile-${e.id}`}
                      value={e.status}
                      disabled={updating === e.id}
                      onChange={val => onStatusChange(e.id, val as WaitlistEntry['status'])}
                      options={EDITABLE_STATUS_OPTIONS}
                      size="sm"
                    />
                    {e.status === 'notified' && offerExpiryLabel(e.offer_expiry) && (
                      <span
                        className={`inline-flex items-center gap-1 self-start text-[10px] font-button font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                          offerExpiryLabel(e.offer_expiry)!.overdue ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        <Clock size={9} className="shrink-0" aria-hidden="true" /> {offerExpiryLabel(e.offer_expiry)!.text}
                      </span>
                    )}
                  </div>
                )}
                <button
                  onClick={() => onDelete(e)}
                  disabled={updating === e.id}
                  aria-label={`Remove ${e.full_name} from waitlist`}
                  className="shrink-0 w-9 h-9 inline-flex items-center justify-center rounded border border-primary/30 text-primary hover:bg-primary/5 transition-colors"
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Mobile: same "Showing X–Y of N" + Prev/Next pagination the
          desktop table gets. */}
      <div className="sm:hidden bg-white rounded-lg shadow-card overflow-hidden">
        <p className="text-dark-muted text-xs text-center px-4 pt-3">
          {totalFiltered === 0 ? 'No signups found' : `Showing ${waitlistRangeStart}\u2013${waitlistRangeEnd} of ${totalFiltered} signups`}
        </p>
        <TablePagination
          currentPage={waitlistSafePage}
          totalPages={waitlistTotalPages}
          onPageChange={onPageChange}
        />
      </div>
    </>
  );
}
