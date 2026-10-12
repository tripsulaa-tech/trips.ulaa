import type { ReorderApi } from './reorderUtils';
import { CaretLeft, CaretRight, CaretUp, CaretDown, DotsSixVertical } from '@phosphor-icons/react';

/**
 * The drag handle and the move earlier / later buttons for admin lists. The
 * behaviour behind them (useReorder, moveItem) is in reorderUtils.ts; see the
 * example there.
 */

interface ReorderPartProps {
  drag: ReorderApi;
  index: number;
  count: number;
  className?: string;
}

/** Drag handle (desktop only — touch screens use the arrows). Hidden when there's nothing to reorder. */
export function ReorderGrip({ drag, index, count, className = '' }: ReorderPartProps) {
  if (count < 2) return null;
  return (
    <span
      {...drag.handleProps(index)}
      title="Drag to reorder"
      aria-hidden="true"
      className={`cursor-grab active:cursor-grabbing text-dark-muted hover:text-primary p-0.5 rounded hover:bg-primary/5 transition-colors flex-shrink-0 max-sm:hidden ${className}`}
    >
      <DotsSixVertical size={16} />
    </span>
  );
}

/** Move earlier / later buttons — work with touch and keyboard. `vertical` suits stacked rows. */
export function ReorderArrows({ drag, index, count, vertical = false, className = '' }: ReorderPartProps & { vertical?: boolean }) {
  if (count < 2) return null;
  const Earlier = vertical ? CaretUp : CaretLeft;
  const Later = vertical ? CaretDown : CaretRight;
  const btn = 'p-1 rounded text-primary/70 hover:text-primary hover:bg-primary/5 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed flex-shrink-0';
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`}>
      <button type="button" onClick={() => drag.move(index, index - 1)} disabled={index === 0} title="Move earlier" aria-label={`Move item ${index + 1} earlier`} className={btn}>
        <Earlier size={13} aria-hidden="true" />
      </button>
      <button type="button" onClick={() => drag.move(index, index + 1)} disabled={index === count - 1} title="Move later" aria-label={`Move item ${index + 1} later`} className={btn}>
        <Later size={13} aria-hidden="true" />
      </button>
    </span>
  );
}
