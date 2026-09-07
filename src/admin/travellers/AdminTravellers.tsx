import { AddressBook, Repeat, Briefcase, XCircle } from '@phosphor-icons/react';
import AdminLayout from '../AdminLayout';
import { KpiCards, KpiCarousel } from '../../components/ui/KpiCards';
import { TableHeaderBar, TablePagination } from '../../components/ui/DataTableChrome';
import { paginate } from '../../components/ui/dataTableUtils';
import { useTravellers, TRAVELLERS_PAGE_SIZE } from './useTravellers';
import AdminTravellerCard from './AdminTravellerCard';
import AdminTravellersDesktopTable from './AdminTravellersDesktopTable';
import AdminEditTravellerModal from './AdminEditTravellerModal';

// Shared by both the mobile filter card and the desktop bar above the
// table — same button, just two different places to sit depending on
// viewport (see the two usages below).
function RepeatToggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 text-xs font-button font-semibold px-3 py-1.5 rounded-full border-2 transition-colors ${
        active
          ? 'bg-primary border-primary text-white'
          : 'border-background-warm text-dark-muted hover:border-primary/30'
      }`}
    >
      <Repeat size={12} aria-hidden="true" /> Repeat travellers only
    </button>
  );
}

/** Contact Book — one card per contact (grouped across every trip or
 *  enquiry they've logged, however many separate enquiry rows that came
 *  from), so an admin can look someone up by name/phone/trip without
 *  digging through the trip-by-trip Enquiries list. Shows every contact
 *  we've saved a phone number for, whether they went on to book a trip or
 *  not. See ./travellerContacts.ts for how rows get collapsed into one
 *  contact, and ./useTravellers.ts for the data/search/filter/pagination
 *  state this page renders. */
export default function AdminTravellers() {
  const {
    loading,
    contacts,
    totalCount,
    searchQuery, setSearchQuery,
    repeatOnly, setRepeatOnly,
    page, setPage,
    kpis,
    editTarget, setEditTarget,
    savingEdit,
    handleSaveEdit,
    deletingKey,
    handleDelete,
  } = useTravellers();

  const { pageItems, totalPages, safePage, rangeStart, rangeEnd } = paginate(contacts, page, TRAVELLERS_PAGE_SIZE);

  const KPI_CARDS = [
    { label: 'Contacts', value: kpis.total, sub: 'Everyone we have a phone number for', icon: AddressBook },
    { label: 'Repeat Travellers', value: kpis.repeat, sub: '2+ trips or enquiries logged', icon: Repeat },
    { label: 'Trips', value: kpis.tripsBooked, sub: 'Distinct trips across every contact', icon: Briefcase },
    { label: 'Cancelled Bookings', value: kpis.cancelledTrips, sub: 'Bookings that fell through', icon: XCircle },
  ] as const;

  return (
    <AdminLayout title="Travellers" subtitle="Every contact you've saved a phone number for — whether they've booked a trip yet or not.">
      <div className="space-y-4 sm:space-y-6">
        <KpiCards cards={KPI_CARDS} columns={4} />
        <KpiCarousel cards={KPI_CARDS} />

        {/* Mobile (below sm): filter card with its own search + toggle,
            above the stacked card list. */}
        <div className="sm:hidden bg-white rounded-lg shadow-card overflow-hidden">
          <TableHeaderBar
            title="Contact Book"
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            total={contacts.length}
            itemLabel="contacts"
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder="Search name, phone, email, trip..."
          />
          <div className="px-4 pb-4 flex items-center gap-2">
            <RepeatToggle active={repeatOnly} onToggle={() => setRepeatOnly(v => !v)} />
          </div>
        </div>

        {/* Desktop (sm and up): just the toggle — title/search already
            live inside AdminTravellersDesktopTable's own TableHeaderBar. */}
        <div className="hidden sm:flex items-center gap-2">
          <RepeatToggle active={repeatOnly} onToggle={() => setRepeatOnly(v => !v)} />
        </div>

        {loading ? (
          <div className="text-center py-16 text-dark-muted bg-white rounded-lg shadow-card">Loading contacts&hellip;</div>
        ) : pageItems.length === 0 ? (
          <div className="text-center py-16 text-dark-muted bg-white rounded-lg shadow-card">
            {totalCount === 0
              ? "No contacts yet — once someone enquires with a phone number, they'll show up here."
              : 'No contacts match your search.'}
          </div>
        ) : (
          <>
            {/* Mobile (below sm): a card per contact. */}
            <div className="sm:hidden space-y-3">
              {pageItems.map((contact) => (
                <AdminTravellerCard
                  key={contact.key}
                  contact={contact}
                  onEdit={() => setEditTarget(contact)}
                  onDelete={() => handleDelete(contact)}
                  deleting={deletingKey === contact.key}
                />
              ))}
            </div>

            {/* Desktop (sm and up): the full table. */}
            <AdminTravellersDesktopTable
              pageItems={pageItems}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              total={contacts.length}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              safePage={safePage}
              totalPages={totalPages}
              setPage={setPage}
              onEdit={setEditTarget}
              onDelete={handleDelete}
              deletingKey={deletingKey}
            />
          </>
        )}

        {!loading && pageItems.length > 0 && (
          <div className="sm:hidden bg-white rounded-lg shadow-card overflow-hidden">
            <TablePagination currentPage={safePage} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </div>

      <AdminEditTravellerModal
        key={editTarget?.key ?? 'none'}
        target={editTarget}
        onClose={() => setEditTarget(null)}
        onSave={handleSaveEdit}
        saving={savingEdit}
      />
    </AdminLayout>
  );
}
