// Custom icon: a water bottle with a wavy water line inside. Phosphor has no
// bottle glyph that reads as drinking water (its Drop / BeerBottle / SprayBottle
// all mean something else), so this one is the "bottle" outline icon from Tabler
// Icons (https://tabler.io/icons, MIT License, © Paweł Kuna), inlined as a small
// SVG (no extra dependency). Same (size / color / className) prop shape as
// WaterfallIcon, so it can sit in the trip icon library (see
// TripHighlightIconType in ../../constants/tripHighlightIcons.ts) and render in
// the itinerary PDF. `weight` / `strokeWidth` props meant for Phosphor icons are
// accepted and ignored.

interface WaterBottleIconProps {
  size?: number | string;
  color?: string;
  className?: string;
  weight?: string;
  strokeWidth?: number | string;
  [key: string]: unknown;
}

export default function WaterBottleIcon({
  size = 24,
  color = 'currentColor',
  className,
  weight: _weight,
  strokeWidth: _strokeWidth,
  ...rest
}: WaterBottleIconProps) {
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
      {/* cap */}
      <path d="M10 5h4v-2a1 1 0 0 0 -1 -1h-2a1 1 0 0 0 -1 1v2" />
      {/* bottle body */}
      <path d="M14 3.5c0 1.626 .507 3.212 1.45 4.537l.05 .07a8.093 8.093 0 0 1 1.5 4.694v6.199a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2v-6.2c0 -1.682 .524 -3.322 1.5 -4.693l.05 -.07a7.823 7.823 0 0 0 1.45 -4.537" />
      {/* water line */}
      <path d="M7 14.803a2.4 2.4 0 0 0 1 -.803a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 1 -.805" />
    </svg>
  );
}
