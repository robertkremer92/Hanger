import "server-only";
import { many } from "@/lib/db";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";

type Due = {
  id: string;
  number: number;
  payout_cents: number;
  refund_cents: number;
  stripe_charge_id: string | null;
  stripe_payment_intent_id: string | null;
  seller: { stripe_account_id: string | null } | null;
};

/**
 * Voert openstaande uitbetalingen en terugbetalingen uit bij Stripe.
 * Veilig om vaak aan te roepen: elke beweging heeft een idempotency key en wordt
 * pas als klaar gemarkeerd als Stripe het bevestigt.
 */
export async function processMoney(limit = 25) {
  const db = createAdminClient();
  const now = new Date().toISOString();
  const result = { payouts: 0, refunds: 0, errors: [] as string[] };

  const { data: payouts, error: e1 } = await many<Due>(db
    .from("orders")
    .select("id, number, payout_cents, refund_cents, stripe_charge_id, stripe_payment_intent_id, seller:profiles!orders_seller_id_fkey(stripe_account_id)")
    .is("stripe_transfer_id", null)
    .gt("payout_cents", 0)
    .lte("payout_due_at", now)
    .limit(limit));
  if (e1) result.errors.push(`payouts query: ${e1.message}`);

  for (const o of payouts ?? []) {
    const destination = o.seller?.stripe_account_id;
    if (!destination || !o.stripe_charge_id) {
      result.errors.push(`order ${o.number}: geen Stripe-account of charge`);
      continue;
    }
    try {
      const transfer = await stripe().transfers.create(
        {
          amount: o.payout_cents,
          currency: "eur",
          destination,
          source_transaction: o.stripe_charge_id,
          transfer_group: o.id,
          metadata: { order_id: o.id, order_number: String(o.number) },
        },
        { idempotencyKey: `payout-${o.id}` },
      );
      const { error } = await db.rpc("record_transfer", { p_order: o.id, p_transfer: transfer.id });
      if (error) throw error;
      result.payouts++;
    } catch (err) {
      result.errors.push(`payout order ${o.number}: ${(err as Error).message}`);
    }
  }

  const { data: refunds, error: e2 } = await many<Due>(db
    .from("orders")
    .select("id, number, payout_cents, refund_cents, stripe_charge_id, stripe_payment_intent_id, seller:profiles!orders_seller_id_fkey(stripe_account_id)")
    .is("stripe_refund_id", null)
    .gt("refund_cents", 0)
    .lte("refund_due_at", now)
    .limit(limit));
  if (e2) result.errors.push(`refunds query: ${e2.message}`);

  for (const o of refunds ?? []) {
    if (!o.stripe_payment_intent_id) {
      result.errors.push(`order ${o.number}: geen betaling om terug te storten`);
      continue;
    }
    try {
      const refund = await stripe().refunds.create(
        {
          payment_intent: o.stripe_payment_intent_id,
          amount: o.refund_cents,
          metadata: { order_id: o.id, order_number: String(o.number) },
        },
        { idempotencyKey: `refund-${o.id}` },
      );
      const { error } = await db.rpc("record_refund", { p_order: o.id, p_refund: refund.id });
      if (error) throw error;
      result.refunds++;
    } catch (err) {
      result.errors.push(`refund order ${o.number}: ${(err as Error).message}`);
    }
  }

  return result;
}
