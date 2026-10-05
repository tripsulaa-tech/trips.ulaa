import { formatPrice } from '../../utils/utils-index';
import type { computeTripFinanceSummary } from '../../utils/tripFinance';
import type { TripFinance } from '../../types/types-index';

interface TripFinanceBreakdownProps {
  finance: TripFinance;
  summary: ReturnType<typeof computeTripFinanceSummary>;
  // True when revenue is an estimate (seats booked x listed price) rather
  // than the sum of real bookings.
  estimated?: boolean;
}

/** The read-only "Finances & Profit" lines (revenue, Ulaa's costs, organiser
 *  costs, net profit). Shared by the Trip Details modal and the Trip Finance
 *  tab so the two can never drift apart. Renders rows only — the caller
 *  provides the surrounding box. */
export default function TripFinanceBreakdown({ finance, summary: s, estimated = false }: TripFinanceBreakdownProps) {
  return (
    <>
      <div className="flex justify-between"><span className="text-dark-muted">Total Revenue ({s.travelerCount} booked{estimated ? ', est.' : ''})</span><span className="text-dark font-medium">{formatPrice(s.totalRevenue)}</span></div>
      <div className="flex justify-between"><span className="text-dark-muted">Ulaa's Total Costs</span><span className="text-dark">{formatPrice(s.ulaaCosts)}</span></div>
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
      <div className="flex justify-between"><span className="text-dark-muted">Trip Organiser's Expenses</span><span className="text-dark">{formatPrice(s.organiserCosts)}</span></div>
      {s.organiserItems.map(c => (
        <div key={c.id} className="flex justify-between pl-4 text-xs"><span className="text-dark-muted">{c.name || 'Unnamed expense'}</span><span className="text-dark-muted">{formatPrice(c.amount)}</span></div>
      ))}
      <div className="flex justify-between border-t border-background-warm pt-1.5 text-base"><span className="font-semibold text-dark">Net Profit</span><span className={`font-bold ${s.netProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatPrice(s.netProfit)}</span></div>
      {finance.agency_name && (
        <p className="text-xs text-dark-muted pt-1">Agency: {finance.agency_name}</p>
      )}
      {finance.organiser_name && (
        <p className="text-xs text-dark-muted">Trip Organiser: {finance.organiser_name}</p>
      )}
      {finance.notes && (
        <p className="text-xs text-dark-muted pt-1 whitespace-pre-wrap">{finance.notes}</p>
      )}
    </>
  );
}
