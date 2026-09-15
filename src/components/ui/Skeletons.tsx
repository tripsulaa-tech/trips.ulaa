import { motion } from 'framer-motion';

// Skeleton shimmer base
const shimmer = `relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/40 before:to-transparent`;

function TripCardSkeleton() {
  return (
    <div className="bg-white rounded-xl shadow-card">
      <div className={`h-64 bg-background-warm rounded-t-xl ${shimmer}`} />
      <div className="p-6 space-y-3">
        <div className={`h-5 bg-background-warm rounded-md w-3/4 ${shimmer}`} />
        <div className={`h-4 bg-background-warm rounded-md w-1/2 ${shimmer}`} />
        <div className={`h-4 bg-background-warm rounded-md w-full ${shimmer}`} />
        <div className={`h-4 bg-background-warm rounded-md w-5/6 ${shimmer}`} />
        <div className={`h-10 bg-background-warm rounded-lg w-full mt-4 ${shimmer}`} />
      </div>
    </div>
  );
}

function AlbumCardSkeleton() {
  return (
    <div className="bg-white rounded-xl shadow-card">
      <div className={`h-56 md:h-64 bg-background-warm rounded-t-xl ${shimmer}`} />
      <div className="p-6 space-y-3">
        <div className={`h-4 bg-background-warm rounded-md w-full ${shimmer}`} />
        <div className={`h-4 bg-background-warm rounded-md w-4/5 ${shimmer}`} />
        <div className={`h-10 bg-background-warm rounded-lg w-full mt-4 ${shimmer}`} />
      </div>
    </div>
  );
}

interface SkeletonGridProps {
  count?: number;
  type?: 'trip' | 'album';
}

export function SkeletonGrid({ count = 6, type = 'trip' }: SkeletonGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
      {Array.from({ length: count }).map((_, i) => (
        <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}>
          {type === 'album' ? <AlbumCardSkeleton /> : <TripCardSkeleton />}
        </motion.div>
      ))}
    </div>
  );
}

// Full-page loading placeholder for TripDetailPage — a tall hero band
// followed by a couple of stacked content-block placeholders, so the page
// doesn't flash from blank to fully-laid-out content.
export function TripDetailSkeleton() {
  return (
    <div aria-hidden="true">
      <div className={`h-80 sm:h-[28rem] bg-background-warm ${shimmer}`} />
      <div className="relative isolate px-4 sm:px-6 lg:px-8 py-8 sm:py-16">
        <div className="max-w-[1344px] mx-auto space-y-9 sm:space-y-12">
          <div className={`h-24 bg-background-warm rounded-xl ${shimmer}`} />
          <div className="space-y-3">
            <div className={`h-6 bg-background-warm rounded-md w-1/3 ${shimmer}`} />
            <div className={`h-4 bg-background-warm rounded-md w-full ${shimmer}`} />
            <div className={`h-4 bg-background-warm rounded-md w-5/6 ${shimmer}`} />
          </div>
          <div className={`h-72 bg-background-warm rounded-xl ${shimmer}`} />
        </div>
      </div>
    </div>
  );
}

// Full-page loading placeholder for AlbumPage — mirrors its own hero +
// meta-card + content shape, matching TripDetailSkeleton's approach.
export function AlbumSkeleton() {
  return (
    <div aria-hidden="true">
      <div className={`h-[62vh] min-h-[440px] md:h-[72vh] md:min-h-[560px] bg-background-warm ${shimmer}`} />
      <div className="relative z-10 px-4 sm:px-6 lg:px-8 -mt-9 sm:-mt-11">
        <div className="max-w-[1344px] mx-auto">
          <div className={`h-24 rounded-2xl bg-background-warm shadow-warm-lg ${shimmer}`} />
        </div>
      </div>
      <div className="relative isolate px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="max-w-[1344px] mx-auto space-y-6">
          <div className={`h-4 bg-background-warm rounded-md w-full ${shimmer}`} />
          <div className={`h-4 bg-background-warm rounded-md w-5/6 ${shimmer}`} />
          <div className={`h-4 bg-background-warm rounded-md w-2/3 ${shimmer}`} />
        </div>
      </div>
    </div>
  );
}
