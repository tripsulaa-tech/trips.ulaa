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
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface CompletedTrip {
  id: string;
  title: string;
  destination: string;
  slug: string;
  trip_date: string;
  description: string;
  story?: string;
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
  created_at: string;
  updated_at: string;
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
}

export interface AdminUser {
  id: string;
  email: string;
}
