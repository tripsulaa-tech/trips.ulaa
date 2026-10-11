// Custom icon: copies of documents, drawn as two pages with folded corners, one
// behind the other. Phosphor's FileText is a single page, which doesn't say
// "copies". Same outline style as WaterBottleIcon / PassportIcon (24x24 grid,
// 1.8 stroke, round caps) and the same (size / color / className) prop shape, so
// it can sit in the trip icon library (see TripHighlightIconType in
// ../../constants/tripHighlightIcons.ts) and render in the itinerary PDF.
// `weight` / `strokeWidth` props meant for Phosphor icons are accepted and ignored.

interface DocumentCopiesIconProps {
  size?: number | string;
  color?: string;
  className?: string;
  weight?: string;
  strokeWidth?: number | string;
  [key: string]: unknown;
}

export default function DocumentCopiesIcon({
  size = 24,
  color = 'currentColor',
  className,
  weight: _weight,
  strokeWidth: _strokeWidth,
  ...rest
}: DocumentCopiesIconProps) {
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
      {/* back page */}
      <path d="M9 8V4.5a1 1 0 0 1 1-1h6l4 4V15a1 1 0 0 1-1 1h-2" />
      {/* front page + folded corner */}
      <path d="M4 9a1 1 0 0 1 1-1h6l4 4v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM11 8v4h4" />
    </svg>
  );
}
