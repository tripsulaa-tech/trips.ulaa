// Icon for the "Non-veg" food choice: the "meat" outline icon from Tabler
// Icons (https://tabler.io/icons, MIT License, © Paweł Kuna). Phosphor has no
// drumstick/meat glyph, so this single icon is inlined here as a small SVG
// (no extra dependency). It draws in currentColor, so it follows the
// surrounding text color — e.g. the red used for a selected Non-veg button.

interface ChickenLegIconProps {
  size?: number | string;
  className?: string;
}

export default function ChickenLegIcon({ size = 18, className }: ChickenLegIconProps) {
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
      <path d="M13.62 8.382l1.966 -1.967a2 2 0 1 1 3.414 -1.415a2 2 0 1 1 -1.413 3.414l-1.82 1.821" />
      <path d="M5.904 18.596c2.733 2.734 5.9 4 7.07 2.829c1.172 -1.172 -.094 -4.338 -2.828 -7.071c-2.733 -2.734 -5.9 -4 -7.07 -2.829c-1.172 1.172 .094 4.338 2.828 7.071" />
      <path d="M7.5 16l1 1" />
      <path d="M12.975 21.425c3.905 -3.906 4.855 -9.288 2.121 -12.021c-2.733 -2.734 -8.115 -1.784 -12.02 2.121" />
    </svg>
  );
}
