// Edit Details form shape shared by AdminEnquiryTravellerCard (via
// useEditEnquiry) — the row-edit form built from this shape now lives
// inline in AdminEnquiryTravellerCard.tsx / useEditEnquiry.ts. The standalone
// modal component that used to live in this file was unused (no importer of
// its default export) and was removed as dead code in a cleanup pass; only
// the shared type/default below are still referenced.
import type { Enquiry } from '../../types/types-index';

export type EditDetailsForm = {
  full_name: string;
  email: string;
  phone: string;
  city: string;
  age: number | '';
  trip_id: string;
  food_preference: 'veg' | 'non_veg' | '';
  source: Enquiry['source'];
  package_type: 'early_bird' | 'normal';
};

export const emptyEditDetailsForm: EditDetailsForm = {
  full_name: '', email: '', phone: '', city: '', age: '', trip_id: '',
  food_preference: '', source: 'website', package_type: 'normal',
};
