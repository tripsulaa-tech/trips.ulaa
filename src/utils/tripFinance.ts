// =============================================
// Trip Finance — internal cost/profit tracking
// =============================================
// Shared between the Add/Edit Trip "Finances & Profit" tab and the
// read-only Trip Details view. Kept separate from utils-index.ts so the
// public bundle doesn't need to think about this at all — it's purely an
// admin concern.
import type { TripFinance } from '../types/types-index';

export const emptyTripFinance: TripFinance = {
  ad_spend: null,
  entry_ticket_cost_per_person: null,
  kit_cost_per_person: null,
  agency_name: '',
  agency_amount_type: 'fixed',
  agency_amount: null,
  child_fare_amount: null,
  child_fare_vendor_amount: null,
  child_fare_entry_ticket_cost: null,
  child_fare_kit_cost: null,
  organiser_name: '',
  organiser_travel_cost: null,
  organiser_agency_payment: null,
  organiser_misc_expense: null,
  organiser_own_entry_ticket: null,
  notes: '',
};

export interface TripFinanceSummary {
  travelerCount: number;
  revenuePerPerson: number;
  totalRevenue: number;
  entryTicketCosts: number;       // entry ticket cost per person x travelers
  kitCosts: number;               // kit cost per person x travelers
  perTravelerCosts: number;       // entryTicketCosts + kitCosts
  agencyCost: number;             // resolved fixed-vs-per-traveler
  childFareCount: number;         // number of booked travelers with a Child Fare add-on
  childFareVendorCost: number;    // child_fare_vendor_amount x childFareCount
  childFareEntryTicketCost: number; // child_fare_entry_ticket_cost x childFareCount
  childFareKitCost: number;       // child_fare_kit_cost x childFareCount
  childFareCosts: number;         // childFareVendorCost + childFareEntryTicketCost + childFareKitCost
  ulaaCosts: number;              // ad spend + perTravelerCosts + agencyCost + childFareCosts
  organiserCosts: number;         // organiser travel + organiser agency payment + misc + organiser's own entry ticket
  totalCosts: number;             // ulaaCosts + organiserCosts
  netProfit: number;              // totalRevenue - totalCosts
  profitPerPerson: number;        // netProfit / travelerCount (0 if no travelers)
}

// Rolls a TripFinance record up into a profit summary. `travelerCount`
// should be the confirmed/booked count, not total_seats, since ad spend
// etc. is already fixed regardless of fill rate but per-traveler costs
// only apply to people who actually booked.
//
// `totalRevenue` is the actual money the trip is worth — the caller
// decides how to arrive at it. Callers with real booking data (Reports,
// enquiry CSV exports) should sum each booked enquiry's real total_amount,
// since real bookings routinely differ from the trip's listed price
// (early-bird pricing, group/manual discounts, one-off deals) — travelers
// x price silently overstates or understates revenue the moment any
// booking didn't come in at the plain regular price. Callers with no
// per-enquiry data to sum (the Add/Edit Trip form's live preview, and the
// read-only Trip Details view) fall back to travelers x price as their
// best available estimate.
//
// `travelerCount` is the number of booked ROWS (i.e. adult travelers) —
// each one already carries their own entry-ticket/kit/agency cost below.
// `childFareCount` is a separate, smaller count of how many of those rows
// also have a Child Fare add-on (see enquiries.has_child_addon) — a child
// riding along with an adult traveler, priced and costed on its own
// dedicated rate rather than the adult per-traveler rate. Callers with no
// per-enquiry data to count from (the form's live preview when nothing's
// booked yet, and the estimate fallback) should pass 0 — there's nothing
// real to count.
export function computeTripFinanceSummary(
  finance: TripFinance | null | undefined,
  travelerCount: number,
  totalRevenue: number,
  childFareCount: number = 0,
): TripFinanceSummary {
  const f = finance || emptyTripFinance;
  const travelers = Math.max(0, travelerCount || 0);
  const revenue = Math.max(0, totalRevenue || 0);
  const childFares = Math.max(0, childFareCount || 0);

  const entryTicketCosts = (f.entry_ticket_cost_per_person || 0) * travelers;
  const kitCosts = (f.kit_cost_per_person || 0) * travelers;
  const perTravelerCosts = entryTicketCosts + kitCosts;
  const agencyCost = f.agency_amount_type === 'per_traveler'
    ? (f.agency_amount || 0) * travelers
    : (f.agency_amount || 0);
  const childFareVendorCost = (f.child_fare_vendor_amount || 0) * childFares;
  const childFareEntryTicketCost = (f.child_fare_entry_ticket_cost || 0) * childFares;
  const childFareKitCost = (f.child_fare_kit_cost || 0) * childFares;
  const childFareCosts = childFareVendorCost + childFareEntryTicketCost + childFareKitCost;
  const ulaaCosts = (f.ad_spend || 0) + perTravelerCosts + agencyCost + childFareCosts;
  const organiserCosts = (f.organiser_travel_cost || 0) + (f.organiser_agency_payment || 0) + (f.organiser_misc_expense || 0) + (f.organiser_own_entry_ticket || 0);
  const totalCosts = ulaaCosts + organiserCosts;
  const netProfit = revenue - totalCosts;

  return {
    travelerCount: travelers,
    revenuePerPerson: travelers > 0 ? revenue / travelers : 0,
    totalRevenue: revenue,
    entryTicketCosts,
    kitCosts,
    perTravelerCosts,
    agencyCost,
    childFareCount: childFares,
    childFareVendorCost,
    childFareEntryTicketCost,
    childFareKitCost,
    childFareCosts,
    ulaaCosts,
    organiserCosts,
    totalCosts,
    netProfit,
    profitPerPerson: travelers > 0 ? netProfit / travelers : 0,
  };
}
