import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import CancellationPolicyDisplay from '../../components/ui/CancellationPolicyDisplay';
import TripHighlightIconDisplay from '../../components/ui/TripHighlightIconDisplay';
import TermsBlocks from '../../components/ui/TermsBlocks';
import { DEFAULT_CANCELLATION_POLICY } from '../../constants/cancellationPolicy';
import { parseTerms } from '../../utils/parseTerms';
import type { UpcomingTrip } from '../../types/types-index';
import { formatDate, formatAgeRange, formatPrice } from '../../utils/utils-index';

interface AdminTripDetailModalProps {
  viewingTrip: UpcomingTrip | null;
  onClose: () => void;
  onEdit: (trip: UpcomingTrip) => void;
}

/** View-only details popup — no editable fields, just a clean read-out of a
 *  trip, opened by clicking a trip's title in the table.
 *
 *  Extracted from AdminTrips.tsx (see that file's git history for the
 *  original single-component version). */
export default function AdminTripDetailModal({ viewingTrip, onClose, onEdit }: AdminTripDetailModalProps) {
  return (
    <Modal isOpen={!!viewingTrip} onClose={onClose} title={viewingTrip?.title || 'Trip Details'} size="lg">
      {viewingTrip && (
        <div className="space-y-5">
          {viewingTrip.cover_image && (
            <img src={viewingTrip.cover_image} alt={viewingTrip.title} className="w-full h-48 object-cover rounded-md" loading="lazy" decoding="async" />
          )}
          {viewingTrip.hero_mobile_image && (
            <div>
              <p className="text-xs font-medium text-dark-muted mb-1">Mobile Hero Banner</p>
              <img src={viewingTrip.hero_mobile_image} alt="" className="w-28 h-40 object-cover rounded-md" loading="lazy" decoding="async" />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap ${
              viewingTrip.status === 'published' ? 'bg-green-100 text-green-700'
              : viewingTrip.status === 'coming_soon' ? 'bg-amber-100 text-amber-700'
              : 'bg-background-warm text-dark-muted'
            }`}>
              {viewingTrip.status === 'published' ? 'Published' : viewingTrip.status === 'coming_soon' ? 'Coming Soon' : 'Draft'}
            </span>
            <span className="text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap bg-background-warm text-dark-muted">
              {viewingTrip.seats_booked}/{viewingTrip.total_seats} seats booked
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs font-medium text-dark-muted mb-0.5">Destination</p>
              <p className="text-dark">{viewingTrip.destination}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-dark-muted mb-0.5">Duration</p>
              <p className="text-dark">{viewingTrip.duration}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-dark-muted mb-0.5">Age Range</p>
              <p className="text-dark">
                {viewingTrip.min_age != null || viewingTrip.max_age != null
                  ? formatAgeRange(viewingTrip.min_age, viewingTrip.max_age)
                  : 'No restriction (default 18–65)'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-dark-muted mb-0.5">Dates</p>
              <p className="text-dark">
                {formatDate(viewingTrip.start_date, { day: 'numeric', month: 'short', year: 'numeric' })}
                {' – '}
                {formatDate(viewingTrip.end_date, { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-dark-muted mb-0.5">Price</p>
              <p className="text-dark">
                {viewingTrip.price ? formatPrice(viewingTrip.price) : '—'}
                {viewingTrip.early_bird_price ? ` (Early-bird ${formatPrice(viewingTrip.early_bird_price)})` : ''}
                {viewingTrip.strike_through_price ? ` — strikeout ${formatPrice(viewingTrip.strike_through_price)}` : ''}
              </p>
            </div>
            {viewingTrip.meeting_point && (
              <div className="col-span-2">
                <p className="text-xs font-medium text-dark-muted mb-0.5">Meeting Point</p>
                <p className="text-dark">{viewingTrip.meeting_point}</p>
                {viewingTrip.meeting_address && (
                  <p className="text-dark-muted text-sm mt-0.5">{viewingTrip.meeting_address}</p>
                )}
                {(viewingTrip.meeting_time || viewingTrip.meeting_terminal || viewingTrip.meeting_details) && (
                  <p className="text-dark-muted text-sm mt-1">
                    {[
                      viewingTrip.meeting_time && `Time: ${viewingTrip.meeting_time}`,
                      viewingTrip.meeting_terminal && `Terminal: ${viewingTrip.meeting_terminal}`,
                      viewingTrip.meeting_details && `Details: ${viewingTrip.meeting_details}`,
                    ].filter(Boolean).join(' \u00b7 ')}
                  </p>
                )}
              </div>
            )}
          </div>

          {viewingTrip.description && (
            <div>
              <p className="text-xs font-medium text-dark-muted mb-1">Description</p>
              <p className="text-sm text-dark whitespace-pre-line">{viewingTrip.description}</p>
            </div>
          )}

          {(viewingTrip.highlight_cards?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-medium text-dark-muted mb-1">Highlight Cards</p>
              <div className="grid grid-cols-2 gap-2">
                {viewingTrip.highlight_cards!.map((c, i) => (
                  <div key={i} className="bg-background-warm/60 rounded-md p-2.5 flex items-start gap-2">
                    {c.icon && <TripHighlightIconDisplay icon={c.icon} index={i} size="sm" />}
                    <div>
                      <p className="text-sm text-dark font-medium">{c.heading}</p>
                      {c.description && <p className="text-dark-muted text-xs mt-0.5">{c.description}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {viewingTrip.itinerary?.length > 0 && (
            <div>
              <p className="text-xs font-medium text-dark-muted mb-1">Itinerary</p>
              <div className="space-y-2">
                {viewingTrip.itinerary.map((d, i) => (
                  <div key={i} className="text-sm flex items-start gap-2">
                    {d.icon && <TripHighlightIconDisplay icon={d.icon} index={i} size="sm" />}
                    <div className="min-w-0">
                      <p className="font-medium text-dark">Day {d.day || i + 1}: {d.title}</p>
                      {d.description && <p className="text-dark-muted text-xs mt-0.5">{d.description}</p>}
                      {(d.bullets?.length ?? 0) > 0 && (
                        <ul className="text-dark-muted text-xs list-disc list-inside mt-0.5">
                          {d.bullets!.map((bullet, bi) => <li key={bi}>{bullet}</li>)}
                        </ul>
                      )}
                      {d.images && d.images.length > 0 && (
                        <div className="flex gap-1.5 mt-1.5">
                          {d.images.slice(0, 6).map((url, j) => (
                            <img key={j} src={url} alt="" className="w-10 h-10 object-cover rounded" loading="lazy" decoding="async" />
                          ))}
                          {d.images.length > 6 && (
                            <span className="w-10 h-10 rounded bg-background-warm text-dark-muted text-xs flex items-center justify-center">
                              +{d.images.length - 6}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(viewingTrip.not_included?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-medium text-dark-muted mb-1">Not Included</p>
              <ul className="text-sm text-dark list-disc list-inside space-y-0.5">
                {viewingTrip.not_included.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </div>
          )}

          {(viewingTrip.included_groups?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-medium text-dark-muted mb-1">What's Included — Grouped</p>
              <div className="space-y-2">
                {viewingTrip.included_groups!.map((group, gi) => (
                  <div key={gi}>
                    <p className="text-sm font-semibold text-dark flex items-center gap-1.5">
                      {group.icon && <TripHighlightIconDisplay icon={group.icon} index={gi} size="sm" />}
                      {group.heading}
                    </p>
                    <ul className="text-sm text-dark list-disc list-inside ml-1">
                      {group.bullets.map((bullet, bi) => <li key={bi}>{bullet}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {((viewingTrip.included_items?.length ?? 0) > 0 || (viewingTrip.not_included_items?.length ?? 0) > 0) && (
            <div className="grid grid-cols-2 gap-4">
              {(viewingTrip.included_items?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs font-medium text-dark-muted mb-1">What's Included (icons)</p>
                  <ul className="text-sm text-dark space-y-1">
                    {viewingTrip.included_items!.map((item, i) => (
                      <li key={i} className="flex items-center gap-1.5">
                        {item.icon && <TripHighlightIconDisplay icon={item.icon} index={i} size="sm" />}
                        {item.description}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(viewingTrip.not_included_items?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs font-medium text-dark-muted mb-1">Not Included (icons)</p>
                  <ul className="text-sm text-dark space-y-0.5">
                    {viewingTrip.not_included_items!.map((item, i) => (
                      <li key={i}>{item.icon && <span className="mr-1.5">{item.icon}</span>}{item.description}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {((viewingTrip.things_to_carry_items?.length ?? 0) > 0) && (
            <div>
              <p className="text-xs font-medium text-dark-muted mb-1">Things to Carry</p>
              <ul className="text-sm text-dark space-y-1">
                {viewingTrip.things_to_carry_items!.map((item, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    {item.icon && <TripHighlightIconDisplay icon={item.icon} index={i} size="sm" />}
                    {item.description}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(viewingTrip.confidence_items?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-medium text-dark-muted mb-1">Travel with Confidence</p>
              {viewingTrip.confidence_description && (
                <p className="text-sm text-dark whitespace-pre-line mb-1.5">{viewingTrip.confidence_description}</p>
              )}
              <ul className="text-sm text-dark space-y-1">
                {viewingTrip.confidence_items!.map((item, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    {item.icon && <TripHighlightIconDisplay icon={item.icon} index={i} size="sm" />}
                    {item.description}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {viewingTrip.accommodation_description || (viewingTrip.accommodation_photos?.length ?? 0) > 0 ? (
            <div>
              <p className="text-xs font-medium text-dark-muted mb-1">Accommodation</p>
              {viewingTrip.accommodation_description && (
                <p className="text-sm text-dark whitespace-pre-line mb-1.5">{viewingTrip.accommodation_description}</p>
              )}
              {(viewingTrip.accommodation_photos?.length ?? 0) > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {viewingTrip.accommodation_photos!.slice(0, 8).map((url, i) => (
                    <img key={i} src={url} alt="" className="w-full h-16 object-cover rounded" loading="lazy" decoding="async" />
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {viewingTrip.trip_founder && (viewingTrip.trip_founder.name || viewingTrip.trip_founder.photo) && (
            <div>
              <p className="text-xs font-medium text-dark-muted mb-1">Trip Founder</p>
              <div className="flex gap-3 items-start bg-background-warm/60 rounded-md p-3">
                {viewingTrip.trip_founder.photo && (
                  <img src={viewingTrip.trip_founder.photo} alt="" className="w-14 h-14 rounded-full object-cover flex-shrink-0" loading="lazy" decoding="async" />
                )}
                <div>
                  {viewingTrip.trip_founder.name && <p className="text-sm font-medium text-dark">{viewingTrip.trip_founder.name}</p>}
                  {viewingTrip.trip_founder.description && (
                    <p className="text-dark-muted text-xs mt-0.5 whitespace-pre-line">{viewingTrip.trip_founder.description}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {viewingTrip.gallery_images?.length > 0 && (
            <div>
              <p className="text-xs font-medium text-dark-muted mb-1">Gallery ({viewingTrip.gallery_images.length})</p>
              <div className="grid grid-cols-4 gap-2">
                {viewingTrip.gallery_images.slice(0, 8).map((url, i) => (
                  <img key={i} src={url} alt="" className="w-full h-16 object-cover rounded" loading="lazy" decoding="async" />
                ))}
              </div>
            </div>
          )}

          {(viewingTrip.gallery_items?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-medium text-dark-muted mb-1">Places You'll Post ({viewingTrip.gallery_items!.length})</p>
              {viewingTrip.gallery_description && (
                <p className="text-sm text-dark whitespace-pre-line mb-1.5">{viewingTrip.gallery_description}</p>
              )}
              <div className="grid grid-cols-4 gap-2">
                {viewingTrip.gallery_items!.slice(0, 8).map((item, i) => (
                  <div key={i}>
                    {item.photo && <img src={item.photo} alt="" className="w-full h-16 object-cover rounded" loading="lazy" decoding="async" />}
                    {item.description && <p className="text-dark-muted text-xs mt-0.5 truncate">{item.description}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {(viewingTrip.fashion_photos?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-medium text-dark-muted mb-1">Fashion Aesthetics ({viewingTrip.fashion_photos!.length})</p>
              {viewingTrip.fashion_description && (
                <p className="text-sm text-dark whitespace-pre-line mb-1.5">{viewingTrip.fashion_description}</p>
              )}
              <div className="grid grid-cols-4 gap-2">
                {viewingTrip.fashion_photos!.slice(0, 8).map((url, i) => (
                  <img key={i} src={url} alt="" className="w-full h-16 object-cover rounded" loading="lazy" decoding="async" />
                ))}
              </div>
            </div>
          )}

          {viewingTrip.end_banner && (viewingTrip.end_banner.heading || viewingTrip.end_banner.image) && (
            <div>
              <p className="text-xs font-medium text-dark-muted mb-1">End Banner</p>
              <div className="flex gap-3 items-start bg-background-warm/60 rounded-md p-3">
                {viewingTrip.end_banner.image && (
                  <img src={viewingTrip.end_banner.image} alt="" className="w-20 h-14 rounded object-cover flex-shrink-0" loading="lazy" decoding="async" />
                )}
                <div>
                  {viewingTrip.end_banner.heading && <p className="text-sm font-medium text-dark">{viewingTrip.end_banner.heading}</p>}
                  {viewingTrip.end_banner.description && (
                    <p className="text-dark-muted text-xs mt-0.5">{viewingTrip.end_banner.description}</p>
                  )}
                  {viewingTrip.end_banner.cta_label && (
                    <p className="text-xs text-primary mt-1">{viewingTrip.end_banner.cta_label}{viewingTrip.end_banner.cta_url ? ` → ${viewingTrip.end_banner.cta_url}` : ''}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {(viewingTrip.terms_and_conditions || '').trim() && (
            <details className="group">
              <summary className="text-xs font-medium text-dark-muted mb-1 cursor-pointer select-none list-none flex items-center gap-1">
                <span className="transition-transform group-open:rotate-90">▶</span> Terms & Conditions
              </summary>
              <div className="mt-2 bg-background rounded-md p-3 max-h-64 overflow-y-auto app-scroll space-y-4">
                {parseTerms(viewingTrip.terms_and_conditions || '').map(section => (
                  <div key={section.number}>
                    <p className="text-xs font-bold text-dark mb-1">
                      {section.number}. {section.title}
                    </p>
                    <TermsBlocks blocks={section.blocks} />
                  </div>
                ))}
              </div>
            </details>
          )}

          <details className="group">
            <summary className="text-xs font-medium text-dark-muted mb-1 cursor-pointer select-none list-none flex items-center gap-1">
              <span className="transition-transform group-open:rotate-90">▶</span> Cancellation Policy
            </summary>
            <div className="mt-2 bg-background rounded-md p-3 max-h-80 overflow-y-auto app-scroll">
              <CancellationPolicyDisplay policy={viewingTrip.cancellation_policy || DEFAULT_CANCELLATION_POLICY} />
            </div>
          </details>

          <div className="flex gap-3 pt-2 border-t border-background-warm">
            <Button
              variant="primary"
              size="md"
              className="max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]"
              onClick={() => { const t = viewingTrip; onClose(); onEdit(t); }}
            >
              Edit Trip
            </Button>
            <Button variant="outline" size="md" className="max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]" onClick={onClose}>Close</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
