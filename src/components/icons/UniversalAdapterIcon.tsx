// Custom icon: a universal travel adapter (rounded body, two pins on top, a
// slider switch on the face). Phosphor only has bare plugs, none of which read
// as a travel adapter. Drawn in the same outline style as WaterBottleIcon
// (24x24 grid, 1.8 stroke, round caps) with the same (size / color / className)
// prop shape, so it can sit in the trip icon library (see TripHighlightIconType
// in ../../constants/tripHighlightIcons.ts) and render in the itinerary PDF.
// `weight` / `strokeWidth` props meant for Phosphor icons are accepted and ignored.

interface UniversalAdapterIconProps {
  size?: number | string;
  color?: string;
  className?: string;
  weight?: string;
  strokeWidth?: number | string;
  [key: string]: unknown;
}

export default function UniversalAdapterIcon({
  size = 24,
  color = 'currentColor',
  className,
  weight: _weight,
  strokeWidth: _strokeWidth,
  ...rest
}: UniversalAdapterIconProps) {
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
      {/* body */}
      <rect x="5" y="10" width="14" height="11" rx="2.5" />
      {/* pins */}
      <path d="M9 10V5M15 10V5" />
      {/* slider switch */}
      <rect x="8.5" y="13.5" width="7" height="3" rx="1.5" />
      {/* ground dot */}
      <path d="M12 19.2h.01" />
    </svg>
  );
}
