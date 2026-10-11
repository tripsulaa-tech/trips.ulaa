// Custom icon: a passport-size photograph shown as a portrait with crop-corner
// marks (head and shoulders inside), like a photo booth guide. Phosphor's Camera
// meant "take a photo", not "bring a photo", so this is drawn in the same outline
// style as WaterBottleIcon / PassportIcon (24x24 grid, 1.8 stroke, round caps)
// with the same (size / color / className) prop shape, so it can sit in the trip
// icon library (see TripHighlightIconType in
// ../../constants/tripHighlightIcons.ts) and render in the itinerary PDF.
// `weight` / `strokeWidth` props meant for Phosphor icons are accepted and ignored.

interface PassportPhotoIconProps {
  size?: number | string;
  color?: string;
  className?: string;
  weight?: string;
  strokeWidth?: number | string;
  [key: string]: unknown;
}

export default function PassportPhotoIcon({
  size = 24,
  color = 'currentColor',
  className,
  weight: _weight,
  strokeWidth: _strokeWidth,
  ...rest
}: PassportPhotoIconProps) {
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
      {/* crop corners */}
      <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
      {/* head */}
      <circle cx="12" cy="10.5" r="2.5" />
      {/* shoulders */}
      <path d="M7.8 16.5c.6-2 2.3-3.1 4.2-3.1s3.6 1.1 4.2 3.1" />
    </svg>
  );
}
