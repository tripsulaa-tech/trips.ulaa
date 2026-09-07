import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Briefcase,
  BookOpen,
  Users,
  TrendUp as TrendingUp,
  CaretRight as ChevronRight,
  PlusCircle,
  FolderPlus,
  ImageSquare as ImagePlus,
  ListChecks,
  TextT as Type,
  ChartBar as BarChart3,
} from '@phosphor-icons/react';
import AdminLayout from './AdminLayout';
import {
  getAllUpcomingTripsAdmin, getAllCompletedTripsAdmin, getEnquiries, getWaitlistEntries,
  syncStartedTripAlbums,
} from '../services/api';
import { formatDate as formatDateBase } from '../utils/utils-index';
import type { UpcomingTrip, Enquiry } from '../types/types-index';
import bannerImg from '../assets/hero.webp';

const STATUS_STYLES: Record<Enquiry['status'], string> = {
  new: 'bg-orange-50 text-primary',
  contacted: 'bg-blue-50 text-blue-600',
  closed: 'bg-green-50 text-green-600',
};

const STATUS_LABELS: Record<Enquiry['status'], string> = {
  new: 'New',
  contacted: 'Contacted',
  closed: 'Closed',
};

// Semantic color vocabulary for the icon badges on stat cards and quick
// actions — a metric or action's color carries meaning (create vs. view,
// or what kind of number it is) instead of every tile defaulting to the
// same primary orange. Mirrors the tone system on the Reports page.
type Tone = 'primary' | 'green' | 'amber' | 'blue';
const TONE_STYLES: Record<Tone, { bg: string; text: string }> = {
  primary: { bg: 'bg-primary/10', text: 'text-primary' },
  green: { bg: 'bg-green-100', text: 'text-green-700' },
  amber: { bg: 'bg-amber-100', text: 'text-amber-700' },
  blue: { bg: 'bg-blue-50', text: 'text-blue-600' },
};

const gridVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};
const tileVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0 },
};

