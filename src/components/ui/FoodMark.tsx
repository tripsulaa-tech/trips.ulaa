// Standard FSSAI-style veg / non-veg square mark — a green square with a
// filled dot for veg, a red/brown square with a filled triangle for
// non-veg. Used in place of a generic fork/knife icon anywhere food
// preference is shown, since this is the mark people actually recognize.
// Renders in `currentColor`, so it automatically matches whatever text
// color class the surrounding badge already sets (e.g. text-green-700).
interface FoodMarkProps {
  type: 'veg' | 'non_veg' | 'not_set';
  size?: number;
  className?: string;
}

export default function FoodMark({ type, size = 12, className = '' }: FoodMarkProps) {
  if (type === 'not_set') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2.5" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="2.5" y="2.5" width="19" height="19" rx="1.5" stroke="currentColor" strokeWidth="2" />
      {type === 'veg' ? (
        <circle cx="12" cy="12" r="5.5" fill="currentColor" />
      ) : (
        <path d="M12 6L18.2 17H5.8L12 6Z" fill="currentColor" />
      )}
    </svg>
  );
}
