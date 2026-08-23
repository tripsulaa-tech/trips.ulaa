import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Bell,
  CheckCircle as CheckCircle2,
  XCircle,
  Circle,
  Confetti as PartyPopper,
  Clock,
  Plus,
} from '@phosphor-icons/react';
import AdminLayout from './AdminLayout';
import Button from '../components/ui/Button';
import { KpiCards, KpiCarousel } from '../components/ui/KpiCards';
import { useDragScroll } from '../components/ui/dataTableUtils';
import { useWaitlistData } from './waitlist/useWaitlistData';
import { useWaitlistGroups } from './waitlist/useWaitlistGroups';
import { useWaitlistFilters } from './waitlist/useWaitlistFilters';
import { useWaitlistActions } from './waitlist/useWaitlistActions';
import { useAddWaitlistModal } from './waitlist/useAddWaitlistModal';
import AdminAddWaitlistModal from './waitlist/AdminAddWaitlistModal';
import AdminWaitlistFilterBar from './waitlist/AdminWaitlistFilterBar';
import AdminWaitlistDesktopTable from './waitlist/AdminWaitlistDesktopTable';
import AdminWaitlistMobileCards from './waitlist/AdminWaitlistMobileCards';
import { hasSeatOpen } from './waitlist/waitlistShared';

/** The Waitlist admin page — everyone who signed up to be notified when a
 *  sold-out trip frees a seat.
 *
 *  This component is deliberately just an orchestrator: data loading lives
 *  in useWaitlistData, group-lettering in useWaitlistGroups, filter/sort/
 *  pagination/export in useWaitlistFilters, row actions (status change,
 *  delete, convert, queue rank) in useWaitlistActions, and the manual "Add
 *  to Waitlist" modal's state in useAddWaitlistModal — see ./waitlist/ for
 *  those, plus the desktop table, mobile cards, filter bar, and modal
 *  components this file composes. Split out of a single ~1350-line
 *  AdminWaitlist.tsx for maintainability; see that file's git history for
 *  the original single-component version. */
