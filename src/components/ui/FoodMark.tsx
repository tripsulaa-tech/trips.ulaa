// Veg / non-veg symbols used everywhere food preference is shown (booking
// form and admin): a leaf for veg, a piece of meat for non-veg. Both draw in
// `currentColor`, so they automatically match whatever text color class the
// surrounding badge already sets (e.g. text-green-700 / text-red-700).
// 'mixed' shows both side by side in fixed green/red — for a group booking
// that's part veg, part non-veg, so it isn't tied to a single badge color.
// 'not_set' is a neutral dashed square: no choice made yet.
import LeafIcon from '../icons/LeafIcon';
import ChickenLegIcon from '../icons/ChickenLegIcon';

interface FoodMarkProps {
  type: 'veg' | 'non_veg' | 'not_set' | 'mixed';
  size?: number;
  className?: string;
}

// Callers pass small badge sizes (9-12px) that suit a filled dot/triangle;
// the outline leaf/meat icons need a little more room to stay readable.
const scale = (size: number) => Math.round(size * 1.3);

export default function FoodMark({ type, size = 12, className = '' }: FoodMarkProps) {
  if (type === 'not_set') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2.5" />
      </svg>
    );
  }
  if (type === 'mixed') {
    const half = Math.round(size * 0.9);
    return (
      <span className={`inline-flex items-center shrink-0 ${className}`} aria-hidden="true">
        <LeafIcon size={half} className="text-green-700" />
        <ChickenLegIcon size={half} className="text-red-700" />
      </span>
    );
  }
  return type === 'veg'
    ? <LeafIcon size={scale(size)} className={className} />
    : <ChickenLegIcon size={scale(size)} className={className} />;
}
