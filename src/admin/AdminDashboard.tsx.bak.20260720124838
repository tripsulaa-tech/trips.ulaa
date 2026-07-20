import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, BookOpen, Images, Users, TrendingUp } from 'lucide-react';
import AdminLayout from './AdminLayout';
import { getAllUpcomingTripsAdmin, getAllCompletedTripsAdmin, getEnquiries } from '../services/api';


export default function AdminDashboard() {
  const [stats, setStats] = useState({
    upcomingTrips: 0,
    completedTrips: 0,
    enquiries: 0,
    newEnquiries: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getAllUpcomingTripsAdmin(),
      getAllCompletedTripsAdmin(),
      getEnquiries(),
    ]).then(([upcoming, completed, enquiries]) => {
      setStats({
        upcomingTrips: upcoming.length,
        completedTrips: completed.length,
        enquiries: enquiries.length,
        newEnquiries: enquiries.filter(e => e.status === 'new').length,
      });
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const cards = [
    { label: 'Upcoming Trips', value: stats.upcomingTrips, icon: MapPin, color: 'bg-blue-50 text-blue-600', to: '/admin/trips' },
    { label: 'Completed Albums', value: stats.completedTrips, icon: BookOpen, color: 'bg-green-50 text-green-600', to: '/admin/albums' },
    { label: 'Total Enquiries', value: stats.enquiries, icon: Users, color: 'bg-purple-50 text-purple-600', to: '/admin/enquiries' },
    { label: 'New Enquiries', value: stats.newEnquiries, icon: TrendingUp, color: 'bg-amber-50 text-amber-600', to: '/admin/enquiries' },
  ];

  return (
    <AdminLayout title="Dashboard">
      <div className="space-y-8">
        {/* Welcome */}
        <div className="bg-dark rounded-3xl p-8 text-white">
          <h2 className="font-display text-3xl font-bold mb-2">Welcome back!</h2>
          <p className="text-white/70">Here's what's happening with ULAA today.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {cards.map(({ label, value, icon: Icon, color, to }) => (
            <Link key={label} to={to} className="bg-white rounded-2xl p-6 shadow-card hover:shadow-card-hover transition-all group">
              <div className={`w-12 h-12 rounded-2xl ${color} flex items-center justify-center mb-4`}>
                <Icon size={22} />
              </div>
              <p className="font-display text-3xl font-bold text-dark">
                {loading ? '—' : value}
              </p>
              <p className="text-dark-muted text-sm mt-1">{label}</p>
            </Link>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Link to="/admin/trips" className="bg-white rounded-2xl p-6 shadow-card hover:shadow-card-hover transition-all flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <MapPin size={22} />
            </div>
            <div>
              <p className="font-semibold text-dark">Manage Trips</p>
              <p className="text-dark-muted text-sm">Add, edit, publish trips</p>
            </div>
          </Link>
          <Link to="/admin/enquiries" className="bg-white rounded-2xl p-6 shadow-card hover:shadow-card-hover transition-all flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-secondary/10 text-secondary flex items-center justify-center">
              <Users size={22} />
            </div>
            <div>
              <p className="font-semibold text-dark">View Enquiries</p>
              <p className="text-dark-muted text-sm">Manage booking requests</p>
            </div>
          </Link>
          <Link to="/admin/gallery" className="bg-white rounded-2xl p-6 shadow-card hover:shadow-card-hover transition-all flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Images size={22} />
            </div>
            <div>
              <p className="font-semibold text-dark">Gallery</p>
              <p className="text-dark-muted text-sm">Upload and manage photos</p>
            </div>
          </Link>
        </div>
      </div>
    </AdminLayout>
  );
}
