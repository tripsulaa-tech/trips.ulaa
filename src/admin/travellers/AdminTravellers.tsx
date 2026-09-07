import { AddressBook, Repeat, Briefcase, XCircle } from '@phosphor-icons/react';
import AdminLayout from '../AdminLayout';
import { KpiCards, KpiCarousel } from '../../components/ui/KpiCards';
import { TableHeaderBar, TablePagination } from '../../components/ui/DataTableChrome';
import { paginate } from '../../components/ui/dataTableUtils';
import { useTravellers, TRAVELLERS_PAGE_SIZE } from './useTravellers';
import AdminTravellerCard from './AdminTravellerCard';

/** Travellers Contact Book — one card per traveller (grouped across every
 *  trip they've booked, however many separate enquiry rows that came
 *  from), so an admin can look someone up by name/phone/trip without
 *  digging through the trip-by-trip Enquiries list. See
 *  ./travellerContacts.ts for how rows get collapsed into one contact, and
 *  ./useTravellers.ts for the data/search/filter/pagination state this
 *  page renders. */
export default function AdminTravellers() {
  const {
    loading,
    contacts,
    totalCount,
    searchQuery, setSearchQuery,
    repeatOnly, setRepeatOnly,
    page, setPage,
    kpis,
  } = useTravellers();

  const { pageItems, totalPages, safePage, rangeStart, rangeEnd } = paginate(contacts, page, TRAVELLERS_PAGE_SIZE);

  const KPI_CARDS = [
    { label: 'Travellers', value: kpis.total, sub: 'Everyone who has ever paid or booked', icon: AddressBook },
    { label: 'Repeat Travellers', value: kpis.repeat, sub: '2+ trips booked', icon: Repeat },
    { label: 'Trips Booked', value: kpis.tripsBooked, sub: 'Across every traveller', icon: Briefcase },
    { label: 'Cancelled Bookings', value: kpis.cancelledTrips, sub: 'Trips that fell through', icon: XCircle },
  ] as const;

  return (
    <AdminLayout title="Travellers" subtitle="Every traveller who's ever paid or booked with you — contact details and full trip history, in one place.">
      <div className="space-y-4 sm:space-y-6">
        <KpiCards cards={KPI_CARDS} columns={4} />
        <KpiCarousel cards={KPI_CARDS} />

        <div className="bg-white rounded-lg shadow-card overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 sm:px-5 pt-4 sm:pt-5">
            <TableHeaderBar
              title="Contact Book"
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              total={contacts.length}
              itemLabel="travellers"
              searchValue={searchQuery}
              onSearchChange={setSearchQuery}
              searchPlaceholder="Search name, phone, email, trip..."
            />
          </div>
          <div className="px-4 sm:px-5 pb-4 flex items-center gap-2">
            <button
              onClick={() => setRepeatOnly(v => !v)}
              aria-pressed={repeatOnly}
              className={`inline-flex items-center gap-1.5 text-xs font-button font-semibold px-3 py-1.5 rounded-full border-2 transition-colors ${
                repeatOnly
                  ? 'bg-primary border-primary text-white'
                  : 'border-background-warm text-dark-muted hover:border-primary/30'
              }`}
            >
              <Repeat size={12} aria-hidden="true" /> Repeat travellers only
            </button>
          </div>

          {loading ? (
            <p className="text-dark-muted text-sm px-4 sm:px-5 pb-6">Loading travellers&hellip;</p>
          ) : pageItems.length === 0 ? (
            <p className="text-dark-muted text-sm px-4 sm:px-5 pb-6">
              {totalCount === 0
                ? "No travellers yet — once someone's booking has a payment against it, they'll show up here."
                : 'No travellers match your search.'}
            </p>
          ) : (
            <div>
              {pageItems.map(contact => (
                <AdminTravellerCard key={contact.key} contact={contact} />
              ))}
            </div>
          )}

          <TablePagination currentPage={safePage} totalPages={totalPages} onPageChange={setPage} />
        </div>
      </div>
    </AdminLayout>
  );
}
