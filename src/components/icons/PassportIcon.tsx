// Custom icon: a passport booklet with a globe emblem. Phosphor has no passport
// glyph (its IdentificationCard reads as a plain ID), so this is drawn in the same
// outline style as WaterBottleIcon / UniversalAdapterIcon (24x24 grid, 1.8 stroke,
// round caps) with the same (size / color / className) prop shape, so it can sit
// in the trip icon library (see TripHighlightIconType in
// ../../constants/tripHighlightIcons.ts) and render in the itinerary PDF.
// `weight` / `strokeWidth` props meant for Phosphor icons are accepted and ignored.

interface PassportIconProps {
  size?: number | string;
  color?: string;
  className?: string;
  weight?: string;
  strokeWidth?: number | string;
  [key: string]: unknown;
}

export default function PassportIcon({
  size = 24,
  color = 'currentColor',
  className,
  weight: _weight,
  strokeWidth: _strokeWidth,
  ...rest
}: PassportIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      {...rest}
    >
      {/* booklet */}
      <rect x="5" y="3" width="14" height="18" rx="2.5" />
      {/* globe */}
      <circle cx="12" cy="10" r="3.2" />
      <ellipse cx="12" cy="10" rx="1.3" ry="3.2" />
      <path d="M8.8 10h6.4" />
      {/* text line */}
      <path d="M9 17h6" />
    </svg>
  );
}