function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-background-warm rounded ${className}`} />;
}

function formatDate(dateStr?: string) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  return formatDateBase(dateStr, { day: 'numeric', month: 'short', year: 'numeric' }, 'en-GB');
}

function formatDateRange(start?: string, end?: string) {
  if (!start) return '—';
  const s = new Date(start);
  if (Number.isNaN(s.getTime())) return '—';
  const e = end ? new Date(end) : null;
  const sameMonth = e && s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  const monthYear = formatDateBase(start, { month: 'short', year: 'numeric' }, 'en-GB');
  if (!e || Number.isNaN(e.getTime())) {
    return formatDate(start);
  }
  if (sameMonth) {
    return `${s.getDate()} - ${e.getDate()} ${monthYear}`;
  }
  return `${formatDate(start)} – ${formatDate(end)}`;
}

function truncateText(text: string, maxLen: number) {
  if (!text) return text;
  return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text;
}

export default function AdminDashboard() {
  const [upcoming, setUpcoming] = useState<UpcomingTrip[]>([]);
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [waitingCount, setWaitingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Best-effort: catch its own errors so a sync failure never blocks the
    // dashboard from loading. Awaited first so any trip that just started
    // is already moved over by the time the lists below are fetched.
    syncStartedTripAlbums().catch(console.error).finally(() => {
      Promise.all([
        getAllUpcomingTripsAdmin(),
        getAllCompletedTripsAdmin(),
        getEnquiries(),
        getWaitlistEntries(),
      ]).then(([upcomingTrips, completed, allEnquiries, waitlistEntries]) => {
        setUpcoming(upcomingTrips);
        setCompletedCount(completed.length);
        setEnquiries(allEnquiries);
        setWaitingCount(waitlistEntries.filter(w => w.status === 'waiting').length);
      }).catch(console.error).finally(() => setLoading(false));
    });
  }, []);

  // Compare against local-midnight timestamps rather than toDateString(),
  // so "today" is computed once from a single reference point (the browser's
  // local calendar day) instead of re-deriving it per-entry via string
  // conversion, which is the safer way to do this comparison correctly
  // across timezones.
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfTomorrow = startOfToday + 24 * 60 * 60 * 1000;
  const newToday = enquiries.filter(e => {
    const t = new Date(e.created_at).getTime();
    return t >= startOfToday && t < startOfTomorrow;
  }).length;

  const statCards: { label: string; value: number; icon: typeof Briefcase; tone: Tone; to: string }[] = [
    { label: 'Upcoming Trips', value: upcoming.length, icon: Briefcase, tone: 'blue', to: '/admin/trips' },
    { label: 'Completed Albums', value: completedCount, icon: BookOpen, tone: 'green', to: '/admin/albums' },
    { label: 'Waiting List', value: waitingCount, icon: ListChecks, tone: 'amber', to: '/admin/waitlist' },
  ];

  const quickActions: { label: string; desc: string; icon: typeof PlusCircle; tone: Tone; to: string }[] = [
    { label: 'Add New Trip', desc: 'Create and publish a new trip', icon: PlusCircle, tone: 'primary', to: '/admin/trips' },
    { label: 'Create Album', desc: 'Add a new completed trip album', icon: FolderPlus, tone: 'primary', to: '/admin/albums' },
    { label: 'Upload Photos', desc: 'Add photos to Instagram Moments', icon: ImagePlus, tone: 'primary', to: '/admin/home' },
    { label: 'View Enquiries', desc: 'Manage booking requests', icon: Users, tone: 'blue', to: '/admin/enquiries' },
    { label: 'View Waitlist', desc: "See who's waiting for a seat", icon: ListChecks, tone: 'blue', to: '/admin/waitlist' },
    { label: 'View Reports', desc: 'Business-wide KPIs and trends', icon: BarChart3, tone: 'blue', to: '/admin/reports' },
    { label: 'Button Naming', desc: 'Rename trip booking CTA buttons', icon: Type, tone: 'primary', to: '/admin/home' },
  ];

  const recentEnquiries = enquiries.slice(0, 5);
  const nextTrips = [...upcoming]
    .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
    .slice(0, 3);

  return (
    <AdminLayout title="Dashboard">
      <div className="space-y-5 sm:space-y-8">
        {/* Welcome banner */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="relative overflow-hidden rounded-lg"
        >
          <img
            src={bannerImg}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-dark/90 via-dark/60 to-dark/20" />
          <div className="relative z-10 p-5 sm:p-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-6">
            <div className="text-white max-w-lg">
              <h2 className="font-display text-lg sm:text-3xl font-bold mb-1.5 sm:mb-2">Unseen . Local . Adventures . Activities</h2>
              <p className="text-white/80 text-xs sm:text-base">Let's create more unforgettable journeys for amazing women.</p>
            </div>
            <div className="text-white/90 sm:text-right max-w-xs hidden sm:block">
              <p className="font-display text-lg italic leading-snug">
                "The world is beautiful, let's explore it together."
              </p>
              <span className="inline-block mt-3 w-10 h-0.5 bg-primary" />
            </div>
          </div>
        </motion.div>

        {/* Stats */}
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-md sm:rounded-lg p-3 sm:p-4 shadow-card space-y-2">
                <SkeletonBlock className="w-8 h-8 sm:w-12 sm:h-12 rounded-md" />
                <SkeletonBlock className="h-6 w-12" />
                <SkeletonBlock className="h-3 w-20" />
              </div>
            ))}
          </div>
        ) : (
        <motion.div
          variants={gridVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5 items-stretch"
        >
          {statCards.map(({ label, value, icon: Icon, tone, to }) => {
            const t = TONE_STYLES[tone];
            return (
              <motion.div key={label} variants={tileVariants} whileHover={{ y: -2 }} transition={{ duration: 0.2 }}>
                <Link
                  to={to}
                  className="bg-white rounded-md sm:rounded-lg p-3 sm:p-4 shadow-card hover:shadow-card-hover transition-shadow flex items-center justify-between gap-2 h-full"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className={`w-8 h-8 sm:w-12 sm:h-12 rounded-md sm:rounded-lg flex items-center justify-center flex-shrink-0 ${t.bg}`}>
                        <Icon size={20} className={`sm:w-7 sm:h-7 ${t.text}`} aria-hidden="true" />
                      </div>
                      <p className="font-display text-xl sm:text-3xl font-bold text-dark" aria-live="polite">
                        {value}
                      </p>
                    </div>
                    <p className="text-dark-muted text-xs sm:text-sm mt-1">{label}</p>
                  </div>
                  <ChevronRight size={18} className="sm:w-6 sm:h-6 text-primary flex-shrink-0" aria-hidden="true" />
                </Link>
              </motion.div>
            );
          })}

          <motion.div variants={tileVariants} whileHover={{ y: -2 }} transition={{ duration: 0.2 }}>
            <Link
              to="/admin/enquiries"
              className="relative bg-white rounded-md sm:rounded-lg p-3 sm:p-4 shadow-card hover:shadow-card-hover transition-shadow flex items-center justify-between gap-2 h-full"
            >
              {newToday > 0 && (
                <span className="absolute top-2.5 right-2.5 sm:top-3.5 sm:right-3.5 w-2 h-2 rounded-full bg-primary animate-pulse" aria-hidden="true" />
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-md sm:rounded-lg flex items-center justify-center flex-shrink-0 bg-primary/10">
                    <TrendingUp size={20} className="sm:w-7 sm:h-7 text-primary" aria-hidden="true" />
                  </div>
                  <p className="font-display text-xl sm:text-3xl font-bold text-dark" aria-live="polite">
                    {newToday}
                  </p>
                </div>
                <p className="text-dark-muted text-xs sm:text-sm mt-1">New Enquiries Today</p>
              </div>
              <ChevronRight size={18} className="sm:w-6 sm:h-6 text-primary flex-shrink-0" aria-hidden="true" />
            </Link>
          </motion.div>
        </motion.div>
        )}

        {/* Quick Actions */}
        <div>
          <h3 className="font-display text-base sm:text-lg font-bold text-dark mb-3 sm:mb-4">Quick Actions</h3>
          <motion.div
            variants={gridVariants}
            initial="hidden"
            animate="show"
            className="grid grid-cols-2 lg:grid-cols-6 gap-3 sm:gap-5"
          >
            {quickActions.map(({ label, desc, icon: Icon, tone, to }) => {
              const t = TONE_STYLES[tone];
              return (
                <motion.div key={label} variants={tileVariants} whileHover={{ y: -2 }} transition={{ duration: 0.2 }}>
                  <Link
                    to={to}
                    className="bg-white rounded-md sm:rounded-lg p-3 sm:p-4 shadow-card hover:shadow-card-hover transition-shadow flex items-center gap-2 sm:gap-3 group h-full"
                  >
                    <div className={`w-8 h-8 sm:w-12 sm:h-12 rounded-md sm:rounded-lg flex items-center justify-center flex-shrink-0 ${t.bg}`}>
                      <Icon size={20} className={`sm:w-7 sm:h-7 ${t.text}`} aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-dark text-xs sm:text-base truncate">{label}</p>
                      <p className="hidden sm:block text-dark-muted text-sm truncate">{desc}</p>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </motion.div>
        </div>

        {/* Recent Enquiries + Upcoming Trips */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-5">
          <div className="bg-white rounded-md sm:rounded-lg p-3 sm:p-4 shadow-card">
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <h3 className="font-display text-base sm:text-lg font-bold text-dark flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-md shrink-0 bg-blue-50">
                  <Users size={13} className="text-blue-600" aria-hidden="true" />
                </span>
                Recent Enquiries
              </h3>
              <Link to="/admin/enquiries" className="text-primary text-xs sm:text-sm font-medium hover:underline">
                View all
              </Link>
            </div>

            {loading ? (
              <div className="space-y-3 py-1">
                {[0, 1, 2].map(i => (
                  <div key={i} className="flex items-center gap-3">
                    <SkeletonBlock className="h-3.5 flex-1" />
                    <SkeletonBlock className="h-3.5 w-16" />
                    <SkeletonBlock className="h-5 w-14 rounded-full" />
                  </div>
                ))}
              </div>
            ) : recentEnquiries.length === 0 ? (
              <p className="text-dark-muted text-sm py-8 text-center">No enquiries yet.</p>
            ) : (
              <div className="-mx-1">
                <table className="w-full table-fixed text-xs sm:text-sm">
                  <caption className="sr-only">Recent enquiries</caption>
                  <thead>
                    <tr className="text-left text-dark-muted border-b border-background-warm">
                      <th className="font-medium py-2 px-1 w-[24%]">Name</th>
                      <th className="font-medium py-2 px-1 w-[30%]">Trip</th>
                      <th className="font-medium py-2 px-1 w-[26%]">Date</th>
                      <th className="font-medium py-2 px-1 w-[20%] text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentEnquiries.map((e, i) => (
                      <motion.tr
                        key={e.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.04 }}
                        className="border-b border-background-warm last:border-0 hover:bg-background-warm/30"
                      >
                        <td className="py-2 sm:py-3 px-1 font-medium text-dark truncate">
                          <Link
                            to={`/admin/enquiries/${e.id}`}
                            className="hover:text-primary hover:underline transition-colors"
                            title={e.full_name}
                          >
                            {truncateText(e.full_name, 10)}
                          </Link>
                        </td>
                        <td className="py-2 sm:py-3 px-1 text-dark-muted truncate" title={e.trip_title || undefined}>{truncateText(e.trip_title || '—', 10)}</td>
                        <td className="py-2 sm:py-3 px-1 text-dark-muted whitespace-nowrap">{formatDate(e.created_at)}</td>
                        <td className="py-2 sm:py-3 px-1 text-right">
                          <span className={`inline-block text-[10px] sm:text-xs font-semibold px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full whitespace-nowrap ${STATUS_STYLES[e.status]}`}>
                            {STATUS_LABELS[e.status]}
                          </span>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-white rounded-md sm:rounded-lg p-3 sm:p-4 shadow-card">
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <h3 className="font-display text-base sm:text-lg font-bold text-dark flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-md shrink-0 bg-primary/10">
                  <Briefcase size={13} className="text-primary" aria-hidden="true" />
                </span>
                Upcoming Trips
              </h3>
              <Link to="/admin/trips" className="text-primary text-xs sm:text-sm font-medium hover:underline">
                View all
              </Link>
            </div>

            {loading ? (
              <div className="space-y-3 py-1">
                {[0, 1, 2].map(i => (
                  <div key={i} className="flex items-start gap-3 sm:gap-4">
                    <SkeletonBlock className="w-12 h-12 sm:w-16 sm:h-16 rounded sm:rounded-md flex-shrink-0" />
                    <div className="flex-1 space-y-2 pt-1">
                      <SkeletonBlock className="h-4 w-3/4" />
                      <SkeletonBlock className="h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : nextTrips.length === 0 ? (
              <p className="text-dark-muted text-sm py-8 text-center">No upcoming trips yet.</p>
            ) : (
              <div className="space-y-2.5 sm:space-y-3 pb-1 sm:pb-2">
                {nextTrips.map((trip, i) => {
                  const totalSeats = trip.total_seats || 0;
                  const seatsBooked = trip.seats_booked || 0;
                  const seatsLeft = Math.max(0, totalSeats - seatsBooked);
                  const occupancyPct = totalSeats > 0 ? Math.min(100, Math.round((seatsBooked / totalSeats) * 100)) : 0;
                  return (
                    <motion.div
                      key={trip.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06 }}
                    >
                      <Link
                        to="/admin/trips"
                        state={{ editTripId: trip.id }}
                        className="flex items-start gap-3 sm:gap-4 group"
                      >
                        <div className="w-12 h-12 sm:w-16 sm:h-16 rounded sm:rounded-md overflow-hidden bg-background-warm flex-shrink-0">
                          {trip.cover_image && (
                            <img src={trip.cover_image} alt={trip.title} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-dark text-sm sm:text-base truncate group-hover:text-primary transition-colors">{trip.title}</p>
                          <div className="flex items-center justify-between gap-2 mt-0.5">
                            <p className="text-dark-muted text-[11px] sm:text-xs truncate">
                              {formatDateRange(trip.start_date, trip.end_date)}
                              {trip.duration ? ` • ${trip.duration}` : ''}
                            </p>
                            <span className="flex-shrink-0 text-[10px] sm:text-xs font-semibold text-primary bg-orange-50 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full whitespace-nowrap">
                              {seatsLeft} Seats Left
                            </span>
                          </div>
                          {totalSeats > 0 && (
                            <div className="w-full h-1 rounded-full bg-background-warm overflow-hidden mt-1.5">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${occupancyPct}%` }}
                                transition={{ duration: 0.5, delay: i * 0.06, ease: 'easeOut' }}
                                className="h-full bg-primary rounded-full"
                              />
                            </div>
                          )}
                        </div>
                      </Link>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
