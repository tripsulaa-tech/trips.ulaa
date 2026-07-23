// =============================================
// ULAA - TypeScript Types & Interfaces
// =============================================

export interface UpcomingTrip {
  id: string;
  title: string;
  destination: string;
  slug: string;
  start_date: string;
  end_date: string;
  duration: string;
  description: string;
  highlights: string[];
  itinerary: ItineraryDay[];
  included: string[];
  not_included: string[];
  things_to_carry: string[];
  meeting_point?: string;
  meeting_point_map_url?: string;
  faqs: FAQ[];
  total_seats: number;
  seats_booked: number;
  price?: number;
  early_bird_price?: number;
  early_bird_deadline?: string;
  cover_image?: string;
  gallery_images: string[];
  terms_and_conditions?: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface CompletedTrip {
  id: string;
  title: string;
  destination: string;
  map_url?: string;
  slug: string;
  trip_date: string;
  description: string;
  story?: string;
  batch?: string;
  participants: number;
  cover_image?: string;
  gallery_images: string[];
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface TripImage {
  id: string;
  trip_id: string;
  trip_type: 'upcoming' | 'completed' | 'gallery';
  image_url: string;
  alt_text?: string;
  sort_order: number;
  is_cover: boolean;
  created_at: string;
}

export interface GalleryImage {
  id: string;
  image_url: string;
  alt_text?: string;
  destination?: string;
  sort_order: number;
  is_featured: boolean;
  created_at: string;
}

export interface Enquiry {
  id: string;
  full_name: string;
  age?: number;
  phone: string;
  email: string;
  city?: string;
  emergency_contact?: string;
  message?: string;
  trip_id?: string;
  trip_title?: string;
  status: 'new' | 'contacted' | 'closed';
  source: 'website' | 'whatsapp' | 'phone' | 'instagram' | 'walk_in' | 'other';
  is_paid: boolean;
  package_type: 'early_bird' | 'normal';
  total_amount?: number;
  amount_paid: number;
  terms_accepted?: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdminNotification {
  id: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  is_read: boolean;
  created_at: string;
}

export interface Testimonial {
  id: string;
  name: string;
  photo?: string;
  review: string;
  rating: number;
  destination?: string;
  is_published: boolean;
  sort_order: number;
  created_at: string;
}

export interface ItineraryDay {
  day: number;
  title: string;
  description: string;
}

export interface FAQ {
  question: string;
  answer: string;
}

export interface BookingFormData {
  full_name: string;
  age: number;
  phone: string;
  email: string;
  city: string;
  emergency_contact: string;
  message?: string;
  trip_id?: string;
  trip_title?: string;
  terms_accepted: boolean;
}

// =============================================
// About Page (editable via Admin)
// =============================================
export interface AboutValue {
  icon: string;
  title: string;
  description: string;
}

export interface AboutTimelineItem {
  year: string;
  title: string;
  description: string;
}

export interface AboutContent {
  hero: {
    label: string;
    title: string;
    subtitle: string;
  };
  mission: {
    label: string;
    title: string;
    text: string;
  };
  vision: {
    label: string;
    title: string;
    text: string;
  };
  philosophy: {
    label: string;
    quote_line1: string;
    quote_line2: string;
    text: string;
  };
  values: AboutValue[];
  timeline: AboutTimelineItem[];
}

// =============================================
// Why ULAA / "Why Choose Us" cards (editable via Admin)
// =============================================
export interface WhyUlaaFeature {
  image: string;
  title: string;
  description: string;
}

export interface WhyUlaaContent {
  features: WhyUlaaFeature[];
}

export interface AdminUser {
  id: string;
  email: string;
}
