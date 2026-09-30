// Icon for the "Veg" food choice: the "leaf" outline icon from Tabler Icons
// (https://tabler.io/icons, MIT License, © Paweł Kuna), inlined as a small SVG
// (no extra dependency). It draws in currentColor, so it follows the
// surrounding text color — e.g. the green used for a selected Veg button.

interface LeafIconProps {
  size?: number | string;
  className?: string;
}

export default function LeafIcon({ size = 18, className }: LeafIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M5 21c.5 -4.5 2.5 -8 7 -10" />
      <path d="M9 18c6.218 0 10.5 -3.288 11 -12v-2h-4.014c-9 0 -11.986 4 -12 9c0 1 0 3 2 5h3l.014 0" />
    </svg>
  );
}
