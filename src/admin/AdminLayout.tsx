import type { ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, MapPin, Images, BookOpen, LogOut, Menu, X, ChevronRight
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const adminNav = [
  { label: 'Dashboard', to: '/admin', icon: LayoutDashboard },
  { label: 'Upcoming Trips', to: '/admin/trips', icon: MapPin },
  { label: 'Completed Trips', to: '/admin/albums', icon: BookOpen },
  { label: 'Gallery', to: '/admin/gallery', icon: Images },
  { label: 'Enquiries', to: '/admin/enquiries', icon: ChevronRight },
];

interface AdminLayoutProps {
  children: ReactNode;
  title: string;
}

export default function AdminLayout({ children, title }: AdminLayoutProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/admin');
  };

  const Sidebar = () => (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-background-warm">
        <Link to="/" className="inline-block">
          <img src="/ULAA.svg" alt="ULAA" className="h-10" />
        </Link>
        <p className="text-xs text-dark-muted mt-2">Admin Panel</p>
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {adminNav.map(({ label, to, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/admin'}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) => `
              flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all
              ${isActive ? 'bg-primary text-white' : 'text-dark hover:bg-background-warm hover:text-primary'}
            `}
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-background-warm">
        <p className="text-xs text-dark-muted mb-3 px-2 truncate">{user?.email}</p>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-dark hover:bg-red-50 hover:text-red-600 w-full transition-colors"
        >
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 bg-white border-r border-background-warm flex-col fixed inset-y-0 z-30">
        <Sidebar />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-dark/50" onClick={() => setSidebarOpen(false)} />
          <div className="relative w-72 bg-white flex flex-col z-50">
            <button onClick={() => setSidebarOpen(false)} className="absolute top-4 right-4 p-2 rounded-xl text-dark-muted hover:bg-background">
              <X size={20} />
            </button>
            <Sidebar />
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 lg:pl-64 min-h-screen flex flex-col">
        {/* Top bar */}
        <header className="bg-white border-b border-background-warm px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-xl text-dark hover:bg-background"
            >
              <Menu size={20} />
            </button>
            <h1 className="font-display text-xl font-bold text-dark">{title}</h1>
          </div>
          <Link to="/" className="text-sm text-dark-muted hover:text-primary transition-colors">
            ← View Site
          </Link>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