export default function AdminWaitlist() {
  const { entries, setEntries, seatsAvailable, allTrips, completedTrips, cancelledEnquiryIds, enquiriesForGroups, loading, load } = useWaitlistData();
  const { groupLabel } = useWaitlistGroups(entries, enquiriesForGroups);
  const filters = useWaitlistFilters(entries, completedTrips, seatsAvailable, groupLabel);
  const { updating, queueRank, handleStatusChange, handleDelete, handleConvert } = useWaitlistActions(entries, setEntries, seatsAvailable, load);

  const { ref: tableScrollRef, isDragging, handlers: dragHandlers } = useDragScroll<HTMLDivElement>();

  const [toast, setToast] = useState<string | null>(null);
  const showToast = (message: string) => setToast(message);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const addModal = useAddWaitlistModal(allTrips, load, showToast);

  const seatOpenCount = entries.filter(e => hasSeatOpen(e, seatsAvailable)).length;

  // KPI summary cards — same visual style as the Enquiries page, adapted
  // to waitlist statuses: Total signups, Waiting, Offer Sent, Converted,
  // Declined, Expired.
  const kpiPct = (n: number) => (filters.counts.all ? Math.round((n / filters.counts.all) * 100) : 0);
  const KPI_CARDS = [
    { label: 'Total Signups', value: filters.counts.all, sub: 'All time', icon: Users },
    { label: 'Waiting', value: filters.counts.waiting, sub: `${kpiPct(filters.counts.waiting)}% of total`, icon: Circle },
    { label: 'Offer Sent', value: filters.counts.notified, sub: `${kpiPct(filters.counts.notified)}% of total`, icon: Bell },
    { label: 'Converted', value: filters.counts.converted, sub: `${kpiPct(filters.counts.converted)}% of total`, icon: CheckCircle2 },
    { label: 'Declined', value: filters.counts.declined, sub: `${kpiPct(filters.counts.declined)}% of total`, icon: XCircle },
    { label: 'Expired', value: filters.counts.expired, sub: `${kpiPct(filters.counts.expired)}% of total`, icon: Clock },
  ] as const;

  return (
    <AdminLayout title="Waitlist" subtitle="Everyone who signed up to be notified when a sold-out trip frees a seat.">
      <div className="space-y-6">
        <div className="flex justify-end">
          <Button variant="primary" size="sm" onClick={addModal.openAdd}>
            <Plus size={16} aria-hidden="true" /> Add to Waitlist
          </Button>
        </div>

        {/* Actionable banner — seats open for people still waiting */}
        {seatOpenCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3"
          >
            <PartyPopper size={18} className="text-green-600 shrink-0" aria-hidden="true" />
            <p className="text-sm text-green-800">
              <span className="font-semibold">
                {seatOpenCount} {seatOpenCount === 1 ? 'person is' : 'people are'} waiting
              </span>{' '}
              on a trip that now has an open seat — sorted to the top below.
            </p>
          </motion.div>
        )}

        {/* KPI summary — desktop grid + mobile carousel, same style as the Enquiries page */}
        <KpiCards cards={KPI_CARDS} />
        <KpiCarousel cards={KPI_CARDS} />

        <AdminWaitlistFilterBar
          trips={filters.trips}
          statusFilter={filters.statusFilter}
          setStatusFilter={filters.setStatusFilter}
          tripFilter={filters.tripFilter}
          setTripFilter={filters.setTripFilter}
          searchQuery={filters.searchQuery}
          setSearchQuery={filters.setSearchQuery}
          openFilterPanel={filters.openFilterPanel}
          setOpenFilterPanel={filters.setOpenFilterPanel}
          mobileFiltersOpen={filters.mobileFiltersOpen}
          setMobileFiltersOpen={filters.setMobileFiltersOpen}
          counts={filters.counts}
          tripCounts={filters.tripCounts}
          activeFilterCount={filters.activeFilterCount}
          clearAllFilters={filters.clearAllFilters}
        />

        {loading ? (
          <div className="text-center py-16">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : filters.filtered.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-lg shadow-card">
            <p className="font-display text-xl text-dark-muted">No waitlist signups found.</p>
          </div>
        ) : (
          <>
            <AdminWaitlistDesktopTable
              paginatedEntries={filters.paginatedEntries}
              waitlistSafePage={filters.waitlistSafePage}
              waitlistTotalPages={filters.waitlistTotalPages}
              waitlistRangeStart={filters.waitlistRangeStart}
              waitlistRangeEnd={filters.waitlistRangeEnd}
              totalFiltered={filters.filtered.length}
              sortKey={filters.sortKey}
              sortDir={filters.sortDir}
              onSort={filters.handleSort}
              searchQuery={filters.searchQuery}
              setSearchQuery={filters.setSearchQuery}
              onExport={filters.handleExportCsv}
              onPageChange={filters.setCurrentPage}
              tableScrollRef={tableScrollRef}
              isDragging={isDragging}
              dragHandlers={dragHandlers}
              seatsAvailable={seatsAvailable}
              cancelledEnquiryIds={cancelledEnquiryIds}
              groupLabel={groupLabel}
              queueRank={queueRank}
              updating={updating}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
              onConvert={handleConvert}
            />

            <AdminWaitlistMobileCards
              paginatedEntries={filters.paginatedEntries}
              waitlistSafePage={filters.waitlistSafePage}
              waitlistTotalPages={filters.waitlistTotalPages}
              waitlistRangeStart={filters.waitlistRangeStart}
              waitlistRangeEnd={filters.waitlistRangeEnd}
              totalFiltered={filters.filtered.length}
              onPageChange={filters.setCurrentPage}
              seatsAvailable={seatsAvailable}
              cancelledEnquiryIds={cancelledEnquiryIds}
              groupLabel={groupLabel}
              queueRank={queueRank}
              updating={updating}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
              onConvert={handleConvert}
            />
          </>
        )}
      </div>

      <AdminAddWaitlistModal
        isOpen={addModal.modalOpen}
        onClose={() => addModal.setModalOpen(false)}
        form={addModal.form}
        setForm={addModal.setForm}
        formTouched={addModal.formTouched}
        setFormTouched={addModal.setFormTouched}
        formErrors={addModal.formErrors}
        hasFormErrors={addModal.hasFormErrors}
        saving={addModal.saving}
        allTrips={allTrips}
        onSave={addModal.handleSave}
      />

      {/* Lightweight success toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2 bg-dark text-white text-sm font-medium px-4 py-2.5 rounded-md shadow-warm-lg"
          >
            <CheckCircle2 size={16} className="text-green-400 shrink-0" aria-hidden="true" />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </AdminLayout>
  );
}
