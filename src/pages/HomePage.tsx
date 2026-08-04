import { Suspense, lazy } from 'react';
import Layout from '../components/layout/Layout';
import HeroSection from '../sections/home/HeroSection';
import { useScrollRestoration } from '../hooks/useScrollRestoration';

const WhyULAA = lazy(() => import('../sections/home/WhyULAA'));
const UpcomingTripsPreview = lazy(() => import('../sections/home/UpcomingTripsPreview'));
const CompletedTripsPreview = lazy(() => import('../sections/home/CompletedTripsPreview'));
const Testimonials = lazy(() => import('../sections/home/Testimonials'));
const GalleryPreview = lazy(() => import('../sections/home/GalleryPreview'));
const MeetTheFounder = lazy(() => import('../sections/home/MeetTheFounder'));
const CTASection = lazy(() => import('../sections/home/CTASection'));

export default function HomePage() {
  // Remember and restore scroll position when leaving/returning via the
  // bottom nav (e.g. Home -> About -> Home), same as the trips pages.
  // Every section below reserves its real height with a fixed-size skeleton
  // immediately (even before its data streams in), so the page's height is
  // stable from first paint and there's no async "ready" gate to wait on.
  useScrollRestoration('/', true);

  return (
    <Layout>
      <HeroSection />
      <Suspense fallback={<div className="h-96 bg-background animate-pulse" />}>
        <UpcomingTripsPreview />
      </Suspense>
      <Suspense fallback={<div className="h-64 bg-cream animate-pulse" />}>
        <WhyULAA />
      </Suspense>
      <Suspense fallback={<div className="h-96 bg-cream animate-pulse" />}>
        <CompletedTripsPreview />
      </Suspense>
      <Suspense fallback={<div className="h-96 bg-dark animate-pulse" />}>
        <Testimonials />
      </Suspense>
      <Suspense fallback={<div className="h-96 bg-background animate-pulse" />}>
        <GalleryPreview />
      </Suspense>
      <Suspense fallback={<div className="h-96 bg-dark animate-pulse" />}>
        <MeetTheFounder />
      </Suspense>
      <Suspense fallback={<div className="h-64 animate-pulse" />}>
        <CTASection />
      </Suspense>
    </Layout>
  );
}

