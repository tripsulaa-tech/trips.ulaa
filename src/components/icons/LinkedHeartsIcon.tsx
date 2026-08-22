// Custom icon: two interlocking heart outlines, representing friendship /
// sisterhood / connection. Not part of Phosphor or Lucide's bundled icon
// sets, so it's hand-built here as a small SVG component with the same
// (size / color / className) prop shape the rest of the icon store expects
// (see TripHighlightIconType in ../../constants/tripHighlightIcons.ts).
// Any `weight` / `strokeWidth` props passed in by callers (meant for
// Phosphor/Lucide icons) are accepted and ignored here, since this glyph's
// stroke is fixed to keep the two hearts visually balanced.

interface LinkedHeartsIconProps {
  size?: number | string;
  color?: string;
  className?: string;
  weight?: string;
  strokeWidth?: number | string;
  [key: string]: unknown;
}

const HEART_PATH =
  'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z';

export default function LinkedHeartsIcon({
  size = 24,
  color = 'currentColor',
  className,
  weight: _weight,
  strokeWidth: _strokeWidth,
  ...rest
}: LinkedHeartsIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      {...rest}
    >
      <g transform="translate(2.6 3.6) scale(0.62) rotate(-18 12 12)">
        <path d={HEART_PATH} stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <g transform="translate(5.4 8.4) scale(0.62) rotate(18 12 12)">
        <path d={HEART_PATH} stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
