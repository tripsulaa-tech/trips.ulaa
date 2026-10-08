import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  User,
  Phone,
  PhoneCall,
  Envelope,
  MapPin,
  CalendarBlank,
  Users,
  Receipt,
  SignOut,
  WarningCircle as AlertCircle,
} from '@phosphor-icons/react';
import Layout from '../components/layout/Layout';
import Button from '../components/ui/Button';
import AuthModal from '../components/ui/AuthModal';
import { WhatsAppIcon } from '../components/icons/WhatsAppIcon';
import { useAuth } from '../context/useAuth';
import { useToast } from '../components/ui/useToast';
import { usePageMeta } from '../hooks/usePageMeta';
import { pageTitle, WHATSAPP_NUMBER } from '../constants/site';
import { formatDate, formatDateRange, formatPrice, getWhatsAppLink } from '../utils/utils-index';
import {
  fetchMyAccount,
  groupTrips,
  PAYMENT_TYPE_LABELS,
  type AccountData,
  type AccountPayment,
  type AccountTrip,
  type StageInfo,
} from '../services/accountApi';

const TONE_CLASSES: Record<StageInfo['tone'], string> = {
  neutral: 'bg-background-warm text-dark-muted',
  info: 'bg-blue-50 text-blue-700',
  success: 'bg-green-50 text-green-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-600',
};

