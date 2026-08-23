import type { UpcomingTrip } from '../../types/types-index';
import { ArrowSquareOut as ExternalLink, ArrowRight } from '@phosphor-icons/react';

interface TripEndBannerProps {
  endBanner: NonNullable<UpcomingTrip['end_banner']>;
  onBook: () => void;
}

export default function TripEndBanner({ endBanner, onBook }: TripEndBannerProps) {
  if (!endBanner.heading && !endBanner.image) return null;

  return (
    <div className="relative overflow-hidden mt-0">
      {endBanner.image && (
        <img src={endBanner.image} alt="" className="absolute inset-0 w-full h-full object-cover" />
      )}
      <div className={`relative ${endBanner.image ? 'bg-dark/70' : 'bg-dark'} pt-12 sm:pt-20 pb-10 px-4 sm:px-6 lg:px-8`}>
        <div className="max-w-[1344px] mx-auto grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
          <div className="mt-8 sm:mt-12">
            {endBanner.heading && (
              <h2 className="font-display text-2xl sm:text-4xl md:text-5xl font-bold text-white leading-tight mb-4">
                {endBanner.heading}
              </h2>
            )}
            {endBanner.description && (
              <p className="text-white/70 text-sm sm:text-lg leading-relaxed mb-6">{endBanner.description}</p>
            )}
            {endBanner.cta_label && (
              <div className="flex flex-row flex-wrap items-center gap-3">
                {endBanner.cta_url ? (
                  <a
                    href={endBanner.cta_url}
                    className="group/btn inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white font-button font-semibold px-3 py-2 text-sm min-h-[44px] sm:px-8 sm:py-4 sm:text-lg rounded-lg transition-colors"
                  >
                    {endBanner.cta_label} <ExternalLink size={15} />
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={onBook}
                    className="group/btn inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white font-button font-semibold px-3 py-2 text-sm min-h-[44px] sm:px-8 sm:py-4 sm:text-lg rounded-lg transition-colors"
                  >
                    {endBanner.cta_label}
                    <ArrowRight size={16} className="transition-transform group-hover/btn:translate-x-1" />
                  </button>
                )}
                <a
                  href="#highlights"
                  className="inline-flex items-center justify-center gap-2 bg-transparent text-white border-2 border-white/40 hover:border-white hover:bg-white/10 font-button font-semibold px-3 py-2 text-sm min-h-[44px] sm:px-8 sm:py-4 sm:text-lg rounded-lg transition-colors"
                >
                  Explore Trip
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
