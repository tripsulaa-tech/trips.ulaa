import type { ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  Home, Briefcase, BookOpen, Image, MessageCircle,
  LogOut, Menu, X, ChevronDown, ExternalLink, FileText, Star, Sparkles
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import NotificationsPanel from './NotificationsPanel';
import PushNotificationToggle from './PushNotificationToggle';

const adminNav = [
  { label: 'Dashboard', to: '/admin', icon: Home },
  { label: 'Upcoming Trips', to: '/admin/trips', icon: Briefcase },
  { label: 'Completed Trips', to: '/admin/albums', icon: BookOpen },
  { label: 'Instagram Moments', to: '/admin/instagram-moments', icon: Image },
  { label: 'Testimonials', to: '/admin/testimonials', icon: Star },
  { label: 'About Page', to: '/admin/about', icon: FileText },
  { label: 'Why ULAA', to: '/admin/why-us', icon: Sparkles },
  { label: 'Enquiries', to: '/admin/enquiries', icon: MessageCircle },
];

interface AdminLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

interface SidebarContentProps {
  userEmail?: string;
  initial: string;
  onNavigate: () => void;
}

function SidebarContent({ userEmail, initial, onNavigate }: SidebarContentProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-6 pb-4 flex justify-center">
        <Link to="/" className="inline-block">
          <img src="/ULAA.svg" alt="ULAA" className="h-28" />
        </Link>
      </div>

      <div className="mx-6 mb-4 pb-4 flex items-center gap-3 border-b border-background-warm">
        <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-display font-semibold flex-shrink-0">
          {initial}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-dark-muted">Admin</p>
          <p className="text-sm font-semibold text-dark truncate">{userEmail}</p>
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-1 overflow-y-auto app-scroll">
        {adminNav.map(({ label, to, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/admin'}
            onClick={onNavigate}
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
        <Link
          to="/"
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-background-warm text-sm font-medium text-dark hover:bg-background-warm transition-colors"
        >
          <ExternalLink size={16} />
          View Site
        </Link>
      </div>
    </div>
  );
}

export default function AdminLayout({ children, title, subtitle }: AdminLayoutProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/admin');
  };

  const initial = 'A';

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 bg-white border-r border-background-warm flex-col fixed inset-y-0 z-30">
        <SidebarContent userEmail={user?.email} initial={initial} onNavigate={() => setSidebarOpen(false)} />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-dark/50" onClick={() => setSidebarOpen(false)} />
          <div className="relative w-72 bg-white flex flex-col z-50">
            <button onClick={() => setSidebarOpen(false)} className="absolute top-4 right-4 p-2 rounded-xl text-dark-muted hover:bg-background">
              <X size={20} />
            </button>
            <SidebarContent userEmail={user?.email} initial={initial} onNavigate={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 min-w-0 lg:pl-64 min-h-screen flex flex-col">
        {/* Top bar */}
        <header className="bg-white border-b border-background-warm px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-xl text-dark hover:bg-background flex-shrink-0"
            >
              <Menu size={20} />
            </button>
            <div className="min-w-0">
              <h1 className="font-display text-xl sm:text-2xl font-bold text-dark truncate">{title}</h1>
              {subtitle && (
                <p className="text-sm text-dark-muted mt-0.5 hidden sm:block truncate">{subtitle}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            <PushNotificationToggle />
            <NotificationsPanel />

            <div className="relative">
              <button
                onClick={() => setProfileOpen(o => !o)}
                className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full hover:bg-background-warm transition-colors"
              >
                <div className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center text-sm font-display font-semibold flex-shrink-0">
                  {initial}
                </div>
                <span className="text-sm font-medium text-dark hidden sm:inline">Admin</span>
                <ChevronDown size={16} className="text-dark-muted hidden sm:inline" />
              </button>

              {profileOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setProfileOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-card-hover border border-background-warm py-2 z-20">
                    <p className="px-4 py-2 text-xs text-dark-muted truncate border-b border-background-warm mb-1">{user?.email}</p>
                    <button
                      onClick={handleSignOut}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-dark hover:bg-red-50 hover:text-red-600 w-full transition-colors"
                    >
                      <LogOut size={16} />
                      Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
