import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';

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
            <Route path="/admin/gallery" element={
              <ProtectedRoute><AdminGallery /></ProtectedRoute>
            } />
            <Route path="/admin/enquiries" element={
              <ProtectedRoute><AdminEnquiries /></ProtectedRoute>
            } />

            {/* 404 */}
            <Route path="*" element={
              <div className="min-h-screen flex flex-col items-center justify-center bg-background text-center px-4">
                <h1 className="font-display text-8xl font-bold text-primary mb-4">404</h1>
                <p className="text-dark-muted text-xl mb-8">This page doesn't exist.</p>
                <a href="/" className="bg-primary text-white px-6 py-3 rounded-xl font-button font-semibold hover:bg-primary-dark transition-colors">
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
