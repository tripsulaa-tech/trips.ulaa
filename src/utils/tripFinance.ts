// =============================================
// Trip Finance — internal cost/profit tracking
// =============================================
// Shared between the Add/Edit Trip "Finances & Profit" tab and the
// read-only Trip Details view. Kept separate from utils-index.ts so the
// public bundle doesn't need to think about this at all — it's purely an
// admin concern.
import type { TripFinance, TripCostItem } from '../types/types-index';

export const emptyTripFinance: TripFinance = {
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
  cost_items: [],
  notes: '',
};

// Ad spend, entry tickets and traveler kits used to be their own inputs; they
// are now ordinary cost lines. This turns any value still stored in the old
// fields into the matching line (ad spend = lump sum, entry ticket / kit =
// per traveler) and clears the old field, so old trips keep their exact
// totals and re-saving a trip migrates it. Safe to call repeatedly — once the
// old fields are empty it returns the record unchanged.
export function foldLegacyCosts(finance: TripFinance): TripFinance {
  const ad = finance.ad_spend || 0;
  const entry = finance.entry_ticket_cost_per_person || 0;
  const kit = finance.kit_cost_per_person || 0;
  if (!ad && !entry && !kit) {
    if (finance.ad_spend == null && finance.entry_ticket_cost_per_person == null && finance.kit_cost_per_person == null) return finance;
    return { ...finance, ad_spend: null, entry_ticket_cost_per_person: null, kit_cost_per_person: null };
  }
  const legacy: TripCostItem[] = [];
  if (ad) legacy.push({ id: 'legacy_ad_spend', name: 'Ad / Promotion Spend', basis: 'fixed', rate: ad, quantity: null });
  if (entry) legacy.push({ id: 'legacy_entry_ticket', name: 'Entry Ticket', basis: 'per_traveler', rate: entry, quantity: null });
  if (kit) legacy.push({ id: 'legacy_kit', name: 'Traveler Kit', basis: 'per_traveler', rate: kit, quantity: null });
  return {
    ...finance,
    ad_spend: null,
    entry_ticket_cost_per_person: null,
    kit_cost_per_person: null,
    cost_items: [...legacy, ...(finance.cost_items || [])],
  };
}

// One resolved cost line: how many units it applies to and what it comes to.
export interface ResolvedCostItem {
  id: string;
  name: string;
  basis: TripCostItem['basis'];
  rate: number;
  qty: number;      // 1 for fixed, traveler count for per_traveler, headcount for per_selected
  amount: number;   // rate x qty
}

// The single place that decides "rate x how many". Used by the summary
// below AND by the editor rows, so what admins see per line always equals
// what gets added to the total.
// `optionCounts` maps option id -> how many booked travelers picked it. A
// 'per_selected' line linked to an option (option_id) uses that real count;
// an unlinked one falls back to its hand-typed `quantity`.
export function resolveCostItem(
  item: TripCostItem,
  travelerCount: number,
  optionCounts: Record<string, number> = {},
): ResolvedCostItem {
  const rate = Math.max(0, item.rate || 0);
  const qty = item.basis === 'fixed'
    ? 1
    : item.basis === 'per_traveler'
      ? Math.max(0, travelerCount || 0)
      : item.option_id && item.option_id in optionCounts
        ? Math.max(0, optionCounts[item.option_id] || 0)
        : item.option_id
          ? 0
          : Math.max(0, item.quantity || 0);
  return { id: item.id, name: item.name, basis: item.basis, rate, qty, amount: rate * qty };
}

interface TripFinanceSummary {
  travelerCount: number;
  revenuePerPerson: number;
  totalRevenue: number;
  agencyCost: number;             // resolved fixed-vs-per-traveler
  childFareCount: number;         // number of booked travelers with a Child Fare add-on
  childFareVendorCost: number;    // child_fare_vendor_amount x childFareCount
  childFareEntryTicketCost: number; // child_fare_entry_ticket_cost x childFareCount
  childFareKitCost: number;       // child_fare_kit_cost x childFareCount
  childFareCosts: number;         // childFareVendorCost + childFareEntryTicketCost + childFareKitCost
  costItems: ResolvedCostItem[];  // each generic cost line, resolved (rate x qty)
  costItemsTotal: number;         // sum of costItems
  ulaaCosts: number;              // agencyCost + childFareCosts + costItemsTotal (ads, entry tickets, kits... are cost lines)
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
  optionCounts: Record<string, number> = {},
): TripFinanceSummary {
  const f = foldLegacyCosts(finance || emptyTripFinance);
  const travelers = Math.max(0, travelerCount || 0);
  const revenue = Math.max(0, totalRevenue || 0);
  const childFares = Math.max(0, childFareCount || 0);

  const agencyCost = f.agency_amount_type === 'per_traveler'
    ? (f.agency_amount || 0) * travelers
    : (f.agency_amount || 0);
  const childFareVendorCost = (f.child_fare_vendor_amount || 0) * childFares;
  const childFareEntryTicketCost = (f.child_fare_entry_ticket_cost || 0) * childFares;
  const childFareKitCost = (f.child_fare_kit_cost || 0) * childFares;
  const childFareCosts = childFareVendorCost + childFareEntryTicketCost + childFareKitCost;
  const costItems = (f.cost_items || []).map(item => resolveCostItem(item, travelers, optionCounts));
  const costItemsTotal = costItems.reduce((sum, c) => sum + c.amount, 0);
  const ulaaCosts = agencyCost + childFareCosts + costItemsTotal;
  const organiserCosts = (f.organiser_travel_cost || 0) + (f.organiser_agency_payment || 0) + (f.organiser_misc_expense || 0) + (f.organiser_own_entry_ticket || 0);
  const totalCosts = ulaaCosts + organiserCosts;
  const netProfit = revenue - totalCosts;

  return {
    travelerCount: travelers,
    revenuePerPerson: travelers > 0 ? revenue / travelers : 0,
    totalRevenue: revenue,
    agencyCost,
    childFareCount: childFares,
    childFareVendorCost,
    childFareEntryTicketCost,
    childFareKitCost,
    childFareCosts,
    costItems,
    costItemsTotal,
    ulaaCosts,
    organiserCosts,
    totalCosts,
    netProfit,
    profitPerPerson: travelers > 0 ? netProfit / travelers : 0,
  };
}
