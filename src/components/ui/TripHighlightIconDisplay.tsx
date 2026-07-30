import { getTripHighlightIcon, getTripHighlightPalette } from '../../constants/tripHighlightIcons';

interface TripHighlightIconDisplayProps {
  /** Stored TripHighlightCard.icon value — a library key (e.g. "palmtree") or a legacy emoji string. */
  icon: string;
  /** Position in the highlight cards list, used to rotate the circle color. */
  index?: number;
  size?: 'sm' | 'md' | 'lg';
  /** When true, renders a solid color fill with a white icon (e.g. active/expanded state). */
  filled?: boolean;
  /** When true, fills with color on desktop hover (requires a `group` class on an ancestor). */
  hoverFill?: boolean;
}

/**
 * Renders the colored icon circle used on the "Why You'll Love This Trip"
 * cards. Falls back to rendering the raw string (e.g. an emoji from older
 * trips) when the value isn't a recognized icon-library key, so nothing
 * created before this picker existed breaks.
 */
export default function TripHighlightIconDisplay({ icon, index = 0, size = 'md', filled = false, hoverFill = false }: TripHighlightIconDisplayProps) {
  const meta = getTripHighlightIcon(icon);
  const { bg, fg } = getTripHighlightPalette(index);
  const dims = size === 'sm' ? 'w-10 h-10' : size === 'lg' ? 'w-20 h-20' : 'w-16 h-16';
  const iconSize = size === 'sm' ? 18 : size === 'lg' ? 36 : 28;

  if (!icon) return null;

  if (!meta) {
    return (
      <div className={`${dims} rounded-full flex items-center justify-center flex-shrink-0`}>
        <span className={size === 'sm' ? 'text-xl' : 'text-3xl'}>{icon}</span>
      </div>
    );
  }

  return (
    <div className={`${dims} relative rounded-full flex-shrink-0`}>
      {/* base pastel state */}
      <div
        className="absolute inset-0 rounded-full flex items-center justify-center transition-opacity duration-300"
        style={{ backgroundColor: bg, opacity: filled ? 0 : 1 }}
      >
        <meta.Icon size={iconSize} color={fg} strokeWidth={2} />
      </div>
      {/* solid fill state — shown when `filled` is true, or on desktop hover when `hoverFill` is enabled */}
      <div
        className={`absolute inset-0 rounded-full flex items-center justify-center transition-opacity duration-300 ${
          filled ? 'opacity-100' : hoverFill ? 'opacity-0 sm:group-hover:opacity-100' : 'opacity-0'
        }`}
        style={{ backgroundColor: fg }}
      >
        <meta.Icon size={iconSize} color="#fff" strokeWidth={2} />
      </div>
    </div>
  );
}
