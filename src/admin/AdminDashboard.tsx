import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Briefcase, BookOpen, Users, TrendingUp, ChevronRight,
  PlusCircle, FolderPlus, ImagePlus,
} from 'lucide-react';
import AdminLayout from './AdminLayout';
import {
  getAllUpcomingTripsAdmin, getAllCompletedTripsAdmin, getEnquiries,
} from '../services/api';
import type { UpcomingTrip, Enquiry } from '../types';
import bannerImg from '../assets/hero.png';

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

function formatDate(dateStr?: string) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateRange(start?: string, end?: string) {
  if (!start) return '—';
  const s = new Date(start);
  if (Number.isNaN(s.getTime())) return '—';
  const e = end ? new Date(end) : null;
  const sameMonth = e && s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  const monthYear = s.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  if (!e || Number.isNaN(e.getTime())) {
    return s.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  if (sameMonth) {
    return `${s.getDate()} – ${e.getDate()} ${monthYear}`;
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getAllUpcomingTripsAdmin(),
      getAllCompletedTripsAdmin(),
      getEnquiries(),
    ]).then(([upcomingTrips, completed, allEnquiries]) => {
      setUpcoming(upcomingTrips);
      setCompletedCount(completed.length);
      setEnquiries(allEnquiries);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const todayStr = new Date().toDateString();
  const newToday = enquiries.filter(e => new Date(e.created_at).toDateString() === todayStr).length;

  const statCards = [
    { label: 'Upcoming Trips', value: upcoming.length, icon: Briefcase, color: 'text-primary', to: '/admin/trips', cta: 'View all trips' },
    { label: 'Completed Albums', value: completedCount, icon: BookOpen, color: 'text-primary', to: '/admin/albums', cta: 'View all albums' },
    { label: 'Total Enquiries', value: enquiries.length, icon: Users, color: 'text-primary', to: '/admin/enquiries', cta: 'View enquiries' },
  ];

  const quickActions = [
    { label: 'Add New Trip', desc: 'Create and publish a new trip', icon: PlusCircle, color: 'text-primary', to: '/admin/trips' },
    { label: 'Create Album', desc: 'Add a new completed trip album', icon: FolderPlus, color: 'text-primary', to: '/admin/albums' },
    { label: 'Upload Photos', desc: 'Add photos to Instagram Moments', icon: ImagePlus, color: 'text-primary', to: '/admin/instagram-moments' },
    { label: 'View Enquiries', desc: 'Manage booking requests', icon: Users, color: 'text-primary', to: '/admin/enquiries' },
  ];

  const recentEnquiries = enquiries.slice(0, 5);
  const nextTrips = [...upcoming]
    .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
    .slice(0, 3);

  return (
    <AdminLayout title="Dashboard">
      <div className="space-y-5 sm:space-y-8">
        {/* Welcome banner */}
        <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl">
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
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5 items-stretch">
          {statCards.map(({ label, value, icon: Icon, color, to }) => (
            <Link
              key={label}
              to={to}
              className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-4 shadow-card hover:shadow-card-hover transition-all flex items-center justify-between gap-2 h-full"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className={`w-8 h-8 sm:w-12 sm:h-12 flex items-center justify-center flex-shrink-0 ${color}`}>
                    <Icon size={20} className="sm:w-7 sm:h-7" />
                  </div>
                  <p className="font-display text-xl sm:text-3xl font-bold text-dark">
                    {loading ? '—' : value}
                  </p>
                </div>
                <p className="text-dark-muted text-xs sm:text-sm mt-1">{label}</p>
              </div>
              <ChevronRight size={18} className="sm:w-6 sm:h-6 text-primary flex-shrink-0" />
            </Link>
          ))}

          <div className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-4 shadow-card hover:shadow-card-hover transition-all flex items-center justify-between gap-2 h-full">
            <div className="min-w-0">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-12 sm:h-12 flex items-center justify-center flex-shrink-0 text-primary">
                  <TrendingUp size={20} className="sm:w-7 sm:h-7" />
                </div>
                <p className="font-display text-xl sm:text-3xl font-bold text-dark">
                  {loading ? '—' : newToday}
                </p>
              </div>
              <p className="text-dark-muted text-xs sm:text-sm mt-1">New Enquiries Today</p>
            </div>
            <ChevronRight size={18} className="sm:w-6 sm:h-6 text-primary flex-shrink-0" />
          </div>
        </div>

        {/* Quick Actions */}
        <div>
          <h3 className="font-display text-base sm:text-lg font-bold text-dark mb-3 sm:mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-3 sm:gap-5">
            {quickActions.map(({ label, desc, icon: Icon, color, to }) => (
              <Link
                key={label}
                to={to}
                className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-4 shadow-card hover:shadow-card-hover transition-all flex items-center gap-2 sm:gap-3 group"
              >
                <div className={`w-8 h-8 sm:w-12 sm:h-12 flex items-center justify-center flex-shrink-0 ${color}`}>
                  <Icon size={20} className="sm:w-7 sm:h-7" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-dark text-xs sm:text-base truncate">{label}</p>
                  <p className="hidden sm:block text-dark-muted text-sm truncate">{desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent Enquiries + Upcoming Trips */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-5">
          <div className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-4 shadow-card">
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <div className="flex items-center gap-2">
                <h3 className="font-display text-base sm:text-lg font-bold text-dark">Recent Enquiries</h3>
              </div>
              <Link to="/admin/enquiries" className="text-primary text-xs sm:text-sm font-medium hover:underline">
                View all
              </Link>
            </div>

            {recentEnquiries.length === 0 ? (
              <p className="text-dark-muted text-sm py-8 text-center">
                {loading ? 'Loading…' : 'No enquiries yet.'}
              </p>
            ) : (
              <div className="-mx-1">
                <table className="w-full table-fixed text-xs sm:text-sm">
                  <thead>
                    <tr className="text-left text-dark-muted border-b border-background-warm">
                      <th className="font-medium py-2 px-1 w-[24%]">Name</th>
                      <th className="font-medium py-2 px-1 w-[30%]">Trip</th>
                      <th className="font-medium py-2 px-1 w-[26%]">Date</th>
                      <th className="font-medium py-2 px-1 w-[20%] text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentEnquiries.map(e => (
                      <tr key={e.id} className="border-b border-background-warm last:border-0">
                        <td className="py-2 sm:py-3 px-1 font-medium text-dark truncate" title={e.full_name}>{truncateText(e.full_name, 10)}</td>
                        <td className="py-2 sm:py-3 px-1 text-dark-muted truncate" title={e.trip_title || undefined}>{truncateText(e.trip_title || '—', 10)}</td>
                        <td className="py-2 sm:py-3 px-1 text-dark-muted whitespace-nowrap">{formatDate(e.created_at)}</td>
                        <td className="py-2 sm:py-3 px-1 text-right">
                          <span className={`inline-block text-[10px] sm:text-xs font-semibold px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full whitespace-nowrap ${STATUS_STYLES[e.status]}`}>
                            {STATUS_LABELS[e.status]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-4 shadow-card">
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <div className="flex items-center gap-2">
                <h3 className="font-display text-base sm:text-lg font-bold text-dark">Upcoming Trips</h3>
              </div>
              <Link to="/admin/trips" className="text-primary text-xs sm:text-sm font-medium hover:underline">
                View all
              </Link>
            </div>

            {nextTrips.length === 0 ? (
              <p className="text-dark-muted text-sm py-8 text-center">
                {loading ? 'Loading…' : 'No upcoming trips yet.'}
              </p>
            ) : (
              <div className="space-y-2.5 sm:space-y-3 pb-1 sm:pb-2">
                {nextTrips.map(trip => {
                  const seatsLeft = Math.max(0, (trip.total_seats || 0) - (trip.seats_booked || 0));
                  return (
                    <Link
                      key={trip.id}
                      to="/admin/trips"
                      className="flex items-start gap-3 sm:gap-4 group"
                    >
                      <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-lg sm:rounded-xl overflow-hidden bg-background-warm flex-shrink-0">
                        {trip.cover_image && (
                          <img src={trip.cover_image} alt={trip.title} className="w-full h-full object-cover" />
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
                      </div>
                    </Link>
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
