// Merge Contacts modal. A contact isn't its own database row — it's every
// enquiry that matched the same person (see travellerContacts.ts) — so a
// merge doesn't delete anything: it rewrites name/phone/email/city on every
// enquiry behind the contact being merged away so they match the one being
// kept, and they then collapse into a single contact on their own. All
// trips, payments and invoices stay exactly where they are.
import { useMemo, useState } from 'react';
import { MagnifyingGlass, Warning, ArrowsMerge, X } from '@phosphor-icons/react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { formatPhone } from '../../utils/formatPhone';
import { getInitials } from '../../utils/utils-index';
import { contactMatchesQuery } from './travellerContacts';
import type { TravellerContact } from './travellerContacts';
import { findMergeConflicts, planMerge, suggestMergeCandidates } from './travellerMerge';

const MAX_RESULTS = 6;

function ContactSummary({ contact }: { contact: TravellerContact }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <span className="w-9 h-9 rounded-full bg-primary/10 text-primary inline-flex items-center justify-center shrink-0 text-xs font-display font-bold">
        {getInitials(contact.fullName, '?')}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-dark truncate">{contact.fullName}</p>
        <p className="text-xs text-dark-muted truncate">
          {contact.phones.some(Boolean) ? contact.phones.map(formatPhone).join(' · ') : 'No phone'}
          {contact.email ? ` · ${contact.email}` : ''}
        </p>
        <p className="text-2xs text-dark-muted truncate">
          {contact.joinedTripCount > 0
            ? `${contact.joinedTripCount} trip${contact.joinedTripCount === 1 ? '' : 's'} joined`
            : 'Enquiry only'}
          {contact.city ? ` · ${contact.city}` : ''}
        </p>
      </div>
    </div>
  );
}

