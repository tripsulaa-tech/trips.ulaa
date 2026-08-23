import {
  Plus,
  X,
  CaretUp as ChevronUp,
  CaretDown as ChevronDown,
} from '@phosphor-icons/react';
import type { CancellationPolicy, CancellationTier } from '../../types/types-index';
import { EDITOR_INPUT_CLASS as inputClass } from '../../constants/formStyles';
import { tierLabel } from '../../constants/cancellationPolicy';

interface CancellationPolicyEditorProps {
  value: CancellationPolicy;
  onChange: (policy: CancellationPolicy) => void;
}

const numberClass = `${inputClass} sm:w-28`;

export default function CancellationPolicyEditor({ value, onChange }: CancellationPolicyEditorProps) {
  const updateTier = (index: number, patch: Partial<CancellationTier>) => {
    onChange({ ...value, tiers: value.tiers.map((t, i) => (i === index ? { ...t, ...patch } : t)) });
  };

  const addTier = () => {
    onChange({ ...value, tiers: [...value.tiers, { min_days: null, max_days: null, description: '' }] });
  };

  const removeTier = (index: number) => {
    onChange({ ...value, tiers: value.tiers.filter((_, i) => i !== index) });
  };

  const moveTier = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= value.tiers.length) return;
    const copy = [...value.tiers];
    [copy[index], copy[target]] = [copy[target], copy[index]];
    onChange({ ...value, tiers: copy });
  };

  const toNumberOrNull = (raw: string): number | null => (raw.trim() === '' ? null : Math.max(0, +raw));

  return (
    <div>
      <label className="block text-sm font-medium text-dark mb-1">Cancellation Policy</label>
      <p className="text-xs text-dark-muted mb-3">
        Shown to the user on this trip's page in a dedicated "Cancellation" tab. The day thresholds below are the only
        things that usually change trip to trip — edit them freely; the rest of the policy wording is shared across all trips.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-background-warm rounded-lg p-3 mb-3">
        <div>
          <label htmlFor="cancellation-payment-due-days" className="block text-xs font-medium text-dark-muted mb-1">Balance due (days before departure)</label>
          <input
            id="cancellation-payment-due-days"
            type="number"
            min={0}
            value={value.payment_due_days}
            onChange={e => onChange({ ...value, payment_due_days: Math.max(0, +e.target.value) })}
            className={numberClass}
          />
        </div>
        <div>
          <label htmlFor="cancellation-refund-min-days" className="block text-xs font-medium text-dark-muted mb-1">Refund timeline — min days</label>
          <input
            id="cancellation-refund-min-days"
            type="number"
            min={0}
            value={value.refund_min_days}
            onChange={e => onChange({ ...value, refund_min_days: Math.max(0, +e.target.value) })}
            className={numberClass}
          />
        </div>
        <div>
          <label htmlFor="cancellation-refund-max-days" className="block text-xs font-medium text-dark-muted mb-1">Refund timeline — max days</label>
          <input
            id="cancellation-refund-max-days"
            type="number"
            min={0}
            value={value.refund_max_days}
            onChange={e => onChange({ ...value, refund_max_days: Math.max(0, +e.target.value) })}
            className={numberClass}
          />
        </div>
      </div>

      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-button font-bold text-dark-muted">Cancellation by Participant — refund tiers</span>
        <button
          type="button"
          onClick={addTier}
          className="flex items-center gap-1 text-xs font-button font-semibold text-primary hover:text-primary/80 transition-colors"
        >
          <Plus size={14} aria-hidden="true" /> Add Tier
        </button>
      </div>

      {value.tiers.length === 0 ? (
        <p className="text-sm text-dark-muted bg-background-warm rounded-lg px-4 py-3">No refund tiers yet. Click "Add Tier" to build the cancellation schedule.</p>
      ) : (
        <div className="space-y-3">
          {value.tiers.map((tier, index) => (
            <div key={index} className="bg-background-warm rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-button font-bold text-primary">{tierLabel(tier, 'Set the day range below')}</span>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => moveTier(index, -1)} disabled={index === 0} className="p-1 rounded-md hover:bg-white disabled:opacity-30 text-dark-muted transition-colors" title="Move up" aria-label={`Move tier "${tierLabel(tier, 'Set the day range below')}" up`}>
                    <ChevronUp size={14} aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => moveTier(index, 1)} disabled={index === value.tiers.length - 1} className="p-1 rounded-md hover:bg-white disabled:opacity-30 text-dark-muted transition-colors" title="Move down" aria-label={`Move tier "${tierLabel(tier, 'Set the day range below')}" down`}>
                    <ChevronDown size={14} aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => removeTier(index)} className="p-1 rounded-md hover:bg-red-50 text-dark-muted hover:text-red-600 transition-colors" title="Remove tier" aria-label={`Remove tier "${tierLabel(tier, 'Set the day range below')}"`}>
                    <X size={14} aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div className="flex gap-2 items-center">
                <div className="flex-1">
                  <label htmlFor={`cancellation-tier-${index}-from`} className="block text-[11px] text-dark-muted mb-0.5">From (min days before departure)</label>
                  <input
                    id={`cancellation-tier-${index}-from`}
                    type="number"
                    min={0}
                    placeholder="No minimum"
                    value={tier.min_days ?? ''}
                    onChange={e => updateTier(index, { min_days: toNumberOrNull(e.target.value) })}
                    className={inputClass}
                  />
                </div>
                <div className="flex-1">
                  <label htmlFor={`cancellation-tier-${index}-to`} className="block text-[11px] text-dark-muted mb-0.5">To (max days before departure)</label>
                  <input
                    id={`cancellation-tier-${index}-to`}
                    type="number"
                    min={0}
                    placeholder="No maximum"
                    value={tier.max_days ?? ''}
                    onChange={e => updateTier(index, { max_days: toNumberOrNull(e.target.value) })}
                    className={inputClass}
                  />
                </div>
              </div>
              <label htmlFor={`cancellation-tier-${index}-description`} className="sr-only">{`Description for tier "${tierLabel(tier, 'Set the day range below')}"`}</label>
              <textarea
                id={`cancellation-tier-${index}-description`}
                value={tier.description}
                onChange={e => updateTier(index, { description: e.target.value })}
                placeholder="What happens to the refund in this window"
                rows={2}
                className={`${inputClass} resize-none`}
              />
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-dark-muted mt-2">
        Leave "From" blank for the tier closest to departure (shows as "Within X days"), and leave "To" blank for the
        furthest-out tier (shows as "More than X days"). Order tiers from furthest to nearest departure.
      </p>
    </div>
  );
}
