import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, Clock, RefreshCw } from 'lucide-react';
import AdminLayout from './AdminLayout';
import { getEnquiries, updateEnquiryStatus } from '../services/api';
import type { Enquiry } from '../types';
import { formatDate } from '../utils';

const STATUS_CONFIG = {
  new: { label: 'New', color: 'bg-blue-100 text-blue-700', icon: Clock },
  contacted: { label: 'Contacted', color: 'bg-amber-100 text-amber-700', icon: RefreshCw },
  closed: { label: 'Closed', color: 'bg-green-100 text-green-700', icon: CheckCircle },
};

export default function AdminEnquiries() {
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | Enquiry['status']>('all');
  const [updating, setUpdating] = useState<string | null>(null);

  const load = () => {
    getEnquiries().then(setEnquiries).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleStatusChange = async (id: string, status: Enquiry['status']) => {
    setUpdating(id);
    await updateEnquiryStatus(id, status).catch(console.error);
    load();
    setUpdating(null);
  };

  const filtered = filter === 'all' ? enquiries : enquiries.filter(e => e.status === filter);
  const counts = {
    all: enquiries.length,
    new: enquiries.filter(e => e.status === 'new').length,
    contacted: enquiries.filter(e => e.status === 'contacted').length,
    closed: enquiries.filter(e => e.status === 'closed').length,
  };

  return (
    <AdminLayout title="Enquiries">
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {([['all', 'All'], ['new', 'New'], ['contacted', 'Contacted'], ['closed', 'Closed']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`bg-white rounded-2xl p-4 text-left shadow-card transition-all ${filter === key ? 'ring-2 ring-primary' : 'hover:shadow-card-hover'}`}
            >
              <p className="font-display text-2xl font-bold text-dark">{counts[key]}</p>
              <p className="text-dark-muted text-sm">{label}</p>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-16 text-dark-muted">Loading enquiries...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl shadow-card">
            <p className="font-display text-xl text-dark-muted">No enquiries found.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-background-warm text-dark font-medium">
                  <tr>
                    <th className="px-4 py-3 text-left">Name</th>
                    <th className="px-4 py-3 text-left hidden sm:table-cell">Phone</th>
                    <th className="px-4 py-3 text-left hidden md:table-cell">Trip</th>
                    <th className="px-4 py-3 text-left hidden lg:table-cell">City</th>
                    <th className="px-4 py-3 text-left hidden lg:table-cell">Date</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-right">Update</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-background-warm">
                  {filtered.map(e => {
                    const cfg = STATUS_CONFIG[e.status];
                    return (
                      <motion.tr key={e.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hover:bg-background/50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-dark">{e.full_name}</p>
                          <p className="text-dark-muted text-xs">{e.email}</p>
                        </td>
                        <td className="px-4 py-3 text-dark-muted hidden sm:table-cell">{e.phone}</td>
                        <td className="px-4 py-3 text-dark-muted hidden md:table-cell max-w-[180px] truncate">{e.trip_title || '—'}</td>
                        <td className="px-4 py-3 text-dark-muted hidden lg:table-cell">{e.city || '—'}</td>
                        <td className="px-4 py-3 text-dark-muted hidden lg:table-cell">{formatDate(e.created_at, { day: 'numeric', month: 'short' })}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-button font-semibold px-3 py-1 rounded-full ${cfg.color}`}>
                            <cfg.icon size={12} />
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <select
                            value={e.status}
                            disabled={updating === e.id}
                            onChange={ev => handleStatusChange(e.id, ev.target.value as Enquiry['status'])}
                            className="text-xs px-3 py-1.5 rounded-lg border border-background-warm bg-background text-dark cursor-pointer outline-none focus:border-primary"
                          >
                            <option value="new">New</option>
                            <option value="contacted">Contacted</option>
                            <option value="closed">Closed</option>
                          </select>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
