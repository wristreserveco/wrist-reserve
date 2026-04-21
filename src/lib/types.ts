import type { ProductTier } from "@/lib/tiers";

export type ProductStatus = "available" | "sold";

export type MessageSender = "user" | "admin";

export interface Product {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  price: number;
  quantity: number;
  description: string | null;
  media_urls: string[] | null;
  video_url: string | null;
  video_poster_url?: string | null;
  video_trim_start?: number | null;
  video_trim_end?: number | null;
  category_id: string | null;
  status: ProductStatus;
  featured: boolean;
  /**
   * When `status` is sold, whether to include this piece in the homepage
   * “Already on wrists” strip. Defaults true when the column is absent.
   */
  on_wrist_spotlight: boolean;
  created_at: string;
  /** Optional per-product Square Checkout URL. Falls back to NEXT_PUBLIC_SQUARE_CHECKOUT_URL. */
  square_url?: string | null;
  /**
   * Catalog tier. `classic` = everyday collection, `super_tier` = premium line.
   * Defaults to `classic` for any product pre-dating the tier migration.
   */
  tier: ProductTier;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  image_url: string | null;
  parent_id: string | null;
  sort_order: number;
  active: boolean;
  created_at: string;
}

export interface HeroSlide {
  id: string;
  title: string;
  tagline: string | null;
  image_url: string | null;
  video_url: string | null;
  cta_label: string | null;
  cta_href: string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
}

export type AttachmentKind = "image" | "video";

export interface MessageRow {
  id: string;
  user_email: string;
  user_name?: string | null;
  message: string | null;
  sender: MessageSender;
  read_at?: string | null;
  attachment_url?: string | null;
  attachment_type?: AttachmentKind | null;
  attachment_name?: string | null;
  created_at: string;
}

export type PaymentMethod = "crypto" | "manual" | "stripe";
export type PaymentStatus =
  | "pending"
  | "paid"
  | "cancelled"
  | "expired"
  | "refunded";

export interface OrderRow {
  id: string;
  product_id: string | null;
  email: string | null;
  amount: number;
  created_at: string;
  payment_method?: PaymentMethod | null;
  payment_status?: PaymentStatus | null;
  payment_ref?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  notes?: string | null;
  shipping_address?: string | null;
  proof_url?: string | null;
  proof_mime?: string | null;
  proof_uploaded_at?: string | null;
  verified_at?: string | null;
  shipped_at?: string | null;
  tracking_number?: string | null;
  tracking_carrier?: string | null;
  admin_notes?: string | null;
}

