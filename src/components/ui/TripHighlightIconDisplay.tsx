import { getTripHighlightIcon, getTripHighlightPalette } from '../../constants/tripHighlightIcons';

interface TripHighlightIconDisplayProps {
  /** Stored TripHighlightCard.icon value — a library key (e.g. "palmtree") or a legacy emoji string. */
  icon: string;
  /** Position in the highlight cards list, used to rotate the circle color. */
  index?: number;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Renders the colored icon circle used on the "Why You'll Love This Trip"
 * cards. Falls back to rendering the raw string (e.g. an emoji from older
 * trips) when the value isn't a recognized icon-library key, so nothing
 * created before this picker existed breaks.
 */
export default function TripHighlightIconDisplay({ icon, index = 0, size = 'md' }: TripHighlightIconDisplayProps) {
  const meta = getTripHighlightIcon(icon);
  const { bg, fg } = getTripHighlightPalette(index);
  const dims = size === 'sm' ? 'w-10 h-10' : size === 'lg' ? 'w-20 h-20' : 'w-16 h-16';
  const iconSize = size === 'sm' ? 18 : size === 'lg' ? 36 : 28;

  if (!icon) return null;

  return (
    <div
      className={`${dims} rounded-full flex items-center justify-center flex-shrink-0`}
      style={{ backgroundColor: meta ? bg : undefined }}
    >
      {meta ? (
        <meta.Icon size={iconSize} color={fg} strokeWidth={2} />
      ) : (
        <span className={size === 'sm' ? 'text-xl' : 'text-3xl'}>{icon}</span>
      )}
    </div>
  );
}
