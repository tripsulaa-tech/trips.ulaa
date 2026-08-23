export const FOOD_PREFERENCE_OPTIONS = [
  { value: '', label: 'Not asked / unknown' },
  { value: 'veg', label: 'Veg' },
  { value: 'non_veg', label: 'Non-veg' },
];

// Shared veg/non-veg/not-set → { label, color } mapping used by every food
// badge in the admin — Enquiries (AdminEnquiryCommon.foodBadge) and
// Waitlist (waitlistShared.foodBadge) each wrap this with their own extra
// logic (e.g. waitlist's group "2 veg / 3 non-veg" breakdown case), but the
// base three-way mapping itself was previously copy-pasted identically in
// both places. Centralized here so the label/color pairing only has to be
// changed once.
export const FOOD_PREFERENCE_BADGE: Record<'veg' | 'non_veg' | 'not_set', { label: string; color: string }> = {
  veg: { label: 'Veg', color: 'bg-green-100 text-green-700' },
  non_veg: { label: 'Non-veg', color: 'bg-red-100 text-red-700' },
  not_set: { label: 'Food not set', color: 'bg-slate-100 text-dark-muted' },
};

export const foodPreferenceBadge = (pref: 'veg' | 'non_veg' | null | undefined): { label: string; color: string } =>
  FOOD_PREFERENCE_BADGE[pref === 'veg' || pref === 'non_veg' ? pref : 'not_set'];
