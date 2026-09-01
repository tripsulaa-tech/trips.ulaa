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
// should be the confirmed/booked seat count (seats_booked), not
// total_seats, since ad spend etc. is already fixed regardless of fill
// rate but per-traveler costs and revenue only apply to people who
// actually booked. `revenuePerPerson` is the price actually charged
// (usually the regular price — pass the early-bird price instead if that's
// what most bookings came in under).
export function computeTripFinanceSummary(
  finance: TripFinance | null | undefined,
  travelerCount: number,
  revenuePerPerson: number,
): TripFinanceSummary {
  const f = finance || emptyTripFinance;
  const travelers = Math.max(0, travelerCount || 0);
  const price = Math.max(0, revenuePerPerson || 0);

  const totalRevenue = price * travelers;
  const perTravelerCosts = ((f.entry_ticket_cost_per_person || 0) + (f.kit_cost_per_person || 0)) * travelers;
  const agencyCost = f.agency_amount_type === 'per_traveler'
    ? (f.agency_amount || 0) * travelers
    : (f.agency_amount || 0);
  const ulaaCosts = (f.ad_spend || 0) + perTravelerCosts + agencyCost;
  const organiserCosts = (f.organiser_travel_cost || 0) + (f.organiser_agency_payment || 0) + (f.organiser_misc_expense || 0);
  const totalCosts = ulaaCosts + organiserCosts;
  const netProfit = totalRevenue - totalCosts;

  return {
    travelerCount: travelers,
    revenuePerPerson: price,
    totalRevenue,
    perTravelerCosts,
    agencyCost,
    ulaaCosts,
    organiserCosts,
    totalCosts,
    netProfit,
    profitPerPerson: travelers > 0 ? netProfit / travelers : 0,
  };
}
