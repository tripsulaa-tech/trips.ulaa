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
  organiser_name: '',
  organiser_travel_cost: null,
  organiser_agency_payment: null,
  organiser_misc_expense: null,
  notes: '',
};

export interface TripFinanceSummary {
  travelerCount: number;
  revenuePerPerson: number;
  totalRevenue: number;
  perTravelerCosts: number;       // (entry ticket + kit) x travelers
  agencyCost: number;             // resolved fixed-vs-per-traveler
  ulaaCosts: number;              // ad spend + perTravelerCosts + agencyCost
  organiserCosts: number;         // organiser travel + organiser agency payment + misc
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
export function computeTripFinanceSummary(
  finance: TripFinance | null | undefined,
  travelerCount: number,
  totalRevenue: number,
): TripFinanceSummary {
  const f = finance || emptyTripFinance;
  const travelers = Math.max(0, travelerCount || 0);
  const revenue = Math.max(0, totalRevenue || 0);

  const perTravelerCosts = ((f.entry_ticket_cost_per_person || 0) + (f.kit_cost_per_person || 0)) * travelers;
  const agencyCost = f.agency_amount_type === 'per_traveler'
    ? (f.agency_amount || 0) * travelers
    : (f.agency_amount || 0);
  const ulaaCosts = (f.ad_spend || 0) + perTravelerCosts + agencyCost;
  const organiserCosts = (f.organiser_travel_cost || 0) + (f.organiser_agency_payment || 0) + (f.organiser_misc_expense || 0);
  const totalCosts = ulaaCosts + organiserCosts;
  const netProfit = revenue - totalCosts;

  return {
    travelerCount: travelers,
    revenuePerPerson: travelers > 0 ? revenue / travelers : 0,
    totalRevenue: revenue,
    perTravelerCosts,
    agencyCost,
    ulaaCosts,
    organiserCosts,
    totalCosts,
    netProfit,
    profitPerPerson: travelers > 0 ? netProfit / travelers : 0,
  };
}
