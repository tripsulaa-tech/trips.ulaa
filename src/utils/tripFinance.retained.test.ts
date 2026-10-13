import { describe, it, expect } from 'vitest';
import { computeTripFinanceSummary, retainedFromCancellations, emptyTripFinance } from './tripFinance';

describe('retainedFromCancellations', () => {
  it('keeps paid-minus-refund of cancelled rows only (Attapadi case)', () => {
    const rows = [
      { cancelled_at: null, amount_paid: 3000, refund_amount: 0 },                       // active -> ignored
      { cancelled_at: '2026-06-20', amount_paid: 1750, refund_amount: 0 },               // no-show, kept
      { cancelled_at: '2026-06-04', amount_paid: 1500, refund_amount: 1500 },            // fully refunded
      { cancelled_at: '2026-06-04', amount_paid: 1000, refund_amount: 1500 },            // never negative
      { cancelled_at: '2026-06-04', amount_paid: 500, refund_amount: 0, deleted_at: 'x' }, // deleted -> ignored
    ];
    expect(retainedFromCancellations(rows)).toBe(1750);
  });
});

describe('computeTripFinanceSummary with retained money', () => {
  it('adds retained to net profit and grossRevenue, not to per-traveller revenue', () => {
    const s = computeTripFinanceSummary(emptyTripFinance, 13, 39000, 0, {}, 1750);
    expect(s.totalRevenue).toBe(39000);
    expect(s.retainedRevenue).toBe(1750);
    expect(s.grossRevenue).toBe(40750);
    expect(s.netProfit).toBe(40750 - s.totalCosts);
    expect(s.revenuePerPerson).toBe(3000);
  });
  it('defaults to 0 so old callers are unchanged', () => {
    const s = computeTripFinanceSummary(emptyTripFinance, 13, 39000);
    expect(s.retainedRevenue).toBe(0);
    expect(s.netProfit).toBe(39000 - s.totalCosts);
  });
});
