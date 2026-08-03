import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { useAuth } from '../context/useAuth';
import { motion } from 'framer-motion';
import InstallAppBanner from '../components/ui/InstallAppBanner';
import BottomNav from '../components/layout/BottomNav';

// Scrolls the window to the top whenever the route changes, so navigating
// (e.g. via the footer's Upcoming Trips / Completed Trips / About / Contact
// links) always lands the user at the top of the destination page.
function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

// main.tsx swaps the manifest/icon links once, on the initial hard page
// load. That covers a visitor who types /admin directly, but not one who
// lands on "/" and then clicks through to /admin (or back) via client-side
// routing — the manifest link never got re-pointed for that navigation, so
// installing from the "wrong" route re-served the previous route's
// manifest. Re-run the same swap on every route change so it stays correct
// no matter how the visitor got there.
// Rendered once here, outside <Routes>, instead of inside each page's
// <Layout>. Layout used to render its own BottomNav, so navigating between
// pages unmounted and remounted it every time — replaying its entrance
// animation (so it never read as "sticky") and resetting the active-tab
// indicator's layoutId tracking (so it jumped instead of sliding). Keeping
// a single persistent instance here fixes both: it only mounts/unmounts
// when crossing the public/admin boundary, which is the one case where a
// fresh entrance is actually correct.
function PersistentBottomNav() {
  const { pathname } = useLocation();
  if (pathname.startsWith('/admin')) return null;
  return <BottomNav />;
}

function SyncManifestWithRoute() {
  const { pathname } = useLocation();

  useEffect(() => {
    const isAdminRoute = pathname.startsWith('/admin');

    document
      .querySelector('link[rel="manifest"]')
      ?.setAttribute('href', isAdminRoute ? '/manifest-admin.json' : '/manifest.json');
    document
      .querySelector('link[rel="apple-touch-icon"]')
      ?.setAttribute('href', isAdminRoute ? '/icons/admin/apple-touch-icon.png' : '/icons/user/apple-touch-icon.png');
    const favicon = document.querySelector('link[rel="icon"]');
    favicon?.setAttribute('href', isAdminRoute ? '/icons/admin/favicon-32.png' : '/ULAA.svg');
    favicon?.setAttribute('type', isAdminRoute ? 'image/png' : 'image/svg+xml');
    document
      .querySelector('meta[name="apple-mobile-web-app-title"]')
      ?.setAttribute('content', isAdminRoute ? 'ULAA Admin' : 'ULAA');
    document.title = isAdminRoute ? 'ULAA Admin' : 'ULAA Trips — Unseen. Local. Adventures. Activities.';
  }, [pathname]);

  return null;
}

// Public Pages
const HomePage = lazy(() => import('../pages/HomePage'));
const UpcomingTripsPage = lazy(() => import('../pages/UpcomingTripsPage'));
const TripDetailPage = lazy(() => import('../pages/TripDetailPage'));
const CompletedTripsPage = lazy(() => import('../pages/CompletedTripsPage'));
const AlbumPage = lazy(() => import('../pages/AlbumPage'));
const AboutPage = lazy(() => import('../pages/AboutPage'));
const ContactPage = lazy(() => import('../pages/ContactPage'));

// Admin Pages
const AdminLogin = lazy(() => import('../admin/AdminLogin'));
const AdminDashboard = lazy(() => import('../admin/AdminDashboard'));
const AdminTrips = lazy(() => import('../admin/AdminTrips'));
const AdminAlbums = lazy(() => import('../admin/AdminAlbums'));
const AdminGallery = lazy(() => import('../admin/AdminGallery'));
const AdminEnquiries = lazy(() => import('../admin/AdminEnquiries'));
const AdminWaitlist = lazy(() => import('../admin/AdminWaitlist'));
const AdminAbout = lazy(() => import('../admin/AdminAbout'));
const AdminFounder = lazy(() => import('../admin/AdminFounder'));
const AdminWhyULAA = lazy(() => import('../admin/AdminWhyULAA'));
const AdminTestimonials = lazy(() => import('../admin/AdminTestimonials'));
const AdminBottomNav = lazy(() => import('../admin/AdminBottomNav'));

const PageLoader = () => (
  <div className="fixed inset-0 bg-background flex items-center justify-center z-50">
    <motion.div
      animate={{ rotate: 360 }}
      transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
      className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full"
    />
  </div>
);

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/admin" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (user) return <Navigate to="/admin/dashboard" replace />;
  return <>{children}</>;
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ScrollToTop />
        <SyncManifestWithRoute />
        <InstallAppBanner />
        <PersistentBottomNav />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<HomePage />} />
            <Route path="/trips" element={<UpcomingTripsPage />} />
            <Route path="/trips/:slug" element={<TripDetailPage />} />
            <Route path="/completed-trips" element={<CompletedTripsPage />} />
            <Route path="/completed-trips/:slug" element={<AlbumPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/contact" element={<ContactPage />} />

            {/* Admin Routes */}
            <Route path="/admin" element={
              <AdminRoute><AdminLogin /></AdminRoute>
            } />
            <Route path="/admin/dashboard" element={
              <ProtectedRoute><AdminDashboard /></ProtectedRoute>
            } />
            <Route path="/admin/trips" element={
              <ProtectedRoute><AdminTrips /></ProtectedRoute>
            } />
            <Route path="/admin/albums" element={
              <ProtectedRoute><AdminAlbums /></ProtectedRoute>
            } />
            <Route path="/admin/instagram-moments" element={
              <ProtectedRoute><AdminGallery /></ProtectedRoute>
            } />
            <Route path="/admin/enquiries" element={
              <ProtectedRoute><AdminEnquiries /></ProtectedRoute>
            } />
            <Route path="/admin/waitlist" element={
              <ProtectedRoute><AdminWaitlist /></ProtectedRoute>
            } />
            <Route path="/admin/about" element={
              <ProtectedRoute><AdminAbout /></ProtectedRoute>
            } />
            <Route path="/admin/founder" element={
              <ProtectedRoute><AdminFounder /></ProtectedRoute>
            } />
            <Route path="/admin/why-us" element={
              <ProtectedRoute><AdminWhyULAA /></ProtectedRoute>
            } />
            <Route path="/admin/testimonials" element={
              <ProtectedRoute><AdminTestimonials /></ProtectedRoute>
            } />
            <Route path="/admin/bottom-nav" element={
              <ProtectedRoute><AdminBottomNav /></ProtectedRoute>
            } />

            {/* 404 */}
            <Route path="*" element={
              <div className="min-h-screen flex flex-col items-center justify-center bg-background text-center px-4">
                <h1 className="font-display text-8xl font-bold text-primary mb-4">404</h1>
                <p className="text-dark-muted text-xl mb-8">This page doesn't exist.</p>
                <a href="/" className="bg-primary text-white px-6 py-3 rounded-lg font-button font-semibold hover:bg-primary-dark transition-colors">
                  Go Home
                </a>
              </div>
            } />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
