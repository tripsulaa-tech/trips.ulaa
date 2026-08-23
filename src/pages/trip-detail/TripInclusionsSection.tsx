import TripHighlightIconDisplay from '../../components/ui/TripHighlightIconDisplay';
import type { UpcomingTrip, TripInclusionItem } from '../../types/types-index';
import { CheckCircle, XCircle } from '@phosphor-icons/react';

interface TripInclusionsSectionProps {
  trip: UpcomingTrip;
  activeIncludedGroups: Set<number>;
  setActiveIncludedGroups: React.Dispatch<React.SetStateAction<Set<number>>>;
  activeIncludedItems: Set<number>;
  setActiveIncludedItems: React.Dispatch<React.SetStateAction<Set<number>>>;
  toggleInSet: (setter: React.Dispatch<React.SetStateAction<Set<number>>>, i: number) => void;
}

export default function TripInclusionsSection({
  trip,
  activeIncludedGroups,
  setActiveIncludedGroups,
  activeIncludedItems,
  setActiveIncludedItems,
  toggleInSet,
}: TripInclusionsSectionProps) {
  return (
    <section id="inclusions" className="scroll-mt-44">
      <div className="space-y-10">
        {/* What's Included */}
        {((trip.included_groups?.length ?? 0) > 0 || (trip.included_items?.length ?? 0) > 0) && (
          <div>
            <h2 className="font-display text-2xl font-bold text-dark mb-4">What's Included</h2>
            {(trip.included_groups?.length ?? 0) > 0 ? (
              <div className="grid sm:grid-cols-2 gap-4">
                {trip.included_groups!.map((group, gi) => (
                  <div key={gi} className="group relative bg-background-warm rounded-lg p-6">
                    {/* Full-card tap target on mobile so the fill animation triggers
                        from anywhere on the card; on desktop it's inert (pointer-events-none)
                        so the existing hover-fill on the card keeps working as before. */}
                    <button
                      type="button"
                      onClick={() => toggleInSet(setActiveIncludedGroups, gi)}
                      aria-expanded={activeIncludedGroups.has(gi)}
                      aria-label={`${group.heading} — tap for details`}
                      className="absolute inset-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:pointer-events-none"
                    />
                    <div className="flex items-center gap-2 mb-2">
                      {group.icon && (
                        <TripHighlightIconDisplay icon={group.icon} index={gi} size="md" filled={activeIncludedGroups.has(gi)} hoverFill />
                      )}
                      <h3 className="font-display text-lg font-bold text-dark">{group.heading}</h3>
                    </div>
                    <ul className="space-y-1.5">
                      {group.bullets.map((bullet, bi) => (
                        <li key={bi} className="flex items-start gap-2 text-sm text-dark">
                          <span className="mt-2 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {trip.included_items!.map((item: TripInclusionItem, i: number) => (
                  <div key={i} className="group relative flex flex-col items-center text-center gap-2 bg-background-warm rounded-lg px-4 py-5">
                    <button
                      type="button"
                      onClick={() => toggleInSet(setActiveIncludedItems, i)}
                      aria-expanded={activeIncludedItems.has(i)}
                      aria-label={`${item.description} — tap for details`}
                      className="absolute inset-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:pointer-events-none"
                    />
                    {item.icon ? (
                      <TripHighlightIconDisplay icon={item.icon} index={i} size="sm" filled={activeIncludedItems.has(i)} hoverFill />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                        <CheckCircle size={18} className="text-green-600" />
                      </div>
                    )}
                    <span className="text-sm text-dark font-medium leading-snug">{item.description}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {/* What's Not Included */}
        {((trip.not_included_items?.length ?? 0) > 0 || trip.not_included.length > 0) && (
          <div>
            <h2 className="font-display text-2xl font-bold text-dark mb-4">What's Not Included</h2>
            <div className="flex flex-wrap gap-2">
              {(trip.not_included_items?.length ?? 0) > 0
                ? trip.not_included_items!.map((item: TripInclusionItem, i: number) => (
                    <span key={i} className="flex items-center gap-1.5 bg-background-warm rounded-lg px-4 py-2 text-sm text-dark">
                      <XCircle size={14} className="text-red-400 shrink-0" />
                      {item.description}
                    </span>
                  ))
                : trip.not_included.map((item, i) => (
                    <span key={i} className="flex items-center gap-1.5 bg-background-warm rounded-lg px-4 py-2 text-sm text-dark">
                      <XCircle size={14} className="text-red-400 shrink-0" />
                      {item}
                    </span>
                  ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
