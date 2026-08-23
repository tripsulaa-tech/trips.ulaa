import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import TripHighlightIconDisplay from '../../components/ui/TripHighlightIconDisplay';
import CancellationPolicyDisplay from '../../components/ui/CancellationPolicyDisplay';
import TermsBlocks from '../../components/ui/TermsBlocks';
import { DEFAULT_CANCELLATION_POLICY } from '../../constants/cancellationPolicy';
import { parseTerms } from '../../utils/parseTerms';
import { formatDate, formatAgeRange, formatPrice } from '../../utils/utils-index';
import type { UpcomingTrip } from '../../types/types-index';

interface AdminTripViewModalProps {
  trip: UpcomingTrip | null;
  onClose: () => void;
  onEdit: (trip: UpcomingTrip) => void;
}

/** Read-only "Trip Details" modal opened from the Trips table title link.
 *  Split out of the original single-file AdminTrips.tsx — see that
 *  component's own comment for the rest of the split. */
export default function AdminTripViewModal({ trip, onClose, onEdit }: AdminTripViewModalProps) {
  return (
      <Modal isOpen={!!trip} onClose={onClose} title={trip?.title || 'Trip Details'} size="lg">
        {trip && (
          <div className="space-y-5">
            {trip.cover_image && (
              <img src={trip.cover_image} alt={trip.title} className="w-full h-48 object-cover rounded-md" loading="lazy" decoding="async" />
            )}
            {trip.hero_mobile_image && (
              <div>
                <p className="text-xs font-medium text-dark-muted mb-1">Mobile Hero Banner</p>
                <img src={trip.hero_mobile_image} alt="" className="w-28 h-40 object-cover rounded-md" loading="lazy" decoding="async" />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap ${
                trip.status === 'published' ? 'bg-green-100 text-green-700'
                : trip.status === 'coming_soon' ? 'bg-amber-100 text-amber-700'
                : 'bg-background-warm text-dark-muted'
              }`}>
                {trip.status === 'published' ? 'Published' : trip.status === 'coming_soon' ? 'Coming Soon' : 'Draft'}
              </span>
              <span className="text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap bg-background-warm text-dark-muted">
                {trip.seats_booked}/{trip.total_seats} seats booked
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs font-medium text-dark-muted mb-0.5">Destination</p>
                <p className="text-dark">{trip.destination}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-dark-muted mb-0.5">Duration</p>
                <p className="text-dark">{trip.duration}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-dark-muted mb-0.5">Age Range</p>
                <p className="text-dark">
                  {trip.min_age != null || trip.max_age != null
                    ? formatAgeRange(trip.min_age, trip.max_age)
                    : 'No restriction (default 18–65)'}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-dark-muted mb-0.5">Dates</p>
                <p className="text-dark">
                  {formatDate(trip.start_date, { day: 'numeric', month: 'short', year: 'numeric' })}
                  {' – '}
                  {formatDate(trip.end_date, { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-dark-muted mb-0.5">Price</p>
                <p className="text-dark">
                  {trip.price ? formatPrice(trip.price) : '—'}
                  {trip.early_bird_price ? ` (Early-bird ${formatPrice(trip.early_bird_price)})` : ''}
                  {trip.strike_through_price ? ` — strikeout ${formatPrice(trip.strike_through_price)}` : ''}
                </p>
              </div>
              {trip.meeting_point && (
                <div className="col-span-2">
                  <p className="text-xs font-medium text-dark-muted mb-0.5">Meeting Point</p>
                  <p className="text-dark">{trip.meeting_point}</p>
                  {trip.meeting_address && (
                    <p className="text-dark-muted text-sm mt-0.5">{trip.meeting_address}</p>
                  )}
                  {(trip.meeting_time || trip.meeting_terminal || trip.meeting_details) && (
                    <p className="text-dark-muted text-sm mt-1">
                      {[
                        trip.meeting_time && `Time: ${trip.meeting_time}`,
                        trip.meeting_terminal && `Terminal: ${trip.meeting_terminal}`,
                        trip.meeting_details && `Details: ${trip.meeting_details}`,
                      ].filter(Boolean).join(' \u00b7 ')}
                    </p>
                  )}
                </div>
              )}
            </div>

            {trip.description && (
              <div>
                <p className="text-xs font-medium text-dark-muted mb-1">Description</p>
                <p className="text-sm text-dark whitespace-pre-line">{trip.description}</p>
              </div>
            )}

            {(trip.highlight_cards?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs font-medium text-dark-muted mb-1">Highlight Cards</p>
                <div className="grid grid-cols-2 gap-2">
                  {trip.highlight_cards!.map((c, i) => (
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

            {trip.itinerary?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-dark-muted mb-1">Itinerary</p>
                <div className="space-y-2">
                  {trip.itinerary.map((d, i) => (
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

            {(trip.not_included?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs font-medium text-dark-muted mb-1">Not Included</p>
                <ul className="text-sm text-dark list-disc list-inside space-y-0.5">
                  {trip.not_included.map((item, i) => <li key={i}>{item}</li>)}
                </ul>
              </div>
            )}

            {(trip.included_groups?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs font-medium text-dark-muted mb-1">What's Included — Grouped</p>
                <div className="space-y-2">
                  {trip.included_groups!.map((group, gi) => (
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

            {((trip.included_items?.length ?? 0) > 0 || (trip.not_included_items?.length ?? 0) > 0) && (
              <div className="grid grid-cols-2 gap-4">
                {(trip.included_items?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-xs font-medium text-dark-muted mb-1">What's Included (icons)</p>
                    <ul className="text-sm text-dark space-y-1">
                      {trip.included_items!.map((item, i) => (
                        <li key={i} className="flex items-center gap-1.5">
                          {item.icon && <TripHighlightIconDisplay icon={item.icon} index={i} size="sm" />}
                          {item.description}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {(trip.not_included_items?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-xs font-medium text-dark-muted mb-1">Not Included (icons)</p>
                    <ul className="text-sm text-dark space-y-0.5">
                      {trip.not_included_items!.map((item, i) => (
                        <li key={i}>{item.icon && <span className="mr-1.5">{item.icon}</span>}{item.description}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {((trip.things_to_carry_items?.length ?? 0) > 0) && (
              <div>
                <p className="text-xs font-medium text-dark-muted mb-1">Things to Carry</p>
                <ul className="text-sm text-dark space-y-1">
                  {trip.things_to_carry_items!.map((item, i) => (
                    <li key={i} className="flex items-center gap-1.5">
                      {item.icon && <TripHighlightIconDisplay icon={item.icon} index={i} size="sm" />}
                      {item.description}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(trip.confidence_items?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs font-medium text-dark-muted mb-1">Travel with Confidence</p>
                {trip.confidence_description && (
                  <p className="text-sm text-dark whitespace-pre-line mb-1.5">{trip.confidence_description}</p>
                )}
                <ul className="text-sm text-dark space-y-1">
                  {trip.confidence_items!.map((item, i) => (
                    <li key={i} className="flex items-center gap-1.5">
                      {item.icon && <TripHighlightIconDisplay icon={item.icon} index={i} size="sm" />}
                      {item.description}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {trip.accommodation_description || (trip.accommodation_photos?.length ?? 0) > 0 ? (
              <div>
                <p className="text-xs font-medium text-dark-muted mb-1">Accommodation</p>
                {trip.accommodation_description && (
                  <p className="text-sm text-dark whitespace-pre-line mb-1.5">{trip.accommodation_description}</p>
                )}
                {(trip.accommodation_photos?.length ?? 0) > 0 && (
                  <div className="grid grid-cols-4 gap-2">
                    {trip.accommodation_photos!.slice(0, 8).map((url, i) => (
                      <img key={i} src={url} alt="" className="w-full h-16 object-cover rounded" loading="lazy" decoding="async" />
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {trip.trip_founder && (trip.trip_founder.name || trip.trip_founder.photo) && (
              <div>
                <p className="text-xs font-medium text-dark-muted mb-1">Trip Founder</p>
                <div className="flex gap-3 items-start bg-background-warm/60 rounded-md p-3">
                  {trip.trip_founder.photo && (
                    <img src={trip.trip_founder.photo} alt="" className="w-14 h-14 rounded-full object-cover flex-shrink-0" loading="lazy" decoding="async" />
                  )}
                  <div>
                    {trip.trip_founder.name && <p className="text-sm font-medium text-dark">{trip.trip_founder.name}</p>}
                    {trip.trip_founder.description && (
                      <p className="text-dark-muted text-xs mt-0.5 whitespace-pre-line">{trip.trip_founder.description}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {trip.gallery_images?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-dark-muted mb-1">Gallery ({trip.gallery_images.length})</p>
                <div className="grid grid-cols-4 gap-2">
                  {trip.gallery_images.slice(0, 8).map((url, i) => (
                    <img key={i} src={url} alt="" className="w-full h-16 object-cover rounded" loading="lazy" decoding="async" />
                  ))}
                </div>
              </div>
            )}

            {(trip.gallery_items?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs font-medium text-dark-muted mb-1">Places You'll Post ({trip.gallery_items!.length})</p>
                {trip.gallery_description && (
                  <p className="text-sm text-dark whitespace-pre-line mb-1.5">{trip.gallery_description}</p>
                )}
                <div className="grid grid-cols-4 gap-2">
                  {trip.gallery_items!.slice(0, 8).map((item, i) => (
                    <div key={i}>
                      {item.photo && <img src={item.photo} alt="" className="w-full h-16 object-cover rounded" loading="lazy" decoding="async" />}
                      {item.description && <p className="text-dark-muted text-xs mt-0.5 truncate">{item.description}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(trip.fashion_photos?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs font-medium text-dark-muted mb-1">Fashion Aesthetics ({trip.fashion_photos!.length})</p>
                {trip.fashion_description && (
                  <p className="text-sm text-dark whitespace-pre-line mb-1.5">{trip.fashion_description}</p>
                )}
                <div className="grid grid-cols-4 gap-2">
                  {trip.fashion_photos!.slice(0, 8).map((url, i) => (
                    <img key={i} src={url} alt="" className="w-full h-16 object-cover rounded" loading="lazy" decoding="async" />
                  ))}
                </div>
              </div>
            )}

            {trip.end_banner && (trip.end_banner.heading || trip.end_banner.image) && (
              <div>
                <p className="text-xs font-medium text-dark-muted mb-1">End Banner</p>
                <div className="flex gap-3 items-start bg-background-warm/60 rounded-md p-3">
                  {trip.end_banner.image && (
                    <img src={trip.end_banner.image} alt="" className="w-20 h-14 rounded object-cover flex-shrink-0" loading="lazy" decoding="async" />
                  )}
                  <div>
                    {trip.end_banner.heading && <p className="text-sm font-medium text-dark">{trip.end_banner.heading}</p>}
                    {trip.end_banner.description && (
                      <p className="text-dark-muted text-xs mt-0.5">{trip.end_banner.description}</p>
                    )}
                    {trip.end_banner.cta_label && (
                      <p className="text-xs text-primary mt-1">{trip.end_banner.cta_label}{trip.end_banner.cta_url ? ` → ${trip.end_banner.cta_url}` : ''}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {(trip.terms_and_conditions || '').trim() && (
              <details className="group">
                <summary className="text-xs font-medium text-dark-muted mb-1 cursor-pointer select-none list-none flex items-center gap-1">
                  <span className="transition-transform group-open:rotate-90">▶</span> Terms & Conditions
                </summary>
                <div className="mt-2 bg-background rounded-md p-3 max-h-64 overflow-y-auto app-scroll space-y-4">
                  {parseTerms(trip.terms_and_conditions || '').map(section => (
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
                <CancellationPolicyDisplay policy={trip.cancellation_policy || DEFAULT_CANCELLATION_POLICY} />
              </div>
            </details>

            <div className="flex gap-3 pt-2 border-t border-background-warm">
              <Button
                variant="primary"
                size="md"
                className="max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]"
                onClick={() => { onClose(); onEdit(trip); }}
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