function StatusBadge({ stage }: { stage: StageInfo }) {
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${TONE_CLASSES[stage.tone]}`}>
      {stage.label}
    </span>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-background-warm last:border-0">
      <span className="mt-0.5 text-primary shrink-0" aria-hidden="true">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-dark-muted">{label}</p>
        <p className="font-body text-dark break-words">{value || '—'}</p>
      </div>
    </div>
  );
}

function TripCard({ trip }: { trip: AccountTrip }) {
  const pct = trip.totalAmount > 0 ? Math.min(100, Math.round((trip.amountPaid / trip.totalAmount) * 100)) : 0;
  const balance = Math.max(0, trip.totalAmount - trip.amountPaid);
  const dates = trip.departureDate
    ? trip.endDate ? formatDateRange(trip.departureDate, trip.endDate) : formatDate(trip.departureDate, { month: 'short' })
    : null;

  return (
    <article className="bg-white rounded-xl shadow-card overflow-hidden flex flex-col sm:flex-row">
      {trip.coverImage ? (
        <img
          src={trip.coverImage}
          alt=""
          loading="lazy"
          className="h-40 w-full sm:h-auto sm:w-44 object-cover shrink-0"
        />
      ) : (
        <div className="h-24 w-full sm:h-auto sm:w-44 bg-background-warm shrink-0" aria-hidden="true" />
      )}
      <div className="p-5 flex-1 min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-display text-xl font-bold text-dark">{trip.tripTitle}</h3>
            {trip.destination && <p className="text-sm text-dark-muted">{trip.destination}</p>}
          </div>
          <StatusBadge stage={trip.stage} />
        </div>

        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-dark-muted">
          {dates && (
            <span className="inline-flex items-center gap-1.5"><CalendarBlank size={16} aria-hidden="true" />{dates}</span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <Users size={16} aria-hidden="true" />{trip.seats} {trip.seats === 1 ? 'traveller' : 'travellers'}
          </span>
          {trip.packageType === 'early_bird' && <span className="font-semibold text-primary">Early bird</span>}
          {trip.bookingId && <span>Booking ID: <span className="font-semibold text-dark">{trip.bookingId}</span></span>}
        </div>

        {trip.isBooked && trip.totalAmount > 0 && !trip.cancelled && (
          <div className="mt-4">
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-dark-muted">Paid {formatPrice(trip.amountPaid)} of {formatPrice(trip.totalAmount)}</span>
              <span className={balance > 0 ? 'font-semibold text-amber-700' : 'font-semibold text-green-700'}>
                {balance > 0 ? `${formatPrice(balance)} due` : 'Fully paid'}
              </span>
            </div>
            <div className="h-2 rounded-full bg-background-warm overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Payment progress">
              <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
            </div>
            {balance > 0 && trip.balanceDueDate && (
              <p className="text-xs text-dark-muted mt-1.5">Balance due by {formatDate(trip.balanceDueDate)}</p>
            )}
          </div>
        )}

        {trip.cancelled && trip.refundAmount > 0 && (
          <p className="mt-3 text-sm text-dark-muted">Refunded: <span className="font-semibold text-dark">{formatPrice(trip.refundAmount)}</span></p>
        )}

        {trip.tripSlug && !trip.isPast && (
          <div className="mt-4">
            <Link to={`/trips/${trip.tripSlug}`} className="text-sm font-semibold text-primary hover:underline">View trip details</Link>
          </div>
        )}
      </div>
    </article>
  );
}

function PaymentsTable({ payments, tripByEnquiry }: { payments: AccountPayment[]; tripByEnquiry: Map<string, string> }) {
  return (
    <div className="bg-white rounded-xl shadow-card overflow-hidden">
      <ul className="divide-y divide-background-warm">
        {payments.map(p => {
          const isRefund = p.payment_type === 'refund';
          return (
            <li key={p.id} className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <p className="font-body font-medium text-dark">
                  {PAYMENT_TYPE_LABELS[p.payment_type] ?? 'Payment'}
                  {tripByEnquiry.get(p.enquiry_id) && <span className="text-dark-muted font-normal"> · {tripByEnquiry.get(p.enquiry_id)}</span>}
                </p>
                <p className="text-xs text-dark-muted">
                  {formatDate(p.paid_at, { month: 'short' })}
                  {p.payment_method ? ` · ${p.payment_method}` : ''}
                  {p.invoice_number ? ` · ${p.invoice_number}` : ''}
                </p>
              </div>
              <p className={`font-semibold shrink-0 ${isRefund ? 'text-green-700' : 'text-dark'}`}>
                {isRefund ? '+ ' : ''}{formatPrice(p.amount)}
                {isRefund && <span className="block text-xs font-normal text-right text-dark-muted">refund</span>}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SectionHeading({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <h2 className="font-display text-2xl font-bold text-dark mb-4">
      {children}{count !== undefined && <span className="ml-2 text-base font-body font-medium text-dark-muted">({count})</span>}
    </h2>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="h-24 rounded-xl bg-white/70 animate-pulse" />
      <div className="h-56 rounded-xl bg-white/70 animate-pulse" />
      <div className="h-40 rounded-xl bg-white/70 animate-pulse" />
    </div>
  );
}

export default function AccountPage() {
  usePageMeta({
    title: pageTitle('My Account'),
    description: 'Your Ulaa traveller details, trips and payments.',
    path: '/account',
  });

  const { user, loading: authLoading, signOut } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);

  const userId = user?.id;
  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      setData(await fetchMyAccount());
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetching on sign-in is the point of this effect; load() sets loading state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (userId) void load();
    else setData(null);
  }, [userId, load]);

  const trips = useMemo(() => (data ? groupTrips(data.bookings) : []), [data]);
  const activeTrips = trips.filter(t => !t.isPast);
  const pastTrips = trips.filter(t => t.isPast);
  const tripByEnquiry = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of trips) for (const id of t.enquiryIds) m.set(id, t.tripTitle);
    return m;
  }, [trips]);
  const joined = trips.filter(t => t.isBooked && !t.cancelled);
  const totalPaid = trips.reduce((s, t) => s + t.amountPaid - t.refundAmount, 0);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch {
      toast.error('Could not sign you out. Please try again.');
    }
  };

  const profile = data?.profile ?? null;
  const displayName = profile?.full_name || user?.email || '';

  return (
    <Layout hideFooter>
      <section className="bg-background px-4 sm:px-6 lg:px-8 pt-28 pb-12 min-h-[80vh]">
        <div className="max-w-4xl mx-auto">
          {authLoading ? (
            <Skeleton />
          ) : !user ? (
            <div className="bg-white rounded-xl shadow-card p-8 text-center max-w-md mx-auto mt-6">
              <h1 className="font-display text-3xl font-bold text-dark">My Account</h1>
              <p className="text-dark-muted text-sm mt-2 mb-6">Sign in to see your details, trips and payments.</p>
              <Button variant="primary" size="lg" fullWidth onClick={() => setSignInOpen(true)}>Sign in</Button>
              <AuthModal isOpen={signInOpen} onClose={() => setSignInOpen(false)} />
            </div>
          ) : (
            <>
              {/* Header: who's signed in */}
              <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
                <div className="flex items-center gap-4 min-w-0">
                  <span className="h-14 w-14 rounded-full bg-primary text-white flex items-center justify-center font-display text-2xl font-bold shrink-0" aria-hidden="true">
                    {(displayName || '?').charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <h1 className="font-display text-2xl sm:text-3xl font-bold text-dark break-words">
                      {profile ? `Hi, ${profile.full_name.split(' ')[0]}` : 'My Account'}
                    </h1>
                    <p className="text-sm text-dark-muted break-all">{user.email}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={handleSignOut}>
                  <SignOut size={16} aria-hidden="true" />Sign out
                </Button>
              </div>

              {loading && !data ? (
                <Skeleton />
              ) : failed ? (
                <div role="alert" className="bg-white rounded-xl shadow-card p-8 text-center">
                  <AlertCircle size={28} className="mx-auto text-red-600 mb-2" aria-hidden="true" />
                  <p className="text-dark mb-4">We couldn't load your account details.</p>
                  <Button variant="primary" size="md" onClick={() => void load()}>Try again</Button>
                </div>
              ) : data && !profile ? (
                <div className="bg-white rounded-xl shadow-card p-8 text-center">
                  <h2 className="font-display text-2xl font-bold text-dark mb-2">No bookings yet</h2>
                  <p className="text-dark-muted text-sm mb-6">We couldn't find an enquiry under {user.email}. Pick a trip and send your first enquiry — it will show up here.</p>
                  <Link to="/trips"><Button variant="primary" size="lg">Browse trips</Button></Link>
                </div>
              ) : data && profile ? (
                <div className="space-y-10">
                  {/* Quick stats */}
                  <div className="grid grid-cols-3 gap-3 sm:gap-4">
                    {[
                      { label: 'Trips booked', value: String(joined.length) },
                      { label: 'Upcoming', value: String(activeTrips.filter(t => t.isBooked).length) },
                      { label: 'Total paid', value: formatPrice(Math.max(0, totalPaid)) },
                    ].map(s => (
                      <div key={s.label} className="bg-white rounded-xl shadow-card px-3 py-4 sm:p-5 text-center">
                        <p className="font-display text-xl sm:text-3xl font-bold text-primary break-words">{s.value}</p>
                        <p className="text-xs sm:text-sm text-dark-muted mt-1">{s.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Traveller details */}
                  <div>
                    <SectionHeading>Traveller details</SectionHeading>
                    <div className="bg-white rounded-xl shadow-card px-5 sm:px-6 sm:grid sm:grid-cols-2 sm:gap-x-10">
                      <DetailRow icon={<User size={20} />} label="Full name" value={profile.full_name} />
                      <DetailRow icon={<CalendarBlank size={20} />} label="Age" value={profile.age != null ? String(profile.age) : null} />
                      <DetailRow icon={<Phone size={20} />} label="Phone" value={profile.phone} />
                      <DetailRow icon={<Envelope size={20} />} label="Email" value={profile.email} />
                      <DetailRow icon={<MapPin size={20} />} label="City" value={profile.city} />
                      <DetailRow icon={<PhoneCall size={20} />} label="Emergency contact" value={profile.emergency_contact} />
                    </div>
                    <p className="text-sm text-dark-muted mt-3">
                      Something not right?{' '}
                      <a
                        href={getWhatsAppLink(WHATSAPP_NUMBER, 'Hi Ulaa! I would like to update my traveller details.')}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                      >
                        <WhatsAppIcon size={16} />Message us to update them
                      </a>
                    </p>
                  </div>

                  {/* Trips */}
                  <div>
                    <SectionHeading count={activeTrips.length}>Your trips</SectionHeading>
                    {activeTrips.length === 0 ? (
                      <div className="bg-white rounded-xl shadow-card p-6 text-center">
                        <p className="text-dark-muted text-sm mb-4">No upcoming trips right now.</p>
                        <Link to="/trips"><Button variant="primary" size="md">Browse trips</Button></Link>
                      </div>
                    ) : (
                      <div className="space-y-4">{activeTrips.map(t => <TripCard key={t.key} trip={t} />)}</div>
                    )}
                  </div>

                  {pastTrips.length > 0 && (
                    <div>
                      <SectionHeading count={pastTrips.length}>Past &amp; closed</SectionHeading>
                      <div className="space-y-4">{pastTrips.map(t => <TripCard key={t.key} trip={t} />)}</div>
                    </div>
                  )}

                  {/* Payments */}
                  {data.payments.length > 0 && (
                    <div>
                      <SectionHeading>
                        <span className="inline-flex items-center gap-2"><Receipt size={24} aria-hidden="true" />Payments</span>
                      </SectionHeading>
                      <PaymentsTable payments={data.payments} tripByEnquiry={tripByEnquiry} />
                    </div>
                  )}
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>
    </Layout>
  );
}
