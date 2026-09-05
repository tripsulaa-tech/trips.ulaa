import {
  Plus,
  Trash as Trash2,
  ArrowUp,
  ArrowDown,
} from '@phosphor-icons/react';
import TripHighlightIconPicker from '../../components/ui/TripHighlightIconPicker';
import { useConfirm } from '../../components/ui/useConfirm';
import type { BottomNavItemConfig } from '../../types/types-index';
import { FORM_INPUT_CLASS as inputClass } from '../../constants/formStyles';

// Simple, dependency-free unique id — good enough for a short admin-edited
// list that only ever grows one tab at a time via the "Add Tab" button.
const makeId = () => `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export default function BottomNavSection({
  items,
  setItems,
  sectionRef,
}: {
  items: BottomNavItemConfig[];
  setItems: React.Dispatch<React.SetStateAction<BottomNavItemConfig[]>>;
  sectionRef: (el: HTMLDivElement | null) => void;
}) {
  const confirm = useConfirm();

  const updateItem = (index: number, patch: Partial<BottomNavItemConfig>) => {
    setItems(list => list.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const addTab = () => {
    setItems(list => [...list, { id: makeId(), label: 'New Tab', to: '/', icon: 'star' }]);
  };

  const removeTab = async (index: number) => {
    if (items.length <= 1) {
      alert('The nav bar needs at least one tab.');
      return;
    }
    const ok = await confirm({
      title: 'Remove this tab?',
      message: `"${items[index].label}" will no longer show in the mobile bottom nav bar.`,
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    setItems(list => list.filter((_, i) => i !== index));
  };

  const moveTab = (index: number, direction: -1 | 1) => {
    setItems(list => {
      const target = index + direction;
      if (target < 0 || target >= list.length) return list;
      const next = [...list];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  return (
    <div ref={sectionRef} data-section={7} className="scroll-mt-4 space-y-3">
      <div>
        <h2 className="font-display text-lg font-bold text-dark pb-3 border-b border-background-warm">Bottom Nav Bar</h2>
        <p className="text-xs text-dark-muted mt-2">Edit the icon, label, and link for each tab in the mobile bottom nav bar, or add a new one.</p>
      </div>

      {items.map((item, index) => (
        <div key={item.id} className="border border-background-warm rounded-md p-3">
          {/* Mobile (below sm): unchanged original layout — icon on its own
              row, label/link in a 2-col grid below. */}
          <div className="sm:hidden space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex flex-col gap-1 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => moveTab(index, -1)}
                  disabled={index === 0}
                  aria-label={`Move ${item.label} tab up`}
                  className="p-1 rounded text-dark-muted hover:text-dark hover:bg-background-warm transition-colors disabled:opacity-30 disabled:pointer-events-none"
                  title="Move up"
                >
                  <ArrowUp size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => moveTab(index, 1)}
                  disabled={index === items.length - 1}
                  aria-label={`Move ${item.label} tab down`}
                  className="p-1 rounded text-dark-muted hover:text-dark hover:bg-background-warm transition-colors disabled:opacity-30 disabled:pointer-events-none"
                  title="Move down"
                >
                  <ArrowDown size={14} aria-hidden="true" />
                </button>
              </div>

              <div className="flex-1 min-w-0">
                <label htmlFor={`bottomnav-icon-m-${item.id}`} className="block text-xs font-medium text-dark-muted mb-1">Icon</label>
                <TripHighlightIconPicker
                  id={`bottomnav-icon-m-${item.id}`}
                  value={item.icon}
                  onChange={key => updateItem(index, { icon: key })}
                  hintText={item.label}
                />
              </div>

              <button
                type="button"
                onClick={() => removeTab(index)}
                aria-label={`Remove ${item.label} tab`}
                className="mt-5 p-1.5 rounded text-primary/70 hover:text-primary hover:bg-primary/5 transition-colors flex-shrink-0"
                title="Remove tab"
              >
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 pl-8">
              <div className="min-w-0">
                <label htmlFor={`bottomnav-label-m-${item.id}`} className="block text-xs font-medium text-dark-muted mb-1">Label</label>
                <input
                  id={`bottomnav-label-m-${item.id}`}
                  value={item.label}
                  onChange={e => updateItem(index, { label: e.target.value })}
                  className={inputClass}
                  placeholder="e.g. Upcoming"
                />
              </div>

              <div className="min-w-0">
                <label htmlFor={`bottomnav-link-m-${item.id}`} className="block text-xs font-medium text-dark-muted mb-1">Link</label>
                <input
                  id={`bottomnav-link-m-${item.id}`}
                  value={item.to}
                  onChange={e => updateItem(index, { to: e.target.value })}
                  className={inputClass}
                  placeholder="/trips"
                />
              </div>
            </div>
          </div>

          {/* Desktop (sm and up): icon, label, and link all on one row. */}
          <div className="hidden sm:flex sm:items-start sm:gap-2">
            <div className="flex flex-col gap-1 flex-shrink-0 pt-5">
              <button
                type="button"
                onClick={() => moveTab(index, -1)}
                disabled={index === 0}
                aria-label={`Move ${item.label} tab up`}
                className="p-1 rounded text-dark-muted hover:text-dark hover:bg-background-warm transition-colors disabled:opacity-30 disabled:pointer-events-none"
                title="Move up"
              >
                <ArrowUp size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => moveTab(index, 1)}
                disabled={index === items.length - 1}
                aria-label={`Move ${item.label} tab down`}
                className="p-1 rounded text-dark-muted hover:text-dark hover:bg-background-warm transition-colors disabled:opacity-30 disabled:pointer-events-none"
                title="Move down"
              >
                <ArrowDown size={14} aria-hidden="true" />
              </button>
            </div>

            <div className="w-52 flex-shrink-0">
              <label htmlFor={`bottomnav-icon-d-${item.id}`} className="block text-xs font-medium text-dark-muted mb-1">Icon</label>
              <TripHighlightIconPicker
                id={`bottomnav-icon-d-${item.id}`}
                value={item.icon}
                onChange={key => updateItem(index, { icon: key })}
                hintText={item.label}
              />
            </div>

            <div className="flex-1 min-w-0">
              <label htmlFor={`bottomnav-label-d-${item.id}`} className="block text-xs font-medium text-dark-muted mb-1">Label</label>
              <input
                id={`bottomnav-label-d-${item.id}`}
                value={item.label}
                onChange={e => updateItem(index, { label: e.target.value })}
                className={inputClass}
                placeholder="e.g. Upcoming"
              />
            </div>

            <div className="flex-1 min-w-0">
              <label htmlFor={`bottomnav-link-d-${item.id}`} className="block text-xs font-medium text-dark-muted mb-1">Link</label>
              <input
                id={`bottomnav-link-d-${item.id}`}
                value={item.to}
                onChange={e => updateItem(index, { to: e.target.value })}
                className={inputClass}
                placeholder="/trips"
              />
            </div>

            <button
              type="button"
              onClick={() => removeTab(index)}
              aria-label={`Remove ${item.label} tab`}
              className="mt-5 p-1.5 rounded text-primary/70 hover:text-primary hover:bg-primary/5 transition-colors flex-shrink-0"
              title="Remove tab"
            >
              <Trash2 size={15} aria-hidden="true" />
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addTab}
        className="flex items-center gap-1 text-xs font-medium text-primary border border-primary rounded-md px-2.5 py-1.5 hover:bg-primary/5 transition-colors"
      >
        <Plus size={13} aria-hidden="true" /> Add Tab
      </button>
    </div>
  );
}