// Keyed on source.key by the parent (AdminTravellers.tsx) so state resets
// cleanly each time a different contact's Merge is opened.
export default function AdminMergeTravellerModal({
  source,
  initialOtherKey = null,
  allContacts,
  onClose,
  onMerge,
  merging,
}: {
  source: TravellerContact | null;
  // Contact to pre-select as the merge partner (e.g. from the shared-phone alert).
  initialOtherKey?: string | null;
  allContacts: TravellerContact[];
  onClose: () => void;
  onMerge: (keep: TravellerContact, other: TravellerContact) => void;
  merging: boolean;
}) {
  const [query, setQuery] = useState('');
  const [otherKey, setOtherKey] = useState<string | null>(initialOtherKey);
  const [keepSide, setKeepSide] = useState<'source' | 'other'>(() => {
    const o = initialOtherKey ? allContacts.find(c => c.key === initialOtherKey) : undefined;
    return source && o && o.joinedTripCount > source.joinedTripCount ? 'other' : 'source';
  });

  const candidates = useMemo(() => {
    if (!source) return [];
    const others = allContacts.filter(c => c.key !== source.key);
    const q = query.trim();
    return (q ? others.filter(c => contactMatchesQuery(c, q)) : suggestMergeCandidates(source, others)).slice(0, MAX_RESULTS);
  }, [source, allContacts, query]);

  const other = otherKey ? allContacts.find(c => c.key === otherKey) ?? null : null;

  const selectOther = (c: TravellerContact) => {
    setOtherKey(c.key);
    // Default to keeping whichever contact has joined more trips.
    setKeepSide(!source || source.joinedTripCount >= c.joinedTripCount ? 'source' : 'other');
  };

  const keep = source && other ? (keepSide === 'source' ? source : other) : null;
  const drop = source && other ? (keepSide === 'source' ? other : source) : null;
  const conflicts = keep && drop ? findMergeConflicts(keep, drop) : [];
  const plan = keep && drop ? planMerge(keep, drop) : null;
  const canMerge = !!keep && !!drop && conflicts.length === 0 && !plan?.conflict && !merging;

  return (
    <Modal
      isOpen={!!source}
      onClose={onClose}
      title="Merge contacts"
      size="md"
      footer={
        <div className="flex gap-3">
          <Button variant="outline" size="md" className="flex-1" onClick={onClose} disabled={merging}>Cancel</Button>
          <Button
            variant="primary"
            size="md"
            className="flex-1"
            onClick={() => keep && drop && onMerge(keep, drop)}
            disabled={!canMerge}
          >
            <ArrowsMerge size={15} aria-hidden="true" /> {merging ? 'Merging…' : 'Merge contacts'}
          </Button>
        </div>
      }
    >
      {source && (
        <div className="space-y-5">
          <p className="text-sm text-dark-muted">
            Use this when the same person has been saved twice (for example with two phone numbers, or two
            travellers sharing one number). Both phone numbers are kept on the merged traveller. Nothing is
            deleted — every trip, payment and invoice stays; the two contacts just become one.
          </p>

          <div>
            <p className="text-xs font-button font-semibold text-dark-muted uppercase tracking-wide mb-2">Merging</p>
            <div className="rounded-md border-2 border-background-warm px-3 py-2.5">
              <ContactSummary contact={source} />
            </div>
          </div>

          <div>
            <label htmlFor="merge-search" className="text-xs font-button font-semibold text-dark-muted uppercase tracking-wide block mb-2">
              With which contact?
            </label>
            <div className="relative">
              <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-muted" aria-hidden="true" />
              <input
                id="merge-search"
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search name, phone, email, trip..."
                className="w-full pl-9 pr-9 py-2 rounded-md border-2 border-background-warm bg-white text-sm focus:border-primary outline-none"
              />

              {query && (
                <button
                  type="button"
                  onClick={() => { setQuery(''); document.getElementById('merge-search')?.focus(); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-dark-muted hover:text-dark hover:bg-background-warm transition-colors"
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <p className="text-2xs text-dark-muted mt-1.5">
              {query.trim() ? 'Matching contacts' : 'Possible matches (same phone, email, name or last 4 digits) — or search above'}
            </p>
            <ul className="mt-2 space-y-1.5" role="listbox" aria-label="Contacts to merge with">
              {candidates.length === 0 ? (
                <li className="text-sm text-dark-muted bg-background-warm/50 rounded-md px-3 py-3">
                  {query.trim() ? 'No contacts match that search.' : 'No obvious matches — try searching by name or phone.'}
                </li>
              ) : candidates.map(c => (
                <li key={c.key}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={otherKey === c.key}
                    onClick={() => selectOther(c)}
                    className={`w-full text-left rounded-md border-2 px-3 py-2.5 transition-colors ${
                      otherKey === c.key ? 'border-primary bg-primary/5' : 'border-background-warm hover:border-primary/30'
                    }`}
                  >
                    <ContactSummary contact={c} />
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {source && other && (
            <fieldset>
              <legend className="text-xs font-button font-semibold text-dark-muted uppercase tracking-wide mb-2">
                Keep whose details?
              </legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {([['source', source], ['other', other]] as const).map(([side, c]) => (
                  <label
                    key={side}
                    className={`flex items-start gap-2.5 rounded-md border-2 px-3 py-2.5 cursor-pointer transition-colors ${
                      keepSide === side ? 'border-primary bg-primary/5' : 'border-background-warm hover:border-primary/30'
                    }`}
                  >
                    <input
                      type="radio"
                      name="merge-keep"
                      checked={keepSide === side}
                      onChange={() => setKeepSide(side)}
                      className="mt-1 accent-primary"
                    />
                    <ContactSummary contact={c} />
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {keep && drop && conflicts.length === 0 && (
            <div className="rounded-md bg-background-warm/60 px-3 py-3 text-sm text-dark space-y-1">
              <p>
                <span className="font-semibold">{drop.rows.length} enquir{drop.rows.length === 1 ? 'y' : 'ies'}</span>
                {' '}from {drop.fullName} will move to <span className="font-semibold">{keep.fullName}</span>
                {' '}({keep.phone ? formatPhone(keep.phone) : 'no phone'}).
              </p>
              {plan && (
                <p className="text-xs text-dark-muted">
                  Phone numbers after merge:{' '}
                  <span className="font-semibold text-dark">
                    {[plan.phone, plan.second].filter(Boolean).map(formatPhone).join(' · ')}
                  </span>
                  {plan.second ? ' (the second number is saved as the Emergency contact)' : ''}
                </p>
              )}
              {((!keep.email && drop.email) || (!keep.city && drop.city)) && (
                <p className="text-xs text-dark-muted">
                  The {[!keep.email && drop.email ? 'email' : '', !keep.city && drop.city ? 'city' : ''].filter(Boolean).join(' and ')}{' '}
                  missing on {keep.fullName} will be filled in from {drop.fullName}.
                </p>
              )}
              <p className="text-xs text-dark-muted">
                Each moved enquiry gets a "Details updated" entry on its Activity Timeline. This can't be undone automatically —
                to split them again you'd edit the details back.
              </p>
            </div>
          )}

          {plan?.conflict && conflicts.length === 0 && (
            <div className="flex items-start gap-2.5 rounded-md bg-amber-50 text-amber-800 px-3 py-3 text-sm" role="alert">
              <Warning size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="font-semibold">Too many different phone numbers to keep</p>
                <p className="mt-1">{[plan.phone, ...plan.extras].map(formatPhone).join(' · ')}</p>
                <p className="mt-1 text-xs">
                  A traveller holds a main phone and one Emergency contact number. Use Edit on one of them to remove a number
                  (or fix a wrong one), then merge.
                </p>
              </div>
            </div>
          )}

          {conflicts.length > 0 && (
            <div className="flex items-start gap-2.5 rounded-md bg-amber-50 text-amber-800 px-3 py-3 text-sm" role="alert">
              <Warning size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="font-semibold">Both contacts already have an active enquiry for the same trip</p>
                <p className="mt-1">{conflicts.join(', ')}</p>
                <p className="mt-1 text-xs">
                  That usually means the same booking was logged twice. Cancel or delete the duplicate on the Enquiries
                  page first, then merge.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
