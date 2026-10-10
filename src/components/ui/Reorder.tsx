import { useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { CaretLeft, CaretRight, CaretUp, CaretDown, DotsSixVertical } from '@phosphor-icons/react';

/**
 * Shared "change the order" behaviour for every admin list of cards/rows
 * (highlight cards, what's included groups, things to carry, FAQs, …).
 *
 * The saved order IS the array order, so whatever order the admin leaves a
 * list in is the order visitors see on the site after saving.
 *
 *   const drag = useReorder((from, to) => setList(l => moveItem(l, from, to)));
 *   <div {...drag.itemProps(i)} className={`border ${drag.itemClass(i)}`}>
 *     <ReorderGrip drag={drag} index={i} count={list.length} />   // desktop drag handle
 *     <ReorderArrows drag={drag} index={i} count={list.length} /> // touch / keyboard
 *   </div>
 */

/** Returns a copy of `list` with the item at `from` moved to position `to`. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export interface ReorderApi {
  move: (from: number, to: number) => void;
  dragFrom: number | null;
  dragOver: number | null;
  itemProps: (index: number) => {
    'data-reorder-item': string;
    onDragOver: (e: DragEvent) => void;
    onDrop: (e: DragEvent) => void;
  };
  /** Extra classes for the item while it is being dragged / hovered as a drop target. */
  itemClass: (index: number) => string;
  handleProps: (index: number) => {
    draggable: true;
    onDragStart: (e: DragEvent<HTMLElement>) => void;
    onDragEnd: () => void;
  };
}

export function useReorder(onMove: (from: number, to: number) => void): ReorderApi {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  // Always call the latest onMove (it usually closes over fresh state/setters).
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  const end = () => {
    setDragFrom(null);
    setDragOver(null);
  };

  return {
    move: (from, to) => onMoveRef.current(from, to),
    dragFrom,
    dragOver,
    itemProps: index => ({
      'data-reorder-item': '',
      onDragOver: e => {
        if (dragFrom === null) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragOver !== index) setDragOver(index);
      },
      onDrop: e => {
        e.preventDefault();
        if (dragFrom !== null) onMoveRef.current(dragFrom, index);
        end();
      },
    }),
    itemClass: index =>
      dragFrom === index
        ? 'opacity-40 !border-primary'
        : dragOver === index && dragFrom !== null
          ? '!border-primary ring-2 ring-primary/40'
          : '',
    handleProps: index => ({
      draggable: true,
      onDragStart: e => {
        setDragFrom(index);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(index));
        // Show the whole card/row as the drag preview, not just the little grip.
        const item = e.currentTarget.closest('[data-reorder-item]');
        if (item) e.dataTransfer.setDragImage(item, 24, 24);
      },
      onDragEnd: end,
    }),
  };
}

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
