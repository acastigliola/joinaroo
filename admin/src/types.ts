export interface Category {
  id: number;
  slug: string;
  name: string;
  tagline?: string;
  icon?: string;
}

export interface Venue {
  id: number;
  name: string;
  address?: string | null;
  city: string;
  lat?: number | null;
  lng?: number | null;
}

export interface EventItem {
  id: number;
  slug: string;
  title: string;
  description?: string | null;
  category: Category;
  venue?: Venue | null;
  starts_at: string;
  ends_at?: string | null;
  cost_free?: boolean;
  cost_text?: string | null;
  url?: string | null;
  source?: string | null;
  featured?: boolean;
  hidden?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface UserItem {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'user';
  locked: boolean;
  created_at: string;
}

export interface AuthUser extends UserItem {
  // same shape as UserItem per contract
}

export interface NewVenueInput {
  name: string;
  address?: string;
  city: string;
  lat?: number | null;
  lng?: number | null;
}

export interface EventFormInput {
  title: string;
  description: string;
  category_slug: string;
  venue_id?: number;
  venue?: NewVenueInput;
  starts_at: string;
  ends_at?: string;
  cost_free: boolean;
  cost_text?: string;
  url?: string;
  source?: string;
  featured: boolean;
  hidden: boolean;
}
