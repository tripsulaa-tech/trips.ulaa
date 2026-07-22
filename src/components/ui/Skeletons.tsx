import { motion } from 'framer-motion';

// Skeleton shimmer base
const shimmer = `relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/40 before:to-transparent`;

export function TripCardSkeleton() {
  return (
    <div className="bg-white rounded-3xl shadow-card">
      <div className={`h-64 bg-background-warm rounded-t-3xl ${shimmer}`} />
      <div className="p-6 space-y-3">
        <div className={`h-5 bg-background-warm rounded-lg w-3/4 ${shimmer}`} />
        <div className={`h-4 bg-background-warm rounded-lg w-1/2 ${shimmer}`} />
        <div className={`h-4 bg-background-warm rounded-lg w-full ${shimmer}`} />
        <div className={`h-4 bg-background-warm rounded-lg w-5/6 ${shimmer}`} />
        <div className={`h-10 bg-background-warm rounded-xl w-full mt-4 ${shimmer}`} />
      </div>
    </div>
  );
}

export function AlbumCardSkeleton() {
  return (
    <div className="bg-white rounded-3xl shadow-card">
      <div className={`h-72 bg-background-warm rounded-t-3xl ${shimmer}`} />
      <div className="p-6 space-y-3">
        <div className={`h-4 bg-background-warm rounded-lg w-full ${shimmer}`} />
        <div className={`h-4 bg-background-warm rounded-lg w-4/5 ${shimmer}`} />
        <div className={`h-10 bg-background-warm rounded-xl w-full mt-4 ${shimmer}`} />
      </div>
    </div>
  );
}

export function PageHeroSkeleton() {
  return (
    <div className={`h-[50vh] bg-background-warm ${shimmer}`} />
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
