import type { Category, Condition, Decision, DisputeReason } from "@/lib/domain/rules";
import type { OrderStatus } from "@/lib/domain/order-view";
import type { ShippingMethod } from "@/lib/domain/money";

export interface Profile {
  id: string;
  display_name: string;
  city: string;
  is_support: boolean;
  stripe_account_id: string | null;
  payouts_enabled: boolean;
  created_at: string;
}

export interface PublicProfile {
  id: string;
  display_name: string;
  city: string;
  created_at: string;
  id_verified: boolean;
  sales: number;
  rating: number | null;
  review_count: number;
}

export interface Listing {
  id: string;
  seller_id: string;
  title: string;
  brand: string;
  size: string;
  condition: Condition;
  category: Category;
  description: string;
  price_cents: number;
  allows_fit_returns: boolean;
  allows_pickup: boolean;
  pickup_city: string;
  risk_brand: boolean;
  status: "draft" | "active" | "reserved" | "sold" | "removed";
  published_at: string | null;
  created_at: string;
}

export interface ListingPhoto {
  id: string;
  listing_id: string;
  path: string;
  kind: "main" | "label" | "serial";
  position: number;
}

export interface Order {
  id: string;
  number: number;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  price_cents: number;
  fee_cents: number;
  shipping_cents: number;
  total_cents: number;
  shipping_method: ShippingMethod;
  status: OrderStatus;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  tracking_code: string | null;
  carrier_weight_grams: number | null;
  reserved_until: string;
  paid_at: string | null;
  ship_by: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  inspect_until: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  payout_cents: number;
  payout_due_at: string | null;
  stripe_transfer_id: string | null;
  refund_cents: number;
  refund_due_at: string | null;
  stripe_refund_id: string | null;
  created_at: string;
}

export interface Dispute {
  id: string;
  order_id: string;
  opened_by: string;
  reason: DisputeReason;
  description: string;
  status: "awaiting_seller" | "awaiting_review" | "decided" | "appealed" | "final";
  seller_respond_by: string;
  seller_response: string | null;
  seller_responded_at: string | null;
  decide_by: string | null;
  decision: Decision | null;
  decision_refund_cents: number | null;
  decision_motivation: string | null;
  decision_rule: string | null;
  decided_by: string | null;
  decided_at: string | null;
  appeal_until: string | null;
  appealed_by: string | null;
  appeal_text: string | null;
  appealed_at: string | null;
  appeal_decided_by: string | null;
  appeal_decided_at: string | null;
  appeal_motivation: string | null;
  finalized_at: string | null;
  return_tracking_code: string | null;
  return_shipped_at: string | null;
  return_received_at: string | null;
  created_at: string;
}

export interface Evidence {
  id: string;
  dispute_id: string;
  uploaded_by: string;
  path: string;
  kind: "photo" | "video";
  created_at: string;
}

export interface Message {
  id: number;
  listing_id: string;
  buyer_id: string;
  sender_id: string;
  body: string;
  flagged: boolean;
  created_at: string;
}

/** Resultaat van een server action: een foutmelding voor de gebruiker, of niets. */
export type ActionState = { error?: string; ok?: string } | undefined;
