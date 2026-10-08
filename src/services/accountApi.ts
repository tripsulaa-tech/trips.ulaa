import { supabase } from './supabase';

export interface AccountProfile {
  full_name: string;
  age: number | null;
  phone: string;
  email: string;
  city: string | null;
  emergency_contact: string | null;
}

/** One enquiry row as returned by public.my_account() (a group booking is one row per seat). */
export interface AccountBookingRow {
  id: string;
  booking_id: string | null;
  group_id: string | null;
  group_size: number | null;
  trip_id: string | null;
  trip_title: string | null;
  trip_slug: string | null;
  destination: string | null;
  cover_image: string | null;
  departure_date: string | null;
  end_date: string | null;
  package_type: 'early_bird' | 'normal';
  journey_stage: string;
  booking_state: string;
  total_amount: number | null;
  amount_paid: number;
  refund_amount: number;
  balance_due_date: string | null;
  cancelled_at: string | null;
  checked_in_at: string | null;
  created_at: string;
}

export interface AccountPayment {
  id: string;
  enquiry_id: string;
  amount: number;
  payment_type: 'booking_amount' | 'balance' | 'installment' | 'refund' | 'full_payment' | 'advance' | 'addon';
  payment_method: string | null;
  paid_at: string;
  invoice_number: string | null;
}

export interface AccountData {
  profile: AccountProfile | null;
  bookings: AccountBookingRow[];
  payments: AccountPayment[];
}

export async function fetchMyAccount(): Promise<AccountData> {
  const { data, error } = await supabase.rpc('my_account');
  if (error) throw error;
  const d = (data ?? {}) as Partial<AccountData>;
  return { profile: d.profile ?? null, bookings: d.bookings ?? [], payments: d.payments ?? [] };
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/** A trip as the traveller sees it: group seats collapsed into one entry. */
export interface AccountTrip {
  key: string;
  tripTitle: string;
  tripSlug: string | null;
  destination: string | null;
  coverImage: string | null;
  departureDate: string | null;
  endDate: string | null;
  seats: number;
  packageType: 'early_bird' | 'normal';
  bookingId: string | null;
  stage: StageInfo;
  totalAmount: number;
  amountPaid: number;
  refundAmount: number;
  balanceDueDate: string | null;
  cancelled: boolean;
  /** True once an advance has landed (a real booking, not just an enquiry). */
  isBooked: boolean;
  /** True for trips that are over or no longer active. */
  isPast: boolean;
  enquiryIds: string[];
}

export interface StageInfo {
  label: string;
  tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
}

export function stageInfo(stage: string, cancelled: boolean): StageInfo {
  if (cancelled || stage === 'cancelled') return { label: 'Cancelled', tone: 'danger' };
  switch (stage) {
    case 'new_enquiry':
    case 'contacted':
      return { label: 'Enquiry received', tone: 'neutral' };
    case 'advance_pending':
      return { label: 'Awaiting advance', tone: 'warning' };
    case 'advance_paid':
    case 'confirmed':
      return { label: 'Seat confirmed', tone: 'info' };
    case 'balance_pending':
      return { label: 'Balance due', tone: 'warning' };
    case 'fully_paid':
      return { label: 'Fully paid', tone: 'success' };
    case 'checked_in':
      return { label: 'Checked in', tone: 'success' };
    case 'completed':
      return { label: 'Trip completed', tone: 'success' };
    case 'not_interested':
      return { label: 'Closed', tone: 'neutral' };
    default:
      return { label: 'In progress', tone: 'neutral' };
  }
}

const CLOSED_STAGES = new Set(['completed', 'cancelled', 'not_interested']);

export function groupTrips(rows: AccountBookingRow[], today = new Date()): AccountTrip[] {
  const groups = new Map<string, AccountBookingRow[]>();
  for (const r of rows) {
    const key = r.group_id ?? r.id;
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }

  const todayStr = today.toISOString().slice(0, 10);
  const trips: AccountTrip[] = [];
  for (const [key, list] of groups) {
    const isCancelledRow = (r: AccountBookingRow) => !!r.cancelled_at || r.booking_state === 'cancelled';
    const active = list.filter(r => !isCancelledRow(r));
    const rep = active[0] ?? list[0];
    const cancelled = active.length === 0;
    const counted = cancelled ? list : active;
    const endOrStart = rep.end_date ?? rep.departure_date;
    const tripOver = !!endOrStart && endOrStart < todayStr;
    trips.push({
      key,
      tripTitle: rep.trip_title ?? 'Ulaa trip',
      tripSlug: rep.trip_slug,
      destination: rep.destination,
      coverImage: rep.cover_image,
      departureDate: rep.departure_date,
      endDate: rep.end_date,
      seats: counted.length,
      packageType: rep.package_type,
      bookingId: list.find(r => r.booking_id)?.booking_id ?? null,
      stage: stageInfo(rep.journey_stage, cancelled),
      totalAmount: counted.reduce((s, r) => s + (r.total_amount ?? 0), 0),
      amountPaid: list.reduce((s, r) => s + (r.amount_paid ?? 0), 0),
      refundAmount: list.reduce((s, r) => s + (r.refund_amount ?? 0), 0),
      balanceDueDate: rep.balance_due_date,
      cancelled,
      isBooked: list.some(r => r.amount_paid > 0),
      isPast: cancelled || CLOSED_STAGES.has(rep.journey_stage) || tripOver,
      enquiryIds: list.map(r => r.id),
    });
  }
  return trips;
}

export const PAYMENT_TYPE_LABELS: Record<AccountPayment['payment_type'], string> = {
  booking_amount: 'Booking amount',
  advance: 'Advance',
  installment: 'Installment',
  balance: 'Balance',
  full_payment: 'Full payment',
  addon: 'Add-on',
  refund: 'Refund',
};
