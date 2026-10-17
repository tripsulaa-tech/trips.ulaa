import { useState } from 'react';
import { Warning, ArrowsMerge } from '@phosphor-icons/react';
import { formatPhone } from '../../utils/formatPhone';
import type { SharedPhoneGroup } from './travellerContacts';

const COLLAPSED_COUNT = 3;

/** Shown above the Contact Book when different travellers (different names)
 *  were saved with the same phone number. They are NOT merged automatically —
 *  it could be one person entered twice, or two people sharing a phone — so
 *  the admin decides: "Review & merge" opens the merge dialog on that pair. */
export default function AdminSharedPhoneAlert({
  groups,
  onReview,
}: {
  groups: SharedPhoneGroup[];
  onReview: (source: SharedPhoneGroup['contacts'][number], otherKey: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  if (groups.length === 0) return null;
  const visible = showAll ? groups : groups.slice(0, COLLAPSED_COUNT);

  return (
    <div className="rounded-lg bg-warning-bg border border-warning-border text-warning-fg p-4 space-y-3" role="alert">
      <div className="flex items-start gap-2.5">
        <Warning size={18} className="shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold">
            {groups.length} phone number{groups.length === 1 ? ' is' : 's are'} used by more than one traveller
          </p>
          <p className="text-xs mt-0.5">
            Could be the same person saved twice, or people sharing a phone. Review and merge if they're the same person.
          </p>
        </div>
      </div>
      <ul className="space-y-2">
        {visible.map(g => (
          <li
            key={g.signature}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 bg-white/70 rounded-md px-3 py-2"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold">{formatPhone(g.phone)}</p>
              <p className="text-xs text-warning-fg break-words">{g.contacts.map(c => c.fullName).join(' · ')}</p>
            </div>
            <button
              type="button"
              onClick={() => onReview(g.contacts[0], g.contacts[1].key)}
              className="inline-flex items-center gap-1.5 text-xs font-button font-semibold px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors"
            >
              <ArrowsMerge size={13} aria-hidden="true" /> Review &amp; merge
            </button>
          </li>
        ))}
      </ul>
      {groups.length > COLLAPSED_COUNT && (
        <button
          type="button"
          onClick={() => setShowAll(v => !v)}
          className="text-xs font-button font-semibold text-warning-fg hover:underline"
        >
          {showAll ? 'Show fewer' : `Show all ${groups.length}`}
        </button>
      )}
    </div>
  );
}
