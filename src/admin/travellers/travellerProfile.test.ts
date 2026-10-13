import { describe, expect, it } from 'vitest';
import type { Enquiry, WaitlistEntry } from '../../types/types-index';
import { buildTravellerContacts } from './travellerContacts';
import { buildTravellerProfile, matchWaitlistEntries } from './travellerProfile';

let n = 0;
function enquiry(over: Partial<Enquiry>): Enquiry {
  n += 1;
  return {
    id: `e${n}`,
    full_name: 'Maanusha K',
    phone: '9894457161',
    email: 'm@example.com',
    status: 'new',
    source: 'website',
    is_paid: false,
    package_type: 'normal',
    discount_amount: 0,
    amount_paid: 0,
    refund_amount: 0,
    booking_amount: 0,
    is_no_show: false,
    group_seq: 1,
    journey_stage: 'new_enquiry',
    created_at: `2026-08-${String(10 + n).padStart(2, '0')}T10:00:00Z`,
    updated_at: '2026-08-30T10:00:00Z',
    ...over,
  } as Enquiry;
}

function profileFor(rows: Enquiry[]) {
  const [contact] = buildTravellerContacts(rows);
  return { contact, profile: buildTravellerProfile(contact) };
}

describe('buildTravellerProfile', () => {
  it('sums paid and balance across joined trips only', () => {
    const { profile } = profileFor([
      enquiry({ trip_id: 't1', trip_title: 'Sri Lanka', total_amount: 30000, amount_paid: 30000, booking_id: 'B1', source: 'whatsapp' }),
      enquiry({ trip_id: 't2', trip_title: 'Varkala', total_amount: 10000, amount_paid: 4000, booking_id: 'B2' }),
    ]);
    expect(profile.isRepeat).toBe(true);
    expect(profile.summary.tripsJoined).toBe(2);
    expect(profile.summary.totalPaid).toBe(34000);
    expect(profile.summary.balanceDue).toBe(6000);
    expect(profile.firstSource).toBe('whatsapp');
  });

  it('keeps cancelled and never-converted trips out of the money totals', () => {
    const { profile } = profileFor([
      enquiry({ trip_id: 't1', trip_title: 'Sri Lanka', total_amount: 30000, amount_paid: 30000, booking_id: 'B1' }),
      enquiry({ trip_id: 't2', trip_title: 'Goa', total_amount: 8000, amount_paid: 2000, booking_id: 'B2', cancelled_at: '2026-09-01T00:00:00Z', refund_amount: 1500 }),
      enquiry({ trip_id: 't3', trip_title: 'Varkala', journey_stage: 'not_interested' }),
    ]);
    expect(profile.isRepeat).toBe(false);
    expect(profile.summary).toMatchObject({ tripsJoined: 1, totalPaid: 30000, balanceDue: 0, cancelled: 1, notConverted: 1 });
    const goa = profile.trips.find(t => t.title === 'Goa');
    expect(goa).toMatchObject({ outcome: 'cancelled', paid: 2000, refunded: 1500 });
  });

  it('treats a group booking as one trip with N seats and never a negative balance', () => {
    const { profile } = profileFor([
      enquiry({ trip_id: 't1', trip_title: 'Coorg', total_amount: 5000, amount_paid: 6000, booking_id: 'B1', group_id: 'g', group_size: 2 }),
      enquiry({ trip_id: 't1', trip_title: 'Coorg', total_amount: 5000, amount_paid: 4000, booking_id: 'B1', group_id: 'g', group_size: 2, group_seq: 2 }),
    ]);
    expect(profile.trips).toHaveLength(1);
    expect(profile.trips[0].seats).toBe(2);
    expect(profile.trips[0].balance).toBe(0);
  });

  it('takes age from the most recent enquiry that has one', () => {
    const { profile } = profileFor([
      enquiry({ trip_id: 't1', trip_title: 'A', age: 24 }),
      enquiry({ trip_id: 't2', trip_title: 'B', age: 25 }),
      enquiry({ trip_id: 't3', trip_title: 'C' }),
    ]);
    expect(profile.age).toBe(25);
  });
});

describe('matchWaitlistEntries', () => {
  const wl = (over: Partial<WaitlistEntry>): WaitlistEntry => ({
    id: `w${++n}`, trip_id: 't9', trip_title: 'Meghalaya', full_name: 'Maanusha K', phone: '+91 98944 57161',
    email: '', status: 'waiting', created_at: '2026-09-01T00:00:00Z', ...over,
  } as WaitlistEntry);

  it('matches by phone signature and flags a different name', () => {
    const { contact } = profileFor([enquiry({ trip_id: 't1', trip_title: 'A' })]);
    const result = matchWaitlistEntries(contact, [
      wl({ id: 'same' }),
      wl({ id: 'other-name', full_name: 'Parent Of Maanusha' }),
      wl({ id: 'someone-else', phone: '9000000000' }),
    ]);
    expect(result.map(r => r.entry.id).sort()).toEqual(['other-name', 'same']);
    expect(result.find(r => r.entry.id === 'other-name')?.asName).toBe('Parent Of Maanusha');
    expect(result.find(r => r.entry.id === 'same')?.asName).toBeUndefined();
  });
});
