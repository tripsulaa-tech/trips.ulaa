import { Suspense, lazy } from 'react';
import Layout from '../components/layout/Layout';
import HeroSection from '../sections/home/HeroSection';

const WhyULAA = lazy(() => import('../sections/home/WhyULAA'));
const UpcomingTripsPreview = lazy(() => import('../sections/home/UpcomingTripsPreview'));
const CompletedTripsPreview = lazy(() => import('../sections/home/CompletedTripsPreview'));
const Testimonials = lazy(() => import('../sections/home/Testimonials'));
const GalleryPreview = lazy(() => import('../sections/home/GalleryPreview'));
const CTASection = lazy(() => import('../sections/home/CTASection'));

export default function HomePage() {
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
      <Suspense fallback={<div className="h-64 animate-pulse" />}>
        <CTASection />
      </Suspense>
    </Layout>
  );
}

