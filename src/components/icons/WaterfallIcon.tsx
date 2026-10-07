// Custom icon: a waterfall — two rock ledges at the top, streams of water
// falling between them, and a ripple where it lands. Phosphor ships no
// waterfall glyph, so it's hand-built here as a small SVG component with the
// same (size / color / className) prop shape as LinkedHeartsIcon, so it can
// sit in the trip icon library (see TripHighlightIconType in
// ../../constants/tripHighlightIcons.ts). `weight` / `strokeWidth` props meant
// for Phosphor icons are accepted and ignored.

interface WaterfallIconProps {
  size?: number | string;
  color?: string;
  className?: string;
  weight?: string;
  strokeWidth?: number | string;
  [key: string]: unknown;
}

export default function WaterfallIcon({
  size = 24,
  color = 'currentColor',
  className,
  weight: _weight,
  strokeWidth: _strokeWidth,
  ...rest
}: WaterfallIconProps) {
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
      {/* rock ledges */}
      <path d="M2.5 3.5v5h5" />
      <path d="M21.5 3.5v5h-5" />
      {/* falling water */}
      <path d="M10 8.5v8.5" />
      <path d="M12 8.5v9.5" />
      <path d="M14 8.5v8.5" />
      {/* ripple at the base */}
      <path d="M3.5 20.5c1.1-1.4 2.2-1.4 3.3 0s2.2 1.4 3.3 0 2.2-1.4 3.3 0 2.2 1.4 3.3 0 2.2-1.4 3.3 0" />
    </svg>
  );
}
